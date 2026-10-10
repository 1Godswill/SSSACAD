// Adds the St. Stephen's native pieces to the Android project that `npx cap add android` generated:
// background alert service, boot receiver, plugin, bell sound, icons, permissions, app name.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const app = path.join(root, "android", "app", "src", "main");
const pkgPath = "com/ststephens/sssacad";

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (e.isDirectory()) copyDir(s, d); else fs.copyFileSync(s, d);
  }
}

// 1. Java + resources
copyDir(path.join(root, "native", "java"), path.join(app, "java", pkgPath));
copyDir(path.join(root, "native", "res"), path.join(app, "res"));
// the generated project also has vector launcher icons that would hide ours
for (const f of ["drawable/ic_launcher_background.xml", "drawable-v24/ic_launcher_foreground.xml"]) {
  fs.rmSync(path.join(app, "res", f), { force: true });
}
fs.rmSync(path.join(app, "res", "mipmap-anydpi-v26", "ic_launcher.xml.bak"), { force: true });

// 2. AndroidManifest.xml
const manPath = path.join(app, "AndroidManifest.xml");
let man = fs.readFileSync(manPath, "utf8");
if (!man.includes("AlertService")) {
  const perms = [
    '<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />',
    '<uses-permission android:name="android.permission.FOREGROUND_SERVICE_SPECIAL_USE" />',
    '<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />',
    '<uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />',
    '<uses-permission android:name="android.permission.VIBRATE" />',
    '<uses-permission android:name="android.permission.WAKE_LOCK" />',
    '<uses-permission android:name="android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS" />',
    '<uses-permission android:name="android.permission.SCHEDULE_EXACT_ALARM" />',
    '<uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" android:maxSdkVersion="28" />',
  ].filter((p) => !man.includes(p.match(/android:name="([^"]+)"/)[1])).join("\n    ");
  const components = `
        <service
            android:name=".AlertService"
            android:exported="false"
            android:foregroundServiceType="specialUse">
            <property
                android:name="android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE"
                android:value="Listens for school announcements and admin reminders" />
        </service>

        <receiver android:name=".BootReceiver" android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.BOOT_COMPLETED" />
                <action android:name="android.intent.action.MY_PACKAGE_REPLACED" />
            </intent-filter>
        </receiver>
    `;
  if (!/<\/application>/.test(man)) throw new Error("AndroidManifest.xml has no </application>");
  man = man.replace("</application>", components + "</application>");
  man = man.replace(/<application/, (perms ? perms + "\n\n    " : "") + "<application");
  // <uses-permission> must be direct children of <manifest>, before <application>; the line above puts them there.
  // Keep it tidy: if the template already had a permissions block further down, that is fine too.
  fs.writeFileSync(manPath, man);
}

// 3. App name (with a proper apostrophe)
const strPath = path.join(app, "res", "values", "strings.xml");
if (fs.existsSync(strPath)) {
  let s = fs.readFileSync(strPath, "utf8");
  s = s.replace(/(<string name="app_name">)[^<]*(<\/string>)/, "$1ST. STEPHEN\\'S SCHOOL Otuoke$2")
       .replace(/(<string name="title_activity_main">)[^<]*(<\/string>)/, "$1ST. STEPHEN\\'S SCHOOL Otuoke$2");
  fs.writeFileSync(strPath, s);
}

// 4. Android 15 draws apps edge-to-edge; keep the app's header below the status bar like the web version.
const stylesPath = path.join(app, "res", "values", "styles.xml");
if (fs.existsSync(stylesPath)) {
  let s = fs.readFileSync(stylesPath, "utf8");
  if (!s.includes("windowOptOutEdgeToEdgeEnforcement")) {
    s = s.replace(/(<style name="AppTheme\.NoActionBar"[^>]*>)/, '$1\n        <item name="android:windowOptOutEdgeToEdgeEnforcement">true</item>');
    fs.writeFileSync(stylesPath, s);
  }
}
// 5. Fixed signing key + automatic version, so every new APK installs OVER the old one and keeps its data.
//    (Without a fixed key, GitHub signs each build with a new random key and Android refuses the update.)
const gradlePath = path.join(root, "android", "app", "build.gradle");
if (fs.existsSync(gradlePath)) {
  let g = fs.readFileSync(gradlePath, "utf8");
  const ks = path.join(root, "signing", "sssacad.keystore").replace(/\\/g, "/");
  if (!g.includes("sssacad.keystore")) {
    if (!fs.existsSync(path.join(root, "signing", "sssacad.keystore"))) throw new Error("signing/sssacad.keystore is missing");
    const block = `android {
    signingConfigs {
        debug {
            storeFile file('${ks}')
            storePassword 'sssacad2026'
            keyAlias 'sssacad'
            keyPassword 'sssacad2026'
        }
    }`;
    if (!/^android\s*\{/m.test(g)) throw new Error("android { block not found in app/build.gradle");
    g = g.replace(/^android\s*\{/m, block);
  }
  const ver = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version;
  const [ma, mi, pa] = ver.split(".").map((n) => parseInt(n, 10) || 0);
  const code = ma * 10000 + mi * 100 + pa; // 3.12.0 -> 31200 (always rises with the version)
  g = g.replace(/versionCode(\s*=?\s*)\d+/, `versionCode$1${code}`)
       .replace(/versionName(\s*=?\s*)"[^"]*"/, `versionName$1"${ver}"`);
  fs.writeFileSync(gradlePath, g);
  console.log(`Signing key set; version ${ver} (code ${code}).`);
}
console.log("Android project patched.");

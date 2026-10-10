/* Android app glue (does nothing in a normal browser).
   When this page runs inside the Android app (Capacitor) it:
   - tells the phone's background listener which Sync URL / class / device to watch, so announcements and
     the Admin "Ring All Devices" buzz ring the phone even when the app is closed (AlertService.java);
   - makes downloads (backup file, Excel) save into the phone's Downloads folder;
   - makes the Print / Save-as-PDF buttons open Android's print dialog;
   - hides the "Install" button (the app is already installed). */
(function () {
  "use strict";
  const C = window.Capacitor;
  const isNative = !!(C && typeof C.isNativePlatform === "function" && C.isNativePlatform());
  if (!isNative) { window.NativeAlerts = null; return; }

  document.documentElement.classList.add("is-native-app");
  let P = null;
  try { P = (C.Plugins && C.Plugins.Alerts) || (C.registerPlugin ? C.registerPlugin("Alerts") : null); } catch (e) { P = null; }
  if (!P) { window.NativeAlerts = null; return; }

  const say = (m) => { try { if (typeof toast === "function") toast(m); } catch (e) { /* ignore */ } };

  /* ---------- background listener ---------- */
  let lastCfg = "";
  function sync(force) {
    try {
      const cfg = (typeof Sync !== "undefined" && Sync.getConfig && Sync.getConfig()) || null;
      const url = (cfg && cfg.url) || "";
      let classId = "";
      try {
        if (typeof shouldShowGate === "function" && !shouldShowGate() && typeof getCurrentClassId === "function") classId = getCurrentClassId() || "";
      } catch (e) { /* ignore */ }
      const deviceId = (typeof getDeviceId === "function") ? getDeviceId() : "";
      const key = url + "|" + classId + "|" + deviceId;
      if (!force && key === lastCfg) return;
      lastCfg = key;
      P.configure({ url: url, classId: classId, deviceId: deviceId }).catch(() => {});
    } catch (e) { /* ignore */ }
  }
  function setSeen(snap) {
    try { P.setSeen({ gate: (snap && snap.gate) || "", cls: (snap && snap.cls) || {} }).catch(() => {}); } catch (e) { /* ignore */ }
  }
  document.addEventListener("visibilitychange", () => { if (document.hidden) sync(true); });

  /* ---------- downloads -> Downloads folder ---------- */
  const MIMES = { xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", json: "application/json", pdf: "application/pdf", csv: "text/csv" };
  function saveBlobUrl(url, name) {
    fetch(url).then((r) => r.blob()).then((blob) => new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result).split(",")[1] || "");
      fr.onerror = reject;
      fr.readAsDataURL(blob);
    })).then((b64) => {
      const ext = (name.split(".").pop() || "").toLowerCase();
      return P.saveFile({ name: name, mime: MIMES[ext] || "application/octet-stream", data: b64 });
    }).then((r) => say("Saved to Downloads: " + ((r && r.name) || name)))
      .catch(() => say("Could not save the file"));
  }
  const origClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    if (this.download && this.href && this.href.indexOf("blob:") === 0) { saveBlobUrl(this.href, this.download); return; }
    return origClick.apply(this, arguments);
  };
  document.addEventListener("click", (ev) => {
    const a = ev.target && ev.target.closest ? ev.target.closest("a[download]") : null;
    if (a && a.href && a.href.indexOf("blob:") === 0) { ev.preventDefault(); saveBlobUrl(a.href, a.download); }
  }, true);

  /* ---------- printing / Save as PDF ---------- */
  window.print = function () {
    P.print({ name: "St Stephens School" }).catch(() => say("Could not open the print dialog"));
  };

  /* ---------- Install button ---------- */
  document.addEventListener("DOMContentLoaded", () => {
    const b = document.getElementById("installAppBtn");
    if (b) b.style.display = "none";
    setTimeout(() => sync(true), 1500);
    // Ask for the notification permission once, so alerts can show on the lock screen.
    setTimeout(() => {
      try {
        const LN = C.Plugins && C.Plugins.LocalNotifications;
        if (LN && LN.requestPermissions) LN.requestPermissions().catch(() => {});
      } catch (e) { /* ignore */ }
    }, 4000);
  });

  /* ---------- Admin card ---------- */
  function cardHtml() {
    return `
    <div class="card">
      <h2>📲 Alerts when the app is closed</h2>
      <p style="font-size:12.5px;color:var(--muted);">Announcements and the Admin buzz ring this phone even when the app is closed, as long as the phone is online and Sync is set up. To keep it reliable, allow notifications and set the app to <b>Unrestricted</b> battery use.</p>
      <p id="nativeAlertStatus" style="font-size:12.5px;margin:6px 0;">Checking…</p>
      <button class="btn secondary" id="nativeBatteryBtn">🔋 Allow background alerts (battery)</button>
      <button class="btn secondary" id="nativeNotifBtn">🔔 Notification settings</button>
    </div>`;
  }
  function wireCard(root) {
    const st = root.querySelector("#nativeAlertStatus");
    const refresh = () => P.status().then((s) => {
      if (!st) return;
      const ok = s.notificationsEnabled && s.batteryUnrestricted;
      st.innerHTML = (s.listening ? "✅ Listening in the background" : "⚠️ Not listening yet (set the Sync URL below)") +
        "<br>" + (s.notificationsEnabled ? "✅ Notifications allowed" : "⚠️ Notifications are off") +
        "<br>" + (s.batteryUnrestricted ? "✅ Battery: unrestricted" : "⚠️ Battery: restricted — tap the button below") + "";
    }).catch(() => { if (st) st.textContent = ""; });
    refresh();
    const b = root.querySelector("#nativeBatteryBtn");
    if (b) b.addEventListener("click", () => { P.requestBatteryExemption().catch(() => {}); setTimeout(refresh, 4000); });
    const n = root.querySelector("#nativeNotifBtn");
    if (n) n.addEventListener("click", () => P.openNotificationSettings().catch(() => {}));
  }

  window.NativeAlerts = { sync: sync, setSeen: setSeen, cardHtml: cardHtml, wireCard: wireCard };
})();

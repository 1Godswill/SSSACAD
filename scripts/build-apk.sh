#!/usr/bin/env bash
# Builds the St. Stephen's APK. Needs: Node 20+, JDK 21, and the Android SDK (ANDROID_HOME set).
# On GitHub this is run for you by .github/workflows/build-apk.yml.
set -euo pipefail
cd "$(dirname "$0")/.."

npm install --no-audit --no-fund

# Bundle the Excel library so spreadsheet export works without internet inside the app.
XLSX_URL="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"
if [ ! -s www/xlsx.full.min.js ]; then
  curl -fsSL --max-time 90 "$XLSX_URL" -o www/xlsx.full.min.js || rm -f www/xlsx.full.min.js
fi
if [ -s www/xlsx.full.min.js ]; then
  sed -i "s#$XLSX_URL#xlsx.full.min.js#" www/index.html
else
  echo "WARNING: could not download the Excel library; Excel export will need internet."
fi

[ -d android ] || npx cap add android
node scripts/patch-android.mjs
npx cap sync android

(cd android && chmod +x gradlew && ./gradlew --no-daemon assembleDebug)

mkdir -p build-output
cp android/app/build/outputs/apk/debug/app-debug.apk build-output/ststephens-school.apk
echo "Done: build-output/ststephens-school.apk"

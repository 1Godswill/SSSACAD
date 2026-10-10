# Getting the Android app (APK) — St. Stephen's School (v3.12.0)

## Build it on GitHub (about 10 minutes, nothing to install)

1. Create a new GitHub repository.
2. Unzip this package on your laptop. Open the unzipped folder, select EVERYTHING inside it
   (including the hidden `.github` folder and the `signing` folder) and drag it into
   *Add file > Upload files*. Wait until the whole file list appears, then **Commit changes**.
   - If `.github` will not upload: *Add file > Create new file*, type `.github/workflows/build-apk.yml`
     as the name, and paste the single line from `PASTE-THIS-WORKFLOW.txt`.
3. Open **Actions > Build Android APK > Run workflow**.
4. When the run is green, scroll to **Artifacts** at the bottom of the run page and download
   **ststephens-school-apk**. Unzip it: `ststephens-school.apk` is inside.
5. Send the APK to the phones, tap it, allow "install unknown apps", install.

The workflow finds the project folder by itself, so it still works if the files end up inside a sub-folder.
If no APK is produced, the run now FAILS (red) instead of passing quietly.

## Updating the app later
Change the files, raise the number in `package.json` ("version") and `www/version.js`, upload, run the workflow again.
The Android version number follows `package.json` automatically. Every build is signed with the same key
(`signing/sssacad.keystore`), so the new APK installs OVER the old one and keeps the data.
Do not delete or replace that keystore.

## IMPORTANT — first install of this build
Older APKs were signed with a random key GitHub made for that one build. Android will refuse to install this
build over such an app ("App not installed"). If that happens: in the OLD app make a backup (Admin), uninstall it,
install this APK, then restore the backup. After this one time, all future updates install over the top.

## First-time setup on each phone (for closed-app alerts)
1. Open the app, allow **Notifications**.
2. Admin > Sync: paste your Sync URL (see CLOUDFLARE-SETUP.md).
3. Admin > **Alerts when the app is closed** > **Allow background alerts (battery)** > Allow.
4. Tecno / Infinix / Itel / Xiaomi / Samsung: Settings > Apps > St. Stephen's > Battery > **Unrestricted**, and turn on **Autostart** if offered.

## What rings, and when
- **School announcement**: rings every phone that has Sync set up.
- **Class announcement**: rings the phone that has that class open.
- **Ring All Devices** (Admin): bell + vibration with your message on every online phone (within about 15 s).
- **Friday 12pm / 1pm / 2pm** register reminder: scheduled with Android, rings even when closed.

## Notes
- Printing / Save as PDF opens Android's print dialog (choose **Landscape** for the broadsheet).
- Backup and Excel files save to the phone's **Downloads** folder.

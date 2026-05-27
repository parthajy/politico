# Samvidya Field — Android APK

This is a thin Capacitor wrapper that turns the volunteer PWA at `/v/*` into a
standalone Android app. Volunteers install the APK once via direct link
(WhatsApp/sideload — no Play Store needed) and the app opens straight to the
field interface. They never see `/login`, `/firm`, `/party`, or the analyst
URLs.

The app loads its content from the live web app, so updates ship the moment
you deploy to the web — no APK rebuild required. Only the shell (icon,
splash, signing key) is bundled.

---

## One-time setup (on your dev machine)

```bash
# 1. Install Java 17 + Android Studio (with the Android SDK).
#    macOS:
brew install --cask zulu@17 android-studio

# 2. Set up environment
export JAVA_HOME=/Library/Java/JavaVirtualMachines/zulu-17.jdk/Contents/Home
export ANDROID_HOME=$HOME/Library/Android/sdk
export PATH=$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin

# 3. From the project root:
cd mobile
npm install
npx cap add android        # generates the android/ folder (first time only)
npx cap sync               # syncs config + plugins
npx cap open android       # opens Android Studio
```

In Android Studio: **Build → Generate Signed Bundle / APK → APK**, create a
keystore (save it somewhere safe, you'll need the same one for every update),
and let it build. Output APK lands in
`mobile/android/app/build/outputs/apk/release/app-release.apk`.

Distribute that file via WhatsApp / S3 link / direct download. Volunteers
sideload it (Settings → Allow install from unknown sources → tap the APK).

---

## Switching the target URL

Edit `mobile/capacitor.config.ts` and change `server.url` to your production
URL — that's where the WebView loads from on launch. For local QA you can
flip it to `http://10.0.2.2:3000/v` (Android emulator's host alias) and run
`npm run dev` in the parent dir.

---

## Updating

For content/UX changes: just deploy the web app. The Android app pulls from
`server.url` on every launch.

For shell changes (icon, splash, permissions, capacitor plugins): bump the
version in `mobile/android/app/build.gradle` (`versionCode` + `versionName`),
re-build the signed APK, and ship the new file.

---

## What's bundled

- Android shell (icon, splash, app name "Samvidya · Field")
- Capacitor runtime + Camera plugin (so the screenshot-upload field uses the
  native camera picker via `getUserMedia`)
- No bundled HTML/JS — everything loads from `server.url`

---

## Why not Play Store

- No Play Store review delay (each release = re-upload + 1-3 day wait).
- No 30%+ Google take, no developer account dance.
- Politicians' field teams change frequently — APK over WhatsApp is the
  Indian default.
- The app is gated behind a token only the analyst desk issues, so there's
  no risk of random discovery.

When you do want Play Store presence (for credibility), the same Android
project ships there too — see
[Capacitor Play Store guide](https://capacitorjs.com/docs/android/deploying-to-google-play).

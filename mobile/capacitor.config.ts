import type { CapacitorConfig } from "@capacitor/cli";

// Capacitor shell config for the Samvidya volunteer Android app.
//
// The app is a thin WebView pointing at the live /v PWA. The volunteer
// never sees /login, /firm, /party, or any analyst-facing route — the
// WebView's start URL is /v.
//
// Updates ship via web deploys; the APK is only rebuilt when the shell
// changes (icon, splash, permissions, plugin set).

const config: CapacitorConfig = {
  appId: "com.samvidya.field",
  appName: "Samvidya · Field",
  webDir: "public",
  // Live-load from the deployed web app. Switch to your prod URL when ready.
  // For Android emulator local dev: "http://10.0.2.2:3000/v"
  server: {
    url: "https://politico-mu.vercel.app/v",
    cleartext: false,
    androidScheme: "https",
  },
  android: {
    allowMixedContent: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 800,
      backgroundColor: "#0F2942",
      androidSplashResourceName: "splash",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
    },
  },
};

export default config;

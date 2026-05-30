import type { Metadata } from "next";
import "@/app/globals.css";
import { Toaster } from "sonner";

export const metadata: Metadata = {
  title: "Samvidya · Field",
  description: "Field volunteer app — Samvidya",
  manifest: "/v/manifest.webmanifest",
  themeColor: "#0F2942",
  icons: { icon: "/favicon.png", apple: "/favicon.png" },
};

// The /v/* routes form a separate PWA (own minimal nav, no sidebar). Mobile-first.
export default function VolunteerLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-surface">
      {children}
      <Toaster position="top-center" />
    </div>
  );
}

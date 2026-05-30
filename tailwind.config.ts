import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    container: {
      center: true,
      padding: "1.5rem",
      screens: { "2xl": "1400px" },
    },
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        navy: { DEFAULT: "var(--navy)", deep: "var(--navy-deep)" },
        bronze: { DEFAULT: "var(--bronze)", dark: "var(--bronze-dark)", soft: "var(--bronze-soft)" },
        sand: { DEFAULT: "var(--sand)", deep: "var(--sand-deep)" },
        surface: { DEFAULT: "var(--surface)", 2: "var(--surface-2)" },
        muted: { DEFAULT: "var(--muted)", 2: "var(--muted-2)" },
        border: { DEFAULT: "var(--border)", strong: "var(--border-strong)" },
        severity: {
          1: "var(--severity-1)",
          2: "var(--severity-2)",
          3: "var(--severity-3)",
        },
        positive: "var(--positive)",
        negative: "var(--negative)",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "Inter", "system-ui", "sans-serif"],
        serif: ["Georgia", "'Times New Roman'", "serif"],
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      boxShadow: {
        sm: "var(--shadow-sm)",
        DEFAULT: "var(--shadow-md)",
        md: "var(--shadow-md)",
        lg: "var(--shadow-lg)",
        soft: "var(--shadow-md)",
        "soft-lg": "var(--shadow-lg)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
export default config;

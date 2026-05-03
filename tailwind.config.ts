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
        bronze: { DEFAULT: "var(--bronze)", dark: "var(--bronze-dark)" },
        sand: { DEFAULT: "var(--sand)", deep: "var(--sand-deep)" },
        muted: "var(--muted)",
        border: "var(--border)",
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
        sm: "0 1px 2px 0 rgb(0 0 0 / 0.04)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
export default config;

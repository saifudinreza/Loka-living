import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        "bg-soft": "var(--bg-soft)",
        card: "var(--card)",
        ink: "var(--ink)",
        soft: "var(--soft)",
        olive: "var(--olive)",
        "olive-d": "var(--olive-d)",
        wood: "var(--wood)",
        line: "var(--line)",
      },
      fontFamily: {
        display: ["var(--font-display)", "serif"],
        sans: ["var(--font-body)", "system-ui", "sans-serif"],
      },
      borderRadius: {
        card: "18px",
        section: "22px",
      },
      transitionTimingFunction: {
        "ease-out-slow": "cubic-bezier(0.19,1,0.22,1)",
      },
      spacing: {
        section: "96px",
        "section-mobile": "64px",
      },
    },
  },
  plugins: [],
};
export default config;

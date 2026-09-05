import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: "#14110F",
          soft: "#1C1712",
          panel: "#1E1A16",
          line: "#2A241D",
        },
        paper: "#EDE7DC",
        muted: "#8A8175",
        ember: {
          DEFAULT: "#E4762F",
          bright: "#FF6A3D",
        },
        chakra: {
          DEFAULT: "#5FB4E0",
          bright: "#7FE6FF",
        },
        jade: "#63D48A",
        danger: "#FF4D4D",
      },
      fontFamily: {
        display: ["var(--font-display)", "serif"],
        body: ["var(--font-body)", "sans-serif"],
      },
      boxShadow: {
        glow: "0 0 32px -4px rgba(95, 180, 224, 0.35)",
        emberGlow: "0 0 32px -4px rgba(228, 118, 47, 0.35)",
      },
      keyframes: {
        "seal-spin": { to: { transform: "rotate(360deg)" } },
        "rise-fade": { from: { opacity: "0", transform: "translateY(10px)" }, to: { opacity: "1", transform: "translateY(0)" } },
        "pulse-ring": {
          "0%": { transform: "scale(0.9)", opacity: "0.9" },
          "100%": { transform: "scale(1.4)", opacity: "0" },
        },
      },
      animation: {
        "seal-spin": "seal-spin 40s linear infinite",
        "rise-fade": "rise-fade 0.5s ease-out",
        "pulse-ring": "pulse-ring 1.4s ease-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;

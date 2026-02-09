import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0a0b0f",
        night: "#0f1115",
        steel: "#2a2f3a",
        mist: "#a6adbb",
        ember: "#f25c54"
      },
      boxShadow: {
        glow: "0 0 80px rgba(242, 92, 84, 0.25)"
      }
    }
  },
  plugins: []
};

export default config;

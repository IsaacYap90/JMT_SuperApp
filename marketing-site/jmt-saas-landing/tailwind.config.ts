import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        brand: "#0096FF",
        ink: "#0B1220",
        cloud: "#F4F7FB",
      },
      boxShadow: {
        glow: "0 20px 60px rgba(0, 150, 255, 0.25)",
      },
    },
  },
  plugins: [],
};

export default config;

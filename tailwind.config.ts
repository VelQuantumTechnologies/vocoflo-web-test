import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        emeraldCanvas: "#0B1411",
        deskGreen: "#07261E",
        emeraldSurface: "#11201B",
        emeraldRaised: "#162A24",
        emeraldField: "#10392C",
        emeraldBorder: "#284237",
        emeraldStrongBorder: "#547463",
        creamInk: "#F1F0E6",
        softMintInk: "#E9F2EE",
        mutedSage: "#A5C2B3",
        sagePill: "#E1ECD6",
        sageInk: "#09291E",
        mintAccent: "#6FD1AD",
        mintHighlight: "#D4F7E9",
        mintMid: "#8FE3C4",
        mintDeep: "#1D8A68",
        warmGold: "#F9DF9C",
        warmGoldInk: "#281E04",
        softCoral: "#F29B92",
        coralContainer: "#4E1F1B",
        coralOnContainer: "#FFDAD6",
      },
      fontFamily: {
        display: ["Georgia", "Cambria", "Times New Roman", "serif"],
        sans: ["system-ui", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "Roboto", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;

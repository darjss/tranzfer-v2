import { defineConfig } from "@pandacss/dev";
import pandaPreset from "@pandacss/preset-panda";

export default defineConfig({
  exclude: [],
  include: ["./src/**/*.{ts,tsx}"],
  jsxFramework: "solid",
  outdir: "styled-system",
  preflight: true,
  presets: [pandaPreset],
  strictTokens: true,
  theme: {
    extend: {
      tokens: {
        colors: {
          amber: { value: "#d97b00" },
          blue: { value: "#2740c4" },
          ink: { value: "#17181c" },
          line: { value: "#ddd7c9" },
          mut: { value: "#6b6a62" },
          ok: { value: "#1f7a45" },
          panel: { value: "#fbf9f4" },
          paper: { value: "#f3efe6" },
          rust: { value: "#c8412b" },
        },
        easings: {
          smooth: { value: "cubic-bezier(0.23, 1, 0.32, 1)" },
          spring: { value: "cubic-bezier(0.34, 1.56, 0.64, 1)" },
        },
        fonts: {
          hand: { value: '"Caveat", cursive' },
          mono: { value: '"IBM Plex Mono", ui-monospace, monospace' },
          sans: { value: '"Archivo", system-ui, sans-serif' },
        },
      },
    },
  },
});

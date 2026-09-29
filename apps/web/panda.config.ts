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
        durations: {
          nudge: { value: "250ms" },
        },
        easings: {
          drawer: { value: "cubic-bezier(0.32, 0.72, 0, 1)" },
          smooth: { value: "cubic-bezier(0.23, 1, 0.32, 1)" },
          spring: { value: "cubic-bezier(0.34, 1.56, 0.64, 1)" },
        },
        fontSizes: {
          "11": { value: "11px" },
          "13": { value: "13px" },
          "15": { value: "15px" },
          "17": { value: "17px" },
          "22": { value: "22px" },
          "26": { value: "26px" },
          "40": { value: "40px" },
        },
        fonts: {
          hand: { value: '"Caveat", cursive' },
          mono: { value: '"IBM Plex Mono", ui-monospace, monospace' },
          sans: { value: '"Archivo", system-ui, sans-serif' },
        },
        letterSpacings: {
          label: { value: ".08em" },
          snug: { value: "-0.02em" },
          title: { value: "-0.035em" },
        },
        lineHeights: {
          compact: { value: "1.1" },
        },
        radii: {
          card: { value: "20px" },
          photo: { value: "3px" },
        },
        shadows: {
          // Loose sheets of paper: a hairline edge and a long soft drop.
          paper: {
            value:
              "inset 0 1px 0 #fff, 0 0 0 1px {colors.line}, 0 40px 80px -48px rgba(23,24,28,.5)",
          },
          paperGhost: { value: "0 0 0 1px {colors.line}, 0 30px 60px -40px rgba(23,24,28,.4)" },
          paperLift: {
            value:
              "inset 0 1px 0 #fff, 0 0 0 1px {colors.line}, 0 18px 36px -24px rgba(23,24,28,.35)",
          },
          paperRow: {
            value: "0 0 0 1px {colors.line}, 0 1px 2px rgba(23,24,28,.05)",
          },
          ring: { value: "0 0 0 1px {colors.line}" },
          ringGoogle: { value: "0 0 0 1px #747775" },
          ringInk: { value: "0 0 0 1px {colors.ink}" },
        },
        sizes: {
          narrow: { value: "380px" },
          page: { value: "1180px" },
          pane: { value: "860px" },
          sheet: { value: "480px" },
        },
        spacing: {
          "0.75": { value: "3px" },
          "30": { value: "120px" },
          "6.5": { value: "26px" },
        },
      },
    },
  },
});

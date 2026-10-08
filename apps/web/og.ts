import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { Resvg } from "@resvg/resvg-js";
import satori from "satori";
import type { Plugin } from "vite-plus";

// The social card (og.png, 1200x630), drawn with Satori at build time so it
// always matches the landing's copy and palette. Satori reads woff, not woff2,
// so it uses the static Fontsource cuts.

const require = createRequire(import.meta.url);
const font = (file: string) => readFileSync(require.resolve(`@fontsource/${file}`));

const paper = "#f3efe6";
const panel = "#fbf9f4";
const ink = "#17181c";
const mut = "#6b6a62";
const line = "#ddd7c9";
const blue = "#2740c4";
const rust = "#c8412b";
const ok = "#1f7a45";

type Style = Record<string, string | number>;
interface Node {
  type: string;
  props: { style?: Style; children?: Child; src?: string };
}
type Child = Node | string | (Node | string)[];

const el = (type: string, style: Style, children?: Child): Node => ({
  props: { children, style: { display: "flex", ...style } },
  type,
});

const mark = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 14.5A3.5 3.5 0 0 0 10.5 11h-5A3.5 3.5 0 0 0 2 14.5v5A3.5 3.5 0 0 0 5.5 23h5a3.5 3.5 0 0 0 3.5-3.5" stroke="${blue}" stroke-opacity=".4"/><path d="M18 17.5a3.5 3.5 0 0 0 3.5 3.5h5a3.5 3.5 0 0 0 3.5-3.5v-5A3.5 3.5 0 0 0 26.5 9h-5A3.5 3.5 0 0 0 18 12.5" stroke="${blue}"/><path d="M6 16h20" stroke="${ink}"/><path d="M23.2 13.2 26 16l-2.8 2.8" stroke="${ink}"/></svg>`)}`;

const underline = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 260 26" preserveAspectRatio="none"><path d="M4 18 C 60 6, 120 22, 178 10 S 240 12, 256 8" fill="none" stroke="${blue}" stroke-width="5" stroke-linecap="round" opacity=".8"/></svg>`)}`;

const img = (src: string, style: Style): Node => ({ props: { src, style }, type: "img" });

const check = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="${ok}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8.5 6.5 12 13 4.5"/></svg>`)}`;

const fileRow = (name: string, meta: string, done: boolean) =>
  el(
    "div",
    {
      alignItems: "center",
      background: "white",
      border: `1px solid ${line}`,
      borderRadius: 14,
      justifyContent: "space-between",
      padding: "14px 18px",
    },
    [
      el("div", { flexDirection: "column" }, [
        el("div", { color: ink, fontSize: 21, fontWeight: 600 }, name),
        el("div", { color: mut, fontFamily: "Plex", fontSize: 16, marginTop: 2 }, meta),
      ]),
      done
        ? el(
            "div",
            {
              alignItems: "center",
              background: "rgba(31,122,69,.12)",
              borderRadius: 999,
              color: ok,
              fontSize: 18,
              fontWeight: 700,
              height: 30,
              justifyContent: "center",
              width: 30,
            },
            img(check, { height: 14, width: 14 }),
          )
        : el("div", { color: blue, fontFamily: "Plex", fontSize: 18 }, "72%"),
    ],
  );

const card = el(
  "div",
  {
    background: panel,
    border: `1px solid ${line}`,
    borderRadius: 26,
    boxShadow: "0 30px 60px rgba(23,24,28,.22)",
    flexDirection: "column",
    gap: 12,
    padding: 26,
    transform: "rotate(-2.5deg)",
    width: 440,
  },
  [
    el("div", { alignItems: "flex-start", justifyContent: "space-between", marginBottom: 4 }, [
      el("div", { flexDirection: "column" }, [
        el("div", { color: ink, fontSize: 24, fontWeight: 600 }, "EP04 dailies"),
        el("div", { color: mut, fontSize: 17, marginTop: 2 }, "To Marcus · editor in Berlin"),
      ]),
      el(
        "div",
        {
          background: "white",
          border: `1px solid ${line}`,
          borderRadius: 999,
          color: ink,
          fontSize: 15,
          fontWeight: 600,
          padding: "6px 12px",
          whiteSpace: "nowrap",
        },
        "Wi-Fi back · resumed",
      ),
    ]),
    fileRow("EP04_A-Cam", "214 GB · 1,842 clips", true),
    fileRow("EP04_B-Cam", "188 GB · 1,204 clips", true),
    fileRow("Drone_Day2", "61 GB · 97 clips", false),
    el(
      "div",
      {
        alignItems: "center",
        borderTop: `1px solid ${line}`,
        justifyContent: "space-between",
        marginTop: 6,
        paddingTop: 16,
      },
      [
        el(
          "div",
          { color: mut, fontFamily: "Plex", fontSize: 15, whiteSpace: "nowrap" },
          "463 GB · link lives 7 days",
        ),
        el(
          "div",
          {
            background: blue,
            borderRadius: 12,
            color: "white",
            fontSize: 17,
            fontWeight: 600,
            padding: "10px 18px",
            whiteSpace: "nowrap",
          },
          "Copy link",
        ),
      ],
    ),
  ],
);

const page = el(
  "div",
  {
    backgroundColor: paper,
    backgroundImage: "linear-gradient(rgba(0,0,0,.045) 1px, transparent 1px)",
    backgroundSize: "100% 32px",
    fontFamily: "Archivo",
    height: 630,
    position: "relative",
    width: 1200,
  },
  [
    el("div", {
      background: "rgba(39,64,196,.12)",
      height: 630,
      left: 72,
      position: "absolute",
      top: 0,
      width: 1,
    }),
    el(
      "div",
      {
        flexDirection: "column",
        height: 630,
        justifyContent: "space-between",
        padding: "58px 0 50px 104px",
        width: 720,
      },
      [
        el("div", { alignItems: "center", gap: 12 }, [
          img(mark, { height: 46, width: 46 }),
          el("div", { color: ink, fontSize: 34, fontWeight: 700, letterSpacing: -0.5 }, "tranzfer"),
        ]),
        el("div", { flexDirection: "column" }, [
          el(
            "div",
            { color: ink, fontSize: 72, fontWeight: 600, letterSpacing: -3, lineHeight: 0.98 },
            "Send the whole",
          ),
          el("div", { flexDirection: "column", position: "relative", width: 200 }, [
            el(
              "div",
              {
                color: blue,
                fontSize: 72,
                fontStyle: "italic",
                fontWeight: 600,
                letterSpacing: -3,
                lineHeight: 0.98,
              },
              "card.",
            ),
            img(underline, { bottom: -4, height: 16, left: -4, position: "absolute", width: 180 }),
          ]),
          el(
            "div",
            { color: ink, fontSize: 72, fontWeight: 600, letterSpacing: -3, lineHeight: 0.98 },
            "Built to resume.",
          ),
          el(
            "div",
            { color: "#3a3b40", fontSize: 25, lineHeight: 1.35, marginTop: 24, width: 500 },
            "Hundreds of gigabytes from your browser. The Wi-Fi drops, the laptop sleeps, and it carries on.",
          ),
        ]),
        el(
          "div",
          { color: mut, fontFamily: "Plex", fontSize: 19, letterSpacing: 1.5 },
          "TRANZFER.APP · 20 GB FREE",
        ),
      ],
    ),
    el(
      "div",
      {
        alignItems: "center",
        height: 630,
        justifyContent: "center",
        position: "absolute",
        right: 52,
        top: 14,
      },
      [card],
    ),
    el(
      "div",
      {
        color: rust,
        flexDirection: "column",
        fontFamily: "Caveat",
        fontSize: 30,
        lineHeight: 1.05,
        opacity: 0.7,
        position: "absolute",
        right: 90,
        top: 24,
        transform: "rotate(-4deg)",
      },
      [el("div", {}, "tested at 100 GB,"), el("div", {}, "with 8 things going wrong.")],
    ),
  ],
);

export const renderOgImage = async () => {
  const svg = await satori(page, {
    fonts: [
      {
        data: font("archivo/files/archivo-latin-600-normal.woff"),
        name: "Archivo",
        style: "normal",
        weight: 600,
      },
      {
        data: font("archivo/files/archivo-latin-700-normal.woff"),
        name: "Archivo",
        style: "normal",
        weight: 700,
      },
      {
        data: font("archivo/files/archivo-latin-600-italic.woff"),
        name: "Archivo",
        style: "italic",
        weight: 600,
      },
      {
        data: font("caveat/files/caveat-latin-600-normal.woff"),
        name: "Caveat",
        style: "normal",
        weight: 600,
      },
      {
        data: font("ibm-plex-mono/files/ibm-plex-mono-latin-500-normal.woff"),
        name: "Plex",
        style: "normal",
        weight: 500,
      },
    ],
    height: 630,
    width: 1200,
  });
  return new Resvg(svg, { fitTo: { mode: "width", value: 1200 } }).render().asPng();
};

// The brand mark on a paper tile, for places that want a PNG: Safari's home
// screen, search result favicons and the JSON-LD logo.
const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="${paper}"/><g transform="translate(12 12) scale(1.25)" fill="none" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 14.5A3.5 3.5 0 0 0 10.5 11h-5A3.5 3.5 0 0 0 2 14.5v5A3.5 3.5 0 0 0 5.5 23h5a3.5 3.5 0 0 0 3.5-3.5" stroke="${blue}" stroke-opacity=".4"/><path d="M18 17.5a3.5 3.5 0 0 0 3.5 3.5h5a3.5 3.5 0 0 0 3.5-3.5v-5A3.5 3.5 0 0 0 26.5 9h-5A3.5 3.5 0 0 0 18 12.5" stroke="${blue}"/><path d="M6 16h20M23.2 13.2 26 16l-2.8 2.8" stroke="${ink}"/></g></svg>`;

const icons = { "apple-touch-icon.png": 180, "favicon-48.png": 48, "icon-512.png": 512 };

/** Emits /og.png and the PNG icons into the client build. */
export const ogImage = (): Plugin => ({
  applyToEnvironment: (environment) => environment.name === "client",
  async generateBundle() {
    this.emitFile({ fileName: "og.png", source: await renderOgImage(), type: "asset" });
    for (const [fileName, size] of Object.entries(icons)) {
      const source = new Resvg(iconSvg, { fitTo: { mode: "width", value: size } }).render().asPng();
      this.emitFile({ fileName, source, type: "asset" });
    }
  },
  name: "tranzfer:og-image",
});

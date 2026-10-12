// Landing photos at 240, 400 and 800 px wide, encoded at build time. Stills
// use 240 and 400 (1x and 2x of their 100 to 190 px widths); cards use 400 and
// 800. The browser picks one candidate from the srcset.
export const photos = import.meta.glob<ResponsiveImage>("./assets/*.webp", {
  eager: true,
  import: "default",
  query: { as: "img", w: "240;400;800" },
});

// PROTOTYPE, throwaway. Floating bar to hop between landing variants.
(() => {
  const v = [
    ["darkroom", "PROTOTYPE-landing.html"],
    ["paper", "PROTOTYPE-landing-paper.html"],
    ["instrument", "PROTOTYPE-landing-instrument.html"],
    ["gallery", "PROTOTYPE-landing-gallery.html"],
    ["studio", "PROTOTYPE-landing-studio.html"],
  ];
  const here = location.pathname.split("/").pop();
  const bar = document.createElement("div");
  bar.style.cssText =
    "position:fixed;bottom:14px;left:50%;transform:translateX(-50%);z-index:9999;display:flex;gap:4px;padding:5px;border-radius:999px;background:rgba(20,20,20,.9);backdrop-filter:blur(10px);font:12px/1 ui-monospace,monospace;box-shadow:0 10px 30px -10px rgba(0,0,0,.6)";
  bar.innerHTML = v
    .map(
      ([n, f]) =>
        `<a href="${f}" style="color:${f === here ? "#111" : "#bbb"};background:${f === here ? "#fff" : "transparent"};padding:8px 12px;border-radius:999px;text-decoration:none">${n}</a>`,
    )
    .join("");
  document.body.append(bar);
})();

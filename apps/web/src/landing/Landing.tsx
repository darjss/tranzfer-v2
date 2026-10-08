import { onSettled } from "solid-js";
import { css } from "styled-system/css";
import Faq from "./Faq";
import FinalCta from "./FinalCta";
import Hero from "./Hero";
import HowItWorks from "./HowItWorks";
import Pricing from "./Pricing";
import Receipts from "./Receipts";
import Survives from "./Survives";
import Ticker from "./Ticker";
import { page } from "./styles";
import { SiteFooter, SiteHeader } from "../ui/Site";
import "./landing.css";

/** The home page: sections in reading order, revealed as they scroll in. */
export default function Landing() {
  let root: HTMLDivElement | undefined;

  onSettled(() => {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        }
      },
      { rootMargin: "-40px" },
    );
    for (const el of root?.querySelectorAll(".rv,.chip,.ink,.hand") ?? []) {
      io.observe(el);
    }
    return () => {
      io.disconnect();
    };
  });

  return (
    <div
      ref={(el) => {
        root = el;
      }}
      class={css({ overflowX: "clip" })}
    >
      <div class={page}>
        <SiteHeader />
        <Hero />
      </div>
      <Ticker />
      <div class={page}>
        <Survives />
        <Receipts />
        <HowItWorks />
        <Pricing />
        <Faq />
        <FinalCta />
        <SiteFooter />
      </div>
    </div>
  );
}

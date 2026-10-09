import { css } from "styled-system/css";
import Compare from "./Compare";
import Faq from "./Faq";
import FinalCta from "./FinalCta";
import Hero from "./Hero";
import HowItWorks from "./HowItWorks";
import MadeFor from "./MadeFor";
import Pricing from "./Pricing";
import Survives from "./Survives";
import Ticker from "./Ticker";
import { page } from "./styles";
import Reveal from "../ui/Reveal";
import { SiteFooter } from "../ui/SiteFooter";
import { SiteHeader } from "../ui/SiteHeader";
import "./landing.css";

/** The home page: sections in reading order, revealed as they scroll in. */
export default function Landing() {
  return (
    <Reveal class={css({ overflowX: "clip" })}>
      <div class={page}>
        <SiteHeader />
      </div>
      <main id="content">
        <div class={page}>
          <Hero />
        </div>
        <Ticker />
        <div class={page}>
          <Survives />
          <HowItWorks />
          <MadeFor />
          <Pricing />
          <Compare />
          <Faq />
          <FinalCta />
        </div>
      </main>
      <div class={page}>
        <SiteFooter />
      </div>
    </Reveal>
  );
}

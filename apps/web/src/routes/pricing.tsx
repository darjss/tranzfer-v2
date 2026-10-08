import { Link, Meta, Title } from "@solidjs/meta";
import { css } from "styled-system/css";
import Faq from "../landing/Faq";
import Pricing from "../landing/Pricing";
import "../landing/landing.css";
import PriceCalculator from "../marketing/PriceCalculator";
import Reveal from "../ui/Reveal";
import { SitePage } from "../ui/Site";

export default function PricingPage() {
  return (
    <SitePage>
      <Title>Pricing · Tranzfer</Title>
      <Meta
        name="description"
        content="Flat monthly plans for sending large files: Free, Starter $15, Pro $29, Studio $69. Compare what the same deliveries cost elsewhere."
      />
      <Link rel="canonical" href="https://tranzfer.app/pricing" />
      <Reveal>
        <main>
          <Pricing />
          <div class={css({ pb: "10" })}>
            <PriceCalculator />
          </div>
          <Faq />
        </main>
      </Reveal>
    </SitePage>
  );
}

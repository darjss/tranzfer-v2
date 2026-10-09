import { Link, Meta, Title } from "@solidjs/meta";
import { css } from "styled-system/css";
import Faq from "../landing/Faq";
import Pricing from "../landing/Pricing";
import "../landing/landing.css";
import PriceCalculator from "../marketing/PriceCalculator";
import Reveal from "../ui/Reveal";
import { SitePage } from "../ui/Site";

const description =
  "Flat monthly plans for sending large files: Free, Starter $15, Pro $29, Studio $69. Compare what the same deliveries cost elsewhere.";

export default function PricingPage() {
  return (
    <SitePage>
      <Title>Pricing for sending large files · Tranzfer</Title>
      <Meta name="description" content={description} />
      <Meta property="og:description" content={description} />
      <Meta property="og:title" content="Pricing for sending large files · Tranzfer" />
      <Meta property="og:url" content="https://tranzfer.app/pricing" />
      <Link rel="canonical" href="https://tranzfer.app/pricing" />
      <Reveal>
        <main id="content">
          <Pricing heading="h1" />
          <div class={css({ pb: "10" })}>
            <PriceCalculator />
          </div>
          <Faq />
        </main>
      </Reveal>
    </SitePage>
  );
}

import { Link, Meta, Title } from "@solidjs/meta";
import { PlanId, plans } from "@tranzfer/contracts";
import { bytes } from "../dashboard/format";
import Landing from "../landing/Landing";
import { faq } from "../landing/faq";
import { supportEmail } from "../ui/support";

const site = "https://tranzfer.app";
const description =
  "Send hundreds of gigabytes from your browser. If the Wi-Fi drops or the laptop sleeps, Tranzfer resumes instead of restarting. Your editor gets one link.";

// Facts search engines and answer engines can parse: who we are, what the app
// does, what each plan costs, and the FAQ shown on the page.
const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@id": `${site}/#org`,
      "@type": "Organization",
      email: supportEmail,
      logo: `${site}/icon-512.png`,
      name: "Tranzfer",
      url: `${site}/`,
    },
    {
      "@id": `${site}/#website`,
      "@type": "WebSite",
      name: "Tranzfer",
      publisher: { "@id": `${site}/#org` },
      url: `${site}/`,
    },
    {
      "@type": "SoftwareApplication",
      applicationCategory: "BusinessApplication",
      description,
      name: "Tranzfer",
      offers: PlanId.literals.map((id) => ({
        "@type": "Offer",
        description: `${bytes(plans[id].activeBytes)} of active transfer space, links up to ${plans[id].maxRetentionDays} days`,
        name: plans[id].name,
        price: plans[id].monthlyUsd,
        priceCurrency: "USD",
        url: `${site}/#pricing`,
      })),
      operatingSystem: "Any modern web browser",
      publisher: { "@id": `${site}/#org` },
      url: `${site}/`,
    },
    {
      "@type": "FAQPage",
      mainEntity: faq.map((item) => ({
        "@type": "Question",
        acceptedAnswer: { "@type": "Answer", text: item.a },
        name: item.q,
      })),
    },
  ],
};

export default function Home() {
  return (
    <>
      <Title>Tranzfer · Send huge files. Built to resume.</Title>
      <Meta name="description" content={description} />
      <Meta property="og:title" content="Tranzfer · Send huge files. Built to resume." />
      <Meta property="og:description" content={description} />
      <Meta property="og:type" content="website" />
      <Meta property="og:url" content={`${site}/`} />
      <Link rel="canonical" href={`${site}/`} />
      <script type="application/ld+json">{JSON.stringify(structuredData)}</script>
      <Landing />
    </>
  );
}

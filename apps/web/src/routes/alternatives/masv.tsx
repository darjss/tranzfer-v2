import { plans } from "@tranzfer/contracts";
import Article from "../../guides/Article";
import { CompareTable, Ranked } from "../../guides/Alternatives";
import { updated } from "../../guides/guides";
import { checked, quote } from "../../marketing/prices";

const ranked = ["tranzfer", "filemail", "wetransfer", "smash", "dropbox", "drive"] as const;

// Cents only when there are any: $15, $96.25.
const usd = new Intl.NumberFormat("en-US", {
  currency: "USD",
  style: "currency",
  trailingZeroDisplay: "stripIfInteger",
});
// What MASV's pay-as-you-go costs for a month of sends, from the same rules as /pricing.
const masvFor = (sizeGb: number, count: number) =>
  usd.format(quote(sizeGb, count).find((q) => q.id === "masv")?.price ?? 0);

const faq = [
  {
    a: `On MASV's pay-as-you-go plan, ${masvFor(1000, 1)}: the first 15 GB each month are free, then $0.25 per GB. On Tranzfer it's Pro at $${plans.pro.monthlyUsd} a month if the whole terabyte is live at once, or less if your deliveries don't overlap.`,
    q: "How much does it cost to send 1 TB a month with MASV?",
  },
  {
    a: "In the browser, MASV keeps retrying through a dropped connection, but its help page says a closed tab or a computer crash means starting over. The MASV desktop app recovers from most interruptions, reboots included.",
    q: "Does MASV resume uploads?",
  },
  {
    a: "Tranzfer, Filemail and Smash all sell flat monthly plans. Tranzfer resumes in the browser and holds up to 3 TB live at once. Filemail Business takes any size and resumes through its desktop app. Smash Pro has no size limit.",
    q: "Is there a MASV alternative without per-GB pricing?",
  },
  {
    a: "Yes, if you need upload portals for clients, integrations that forward files to S3 or Frame.io, a desktop app, or you send rarely enough that paying per gigabyte beats any monthly plan.",
    q: "Should I stay with MASV?",
  },
];

export default function MasvAlternatives() {
  return (
    <Article
      answer={
        <p>
          If MASV's per-GB bill or a browser upload that restarts after a closed tab is the problem,
          Tranzfer is the closest alternative, with flat monthly plans and resume in the browser on
          every plan. Filemail is the pick if you want a desktop app at a flat price. Stay with MASV
          if you rely on its portals or integrations.
        </p>
      }
      description="MASV alternatives for sending large files, ranked: Tranzfer, Filemail, WeTransfer, Smash, Dropbox Transfer and Google Drive. Flat plans vs per-GB pricing, and what happens when an upload breaks."
      eyebrow="Alternatives"
      faq={faq}
      path="/alternatives/masv"
      related={[
        { href: "/vs/masv", label: "Tranzfer vs MASV" },
        { href: "/alternatives/wetransfer", label: "WeTransfer alternatives" },
        { href: "/pricing", label: "Price calculator" },
        { href: "/features/resume", label: "How resume works" },
        { href: "/for/studios", label: "For studios & agencies" },
      ]}
      title="MASV alternatives for large files"
      updated={updated}
    >
      <p>
        We make Tranzfer, so weigh our ranking with that in mind. MASV is a serious tool and for
        some teams it's the right one; there's a section on that below. Every fact about another
        service links to the page it came from.
      </p>

      <h2>Why do people look for a MASV alternative?</h2>
      <p>
        Two reasons come up. The first is the bill. MASV charges $0.25 per GB after 15 GB free each
        month, so four 100 GB deliveries cost {masvFor(100, 4)} and a terabyte costs{" "}
        {masvFor(1000, 1)}. Annual bundles bring the rate down, starting at $58 a month for 250 GB
        with a 12-month commitment.
      </p>
      <p>
        The second is the browser. MASV's own help page says that{" "}
        <a
          href="https://help.massive.io/en/what-happens-if-my-connection-is-interrupted-during-upload"
          rel="nofollow noopener"
        >
          "if you close your MASV browser tab or your computer crashes you will have to start over"
        </a>
        . Their desktop app fixes that. If you'd rather not install one on every shooter's laptop,
        it's a real gap.
      </p>

      <h2>How do the alternatives compare?</h2>
      <p>
        The last column is four 100 GB deliveries in a month, one live at a time. Prices are USD on
        monthly billing, checked {checked}.
      </p>
      <CompareTable ids={["masv", ...ranked]} />

      <h2>The alternatives, ranked</h2>
      <Ranked ids={ranked} />

      <h2>Which one should you pick?</h2>
      <ul>
        <li>
          <strong>You send big deliveries every week</strong> and want a predictable bill: Tranzfer.
          Pro is ${plans.pro.monthlyUsd} a month for 1 TB live at once, however much passes through
          it.
        </li>
        <li>
          <strong>You want a desktop app at a flat price</strong>: Filemail Business, which takes
          any size.
        </li>
        <li>
          <strong>Your files are under 1 TB and recipients know WeTransfer</strong>: WeTransfer
          Ultimate.
        </li>
        <li>
          <strong>You want the cheapest flat plan</strong> and can live without documented resume:
          Smash Pro at $10 a month.
        </li>
        <li>
          <strong>You already pay for Dropbox or Google Workspace</strong>: try what you have before
          adding anything.
        </li>
      </ul>

      <h2>When is MASV still the better pick?</h2>
      <ul>
        <li>
          You collect files from clients through upload portals, or need them forwarded to S3,
          Frame.io or MediaSilo automatically. Tranzfer doesn't do request links yet.
        </li>
        <li>You want a desktop app. Tranzfer runs in the browser only.</li>
        <li>
          You send rarely. If a month is 30 GB, MASV costs a few dollars and a monthly plan is
          wasted.
        </li>
        <li>Your packages are bigger than Tranzfer's largest plan, 3 TB live at once.</li>
      </ul>
      <p>
        The row-by-row version is on <a href="/vs/masv">Tranzfer vs MASV</a>, and the{" "}
        <a href="/pricing">price calculator</a> runs your own numbers against MASV, Smash and
        Filemail.
      </p>
    </Article>
  );
}

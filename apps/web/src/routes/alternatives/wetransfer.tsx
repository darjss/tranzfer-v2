import Article from "../../guides/Article";
import { CompareTable, Ranked } from "../../guides/Alternatives";
import { updated } from "../../guides/guides";
import { checked } from "../../marketing/prices";

const ranked = ["tranzfer", "masv", "filemail", "smash", "dropbox", "drive"] as const;

const faq = [
  {
    a: "WeTransfer's Ultimate plan takes up to 1 TB in one transfer. Tranzfer has no per-file cap; it limits how much is live at once, from 20 GB on Free to 3 TB on Studio. MASV charges per GB with no cap on how much you send.",
    q: "What can send bigger files than WeTransfer?",
  },
  {
    a: "WeTransfer's free plan allows 10 transfers or 3 GB in a rolling 30 days. Tranzfer Free holds 20 GB live at once with no cap on how many you send. Smash Free takes 2 GB at full priority and queues bigger transfers.",
    q: "What's the best free WeTransfer alternative?",
  },
  {
    a: "Tranzfer resumes in the browser on every plan, including after a closed tab or a crash. MASV and Filemail recover through their desktop apps. WeTransfer, Smash, Dropbox and Google Drive don't document resuming a browser upload.",
    q: "Which WeTransfer alternative resumes a failed upload?",
  },
  {
    a: "Not with Tranzfer, MASV, WeTransfer or Dropbox Transfer; each says recipients just open the link. Google Drive needs no account when you share a file with anyone who has the link.",
    q: "Does the person I send to need an account?",
  },
];

export default function WeTransferAlternatives() {
  return (
    <Article
      answer={
        <p>
          For files over a few gigabytes, the best WeTransfer alternative is the one that doesn't
          make you start over when the upload breaks. We'd pick Tranzfer for hundreds of gigabytes
          from a browser, MASV if you want a desktop app and pay per GB, and Filemail or Smash for
          cheaper flat plans on smaller sends.
        </p>
      }
      description="WeTransfer alternatives for large files, ranked: Tranzfer, MASV, Filemail, Smash, Dropbox Transfer and Google Drive. Prices, size limits and what happens when an upload breaks."
      eyebrow="Alternatives"
      faq={faq}
      path="/alternatives/wetransfer"
      related={[
        { href: "/vs/wetransfer", label: "Tranzfer vs WeTransfer" },
        { href: "/alternatives/masv", label: "MASV alternatives" },
        { href: "/guides/how-to-send-large-files", label: "How to send large files" },
        { href: "/tools/upload-time-calculator", label: "Upload time calculator" },
        { href: "/pricing", label: "Price calculator" },
      ]}
      title="WeTransfer alternatives for large files"
      updated={updated}
    >
      <p>
        We make Tranzfer, so read our ranking with that in mind. Every fact about the other services
        comes from their own pages, linked under each one. Where their pages don't say something, we
        say that rather than guess.
      </p>

      <h2>Why look past WeTransfer for big files?</h2>
      <p>
        WeTransfer is fine for a few gigabytes. The free plan stops at 10 transfers or 3 GB in a
        rolling 30 days, and Starter at 300 GB in 30 days. A single day of 4K footage can be more
        than that. The bigger problem is a 150 GB upload: their troubleshooting page asks for a
        stable connection and a device that doesn't go to sleep, and says nothing about resuming. On
        a long upload, that's a lot to ask.
      </p>

      <h2>How do the alternatives compare?</h2>
      <p>
        The last column is a heavy month: four 100 GB deliveries, one live at a time. Prices are USD
        on monthly billing, checked {checked}.
      </p>
      <CompareTable ids={ranked} />

      <h2>The alternatives, ranked for large files</h2>
      <Ranked ids={ranked} />

      <h2>Which one should you pick?</h2>
      <ul>
        <li>
          <strong>You send 50 GB to 3 TB from a laptop</strong> and can't babysit it: Tranzfer. It's
          the one we built for that night.
        </li>
        <li>
          <strong>Your team wants a desktop app</strong> or client upload portals and sends
          irregularly: MASV.
        </li>
        <li>
          <strong>You want files to stay up for good</strong> and don't mind installing an app:
          Filemail Pro or Business.
        </li>
        <li>
          <strong>You send under 2 GB and want it free</strong>: Smash, or WeTransfer itself.
        </li>
        <li>
          <strong>You already pay for Dropbox or Google Workspace</strong> and send under 100 GB:
          use what you have.
        </li>
      </ul>

      <h2>When is WeTransfer still the right pick?</h2>
      <p>
        When your recipient already expects a WeTransfer link and you send a few gigabytes at a
        time. When you want links that stay up longer than two weeks, which Ultimate allows and
        Tranzfer doesn't. And when you need team storage bigger than 3 TB. There's a row-by-row
        comparison on <a href="/vs/wetransfer">Tranzfer vs WeTransfer</a>.
      </p>
    </Article>
  );
}

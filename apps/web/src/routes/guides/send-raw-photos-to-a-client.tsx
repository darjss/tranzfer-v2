import { plans } from "@tranzfer/contracts";
import { bytes } from "../../dashboard/format";
import Article from "../../guides/Article";
import { guides, updated } from "../../guides/guides";

const page = guides["send-raw-photos-to-a-client"];

const faq = [
  {
    a: "Not with a transfer link. What you upload is what they download, byte for byte. Chat apps do recompress photos, which is why originals shouldn't travel through them.",
    q: "Will my RAW files get compressed?",
  },
  {
    a: "Only if you send them. Lightroom Classic keeps edits in its catalog unless you save them to XMP files. Capture One keeps them in its own settings folder. DNG files carry them inside the file.",
    q: "Will my client see my edits on the RAW files?",
  },
  {
    a: "On a Mac, Preview and Photos open most RAW formats. On Windows, the Photos app needs Microsoft's Raw Image Extension. Very new cameras can take a while to be supported, so include full-size JPEGs too.",
    q: "What can my client open RAW files with?",
  },
  {
    a: `Usually 50 to 150 GB for a few thousand RAW files. Tranzfer Starter holds ${bytes(plans.starter.activeBytes)} live at once for $${plans.starter.monthlyUsd} a month. Free holds ${bytes(plans.free.activeBytes)}.`,
    q: "How big is a wedding in RAW?",
  },
  {
    a: `Up to ${plans.free.maxRetentionDays} days on Tranzfer Free, ${plans.starter.maxRetentionDays} on Starter and ${plans.pro.maxRetentionDays} on Pro and Studio. You can cancel a link early. Tell your client to save a copy, because the files are deleted when the link ends.`,
    q: "How long does my client have to download?",
  },
];

export default function SendRawPhotos() {
  return (
    <Article
      answer={
        <p>
          Send RAW photos by putting the originals in one folder, with their XMP sidecars and a set
          of full-size JPEGs, and sending that folder as a download link. Keep your gallery for
          proofing; hand over the originals through a transfer.
        </p>
      }
      description="How to send RAW photos to a client: what to put in the folder, how to keep your edits, how big a shoot gets, and how to send it as one link."
      eyebrow="Guide"
      faq={faq}
      path="/guides/send-raw-photos-to-a-client"
      related={[
        { href: "/for/photographers", label: "For photographers" },
        { href: "/features/folders", label: "Send whole folders" },
        { href: "/features/share-links", label: "One link, no account" },
        { href: "/guides/how-to-send-large-files", label: "How to send large files" },
      ]}
      title={page.title}
      updated={updated}
    >
      <h2>Should I send RAW files at all?</h2>
      <p>
        Check your contract first. Plenty of photographers deliver edited JPEGs and keep the RAWs,
        and that's a fair business decision. When the client is paying for originals, though, a
        retoucher, an agency or a brand team needs the actual RAW files, not exports. This guide is
        for that case.
      </p>

      <h2>What goes in the folder?</h2>
      <ul>
        <li>
          <strong>The RAW files</strong>, as they came off the card: CR3, NEF, ARW, RAF, DNG. Don't
          rename them after you've edited, or the edits won't line up.
        </li>
        <li>
          <strong>The XMP sidecars</strong>, if you edited in Lightroom Classic. Lightroom keeps
          edits in its catalog. Select the photos and choose Metadata, then Save Metadata to Files,
          and an .xmp file appears next to each RAW. DNG files store this inside the file.
        </li>
        <li>
          <strong>The Capture One settings</strong>, if you work in sessions. Send the whole session
          folder, CaptureOne subfolder included, and your adjustments come with it.
        </li>
        <li>
          <strong>Full-size JPEGs</strong> in their own folder. Not everyone has a RAW editor, and
          it lets the client check they got the right shoot in seconds.
        </li>
      </ul>
      <p>
        A layout that works: <code>Client-Shoot/RAW</code>, <code>Client-Shoot/JPEG</code>,{" "}
        <code>Client-Shoot/Selects</code>. Whatever you choose, the folders arrive the way you
        sorted them.
      </p>

      <h2>How big will it be?</h2>
      <p>
        Look at one RAW file on your card and multiply by the count. Size depends on the sensor and
        on whether the camera compresses, so a file can be 25 MB on one body and over 100 MB on
        another. A few thousand frames from a wedding usually lands between 50 and 150 GB. Add the
        JPEGs on top.
      </p>
      <p>
        At that size, email and most free plans are out. WeTransfer Free allows 3 GB in 30 days.
        Tranzfer Free holds {bytes(plans.free.activeBytes)} at once, and Starter holds{" "}
        {bytes(plans.starter.activeBytes)}.
      </p>

      <h2>How do I send it?</h2>
      <ol>
        <li>Sort the folder as above and check the total size.</li>
        <li>
          Sign in to Tranzfer with Google, drag the whole folder in, and pick how long the link
          lasts.
        </li>
        <li>
          Let it run. If the Wi-Fi drops, it retries. If you close the laptop, it carries on when it
          wakes. If the browser crashes, pick the same folder again and only what's missing goes up.
        </li>
        <li>
          Send the link to your client with the expiry date and one line on what's inside. They
          download without an account.
        </li>
      </ol>

      <h2>Why not just use my gallery?</h2>
      <p>
        Galleries like Pixieset and Pic-Time are good at what they're for: proofing, favourites,
        print sales, a client experience. Handing over a folder of originals with sidecars isn't
        that job. Use the gallery for viewing and a transfer link for the files, and nobody has to
        wonder which version is which.
      </p>
      <p>
        If you'd rather keep a delivery up for months, a shared Google Drive or Dropbox folder does
        that, at the cost of the files sitting in your storage. Tranzfer links end on schedule and
        the files are deleted, so last year's weddings aren't floating around. More on that on the{" "}
        <a href="/for/photographers">page for photographers</a>.
      </p>
    </Article>
  );
}

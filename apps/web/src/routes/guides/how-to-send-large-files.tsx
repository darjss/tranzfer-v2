import { plans } from "@tranzfer/contracts";
import { bytes } from "../../dashboard/format";
import Article, { table, tableWrap } from "../../guides/Article";
import { guides, updated } from "../../guides/guides";

const page = guides["how-to-send-large-files"];

const faq = [
  {
    a: "Not as an attachment. Personal Gmail stops at 25 MB and swaps anything bigger for a Google Drive link. Upload the file to a transfer service and email the link instead.",
    q: "Can I email a 1 GB file?",
  },
  {
    a: `Tranzfer Free holds ${bytes(plans.free.activeBytes)} live at once. Send that much, cancel the link once it's downloaded, and the space comes back for the next batch. Smash Free also takes bigger files but queues anything over 2 GB behind paying users.`,
    q: "How do I send 50 GB for free?",
  },
  {
    a: "Usually not. Video, photos and audio are already compressed, so a zip barely shrinks them. It also needs as much free disk as the files themselves and adds a long wait before the upload starts. Send the folder as it is.",
    q: "Should I zip large files before sending?",
  },
  {
    a: "On Tranzfer, no. Every part that arrived is kept. After a dropped connection it retries by itself, after sleep it carries on, and after a crash or closed tab you pick the same files and only the missing parts upload.",
    q: "What if my upload fails halfway?",
  },
  {
    a: "No. On Tranzfer, MASV, WeTransfer and Dropbox Transfer the recipient opens the link and downloads.",
    q: "Does the recipient need an account?",
  },
];

export default function HowToSendLargeFiles() {
  return (
    <Article
      answer={
        <p>
          To send a large file, upload it to a file transfer service and send the recipient the
          download link. Email stops at about 25 MB, most free transfer plans stop between 2 and 5
          GB, and past 50 GB the thing that matters most is whether the upload survives an
          interruption.
        </p>
      }
      description="How to send large files, from 1 GB to 1 TB: which tool fits which size, how to prepare the files, and how to keep a long upload from starting over."
      eyebrow="Guide"
      faq={faq}
      path="/guides/how-to-send-large-files"
      related={[
        { href: "/features/send-large-files", label: "Send huge files" },
        { href: "/features/resume", label: "Resume anything" },
        { href: "/features/folders", label: "Send whole folders" },
        { href: "/alternatives/wetransfer", label: "WeTransfer alternatives" },
        { href: "/tools/upload-time-calculator", label: "Upload time calculator" },
      ]}
      title={page.title}
      updated={updated}
    >
      <h2>What counts as a large file?</h2>
      <p>
        It depends on what you're sending it through. Personal Gmail allows 25 MB of attachments and
        turns anything bigger into a{" "}
        <a href="https://support.google.com/mail/answer/6584" rel="nofollow noopener">
          Google Drive link
        </a>
        . Free transfer plans cap you somewhere between 2 and 5 GB. A wedding in RAW is 50 to 150
        GB. An hour of 4K ProRes 422 HQ is about 318 GB. Pick the tool by the size you actually
        have.
      </p>
      <div class={tableWrap}>
        <table class={table}>
          <thead>
            <tr>
              <th scope="col">Size</th>
              <th scope="col">What works</th>
              <th scope="col">Watch out for</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">Under 25 MB</th>
              <td>An email attachment</td>
              <td>Work accounts can set lower limits</td>
            </tr>
            <tr>
              <th scope="row">25 MB to 2 GB</th>
              <td>Any free transfer service, or a shared Drive or Dropbox link</td>
              <td>WeTransfer Free allows 10 transfers or 3 GB in 30 days</td>
            </tr>
            <tr>
              <th scope="row">2 to 50 GB</th>
              <td>A paid transfer plan, Tranzfer Free up to 20 GB, Dropbox Transfer on Plus</td>
              <td>Uploads now take an hour or more on a home connection</td>
            </tr>
            <tr>
              <th scope="row">50 GB to 3 TB</th>
              <td>A transfer tool that resumes: Tranzfer, MASV, Filemail's desktop app</td>
              <td>An upload that restarts from zero after a drop or a closed tab</td>
            </tr>
            <tr>
              <th scope="row">Over 3 TB</th>
              <td>MASV, Filemail Business, or a drive in the post</td>
              <td>Per-GB bills; check the price before you start</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>How do I send a large file, step by step?</h2>
      <ol>
        <li>
          <strong>Check the total size.</strong> On a Mac, select the folder and press Command-I. On
          Windows, right-click and choose Properties. Windows shows GiB, which reads about 7%
          smaller than the GB transfer services count in.
        </li>
        <li>
          <strong>Keep the folder as it is.</strong> Don't zip it and don't split it. Folder names
          tell the other person what's what, and zipping 200 GB of video saves almost nothing.
        </li>
        <li>
          <strong>Pick a tool that fits the size</strong> from the table above. Past 50 GB, check
          what happens when the upload is interrupted. Most services don't say.
        </li>
        <li>
          <strong>Give the upload a fair chance.</strong> Plug in power and, if you can, an ethernet
          cable. Pause cloud backups and sync apps, which compete for the same upload speed.
        </li>
        <li>
          <strong>Send the link and say when it expires.</strong> Tranzfer links last up to{" "}
          {plans.free.maxRetentionDays} days on Free, {plans.starter.maxRetentionDays} on Starter
          and {plans.pro.maxRetentionDays} on Pro and Studio. Then the files are deleted.
        </li>
      </ol>

      <h2>How long will the upload take?</h2>
      <p>
        Upload speed decides it, and it's usually much lower than your download speed. At 50 Mbps,
        100 GB takes about 4 hours 27 minutes with the line running flat out. At 20 Mbps it's over
        11 hours. Put your own numbers into the{" "}
        <a href="/tools/upload-time-calculator">upload time calculator</a>, or read{" "}
        <a href="/guides/how-long-to-upload-100-gb">how long it takes to upload 100 GB</a> for what
        slows it down.
      </p>

      <h2>What happens if the upload fails halfway?</h2>
      <p>
        This is where tools differ most, and where they say least. A long upload will meet a Wi-Fi
        blip, a laptop lid or a browser update. Some services keep retrying while the tab stays
        open. Fewer survive the tab closing. MASV's help page says that in the browser a closed tab
        or a crash means starting over; their desktop app recovers.
      </p>
      <p>
        Tranzfer keeps every part that arrived. A dropped connection retries by itself. A sleeping
        laptop carries on when it wakes. After a crash or a closed tab, open Tranzfer, pick the same
        files, and only the missing parts upload. It checks that the files you picked match what
        already arrived and refuses a different file with the same name. We test that on a 100 GB
        upload with eight failures forced on purpose, including a browser crash and a 20-minute
        freeze.
      </p>

      <h2>Which service should I use?</h2>
      <p>
        For a few gigabytes, use whatever your recipient already knows. For hundreds of gigabytes
        from a browser, we built <a href="/features/send-large-files">Tranzfer</a> for exactly that.
        If you'd rather compare first, there's a ranked list of{" "}
        <a href="/alternatives/wetransfer">WeTransfer alternatives</a> with prices and limits, and
        one for <a href="/alternatives/masv">MASV alternatives</a>. If you send footage, photos or
        sessions, the guides for <a href="/guides/send-large-video-files-to-an-editor">video</a>,{" "}
        <a href="/guides/send-raw-photos-to-a-client">RAW photos</a> and{" "}
        <a href="/guides/send-pro-tools-or-logic-session">Pro Tools and Logic sessions</a> cover
        what to put in the folder.
      </p>
    </Article>
  );
}

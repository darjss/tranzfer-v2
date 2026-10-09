import { plans } from "@tranzfer/contracts";
import { bytes } from "../../dashboard/format";
import Article, { table, tableWrap } from "../../guides/Article";
import { guides, updated } from "../../guides/guides";

const page = guides["send-large-video-files-to-an-editor"];

const prores = "https://www.apple.com/final-cut-pro/docs/Apple_ProRes.pdf";

const faq = [
  {
    a: "No. Send the camera originals as they came off the card. Re-exporting costs you quality and time, and your editor loses the metadata the camera wrote. If the originals are too big to send tonight, send proxies first and the originals after.",
    q: "Should I compress footage before sending it to my editor?",
  },
  {
    a: "Yes, if the files are inside it. Send the shoot folder and Tranzfer keeps every subfolder. On desktop Chrome or Edge your editor picks a folder once and the whole delivery saves into it, sorted the way you sent it.",
    q: "Can I send a whole camera card?",
  },
  {
    a: "Plan on hundreds of gigabytes. Apple's ProRes white paper puts ProRes 422 HQ at about 79 GB an hour in 1080p at 24 fps and 318 GB an hour in UHD 4K at 24 fps.",
    q: "How big is an hour of 4K footage?",
  },
  {
    a: `Tranzfer Starter holds ${bytes(plans.starter.activeBytes)} live at once for $${plans.starter.monthlyUsd} a month, and Pro holds ${bytes(plans.pro.activeBytes)} for $${plans.pro.monthlyUsd}. Every plan, Free included, resumes interrupted uploads.`,
    q: "What does it cost to send a 300 GB shoot?",
  },
  {
    a: "No. They open the link and download. They don't sign up or install anything.",
    q: "Does my editor need an account?",
  },
];

export default function SendVideoToEditor() {
  return (
    <Article
      answer={
        <p>
          Send footage to an editor by uploading the whole shoot folder, exactly as it came off the
          cards, to a transfer service that resumes interrupted uploads, then send them the link.
          Don't re-export, don't zip, and start the upload before you go to bed.
        </p>
      }
      description="How to send large video files to an editor: prepare the card folders, pick a transfer that resumes, and hand over one link. With real file sizes for ProRes and 4K."
      eyebrow="Guide"
      faq={faq}
      path="/guides/send-large-video-files-to-an-editor"
      related={[
        { href: "/for/videographers", label: "For videographers" },
        { href: "/for/editors", label: "For editors" },
        { href: "/for/creators", label: "For creators & YouTubers" },
        { href: "/features/folders", label: "Send whole folders" },
        { href: "/features/resume", label: "Resume anything" },
      ]}
      title={page.title}
      updated={updated}
    >
      <h2>How big is the footage?</h2>
      <p>
        Bigger than people expect, and it decides everything else. These are Apple's target rates
        from the{" "}
        <a href={prores} rel="nofollow noopener">
          ProRes white paper
        </a>
        . Camera RAW formats vary by camera and setting, so check your own card.
      </p>
      <div class={tableWrap}>
        <table class={table}>
          <thead>
            <tr>
              <th scope="col">Format</th>
              <th scope="col">1080p, 24 fps</th>
              <th scope="col">UHD 4K, 24 fps</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">ProRes 422 Proxy</th>
              <td>16 GB an hour</td>
              <td>65 GB an hour</td>
            </tr>
            <tr>
              <th scope="row">ProRes 422</th>
              <td>53 GB an hour</td>
              <td>212 GB an hour</td>
            </tr>
            <tr>
              <th scope="row">ProRes 422 HQ</th>
              <td>79 GB an hour</td>
              <td>318 GB an hour</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        Two cameras shooting UHD ProRes 422 HQ for three hours is close to 2 TB. That rules out most
        free plans before you start.
      </p>

      <h2>How do I prepare footage for an editor?</h2>
      <ol>
        <li>
          <strong>Offload and verify the cards.</strong> Use a copy tool that checks what it copied,
          like Hedge, ShotPut Pro or Resolve's Clone tool. A transfer can only deliver what's on
          your drive.
        </li>
        <li>
          <strong>Keep the card structure.</strong> Copy each card into its own folder and leave the
          inside alone. Many cameras write metadata and sidecar files next to the clips, and editing
          apps read the card as a whole.
        </li>
        <li>
          <strong>Name folders the way your editor thinks.</strong> Day, camera, card is a safe
          default: <code>Day1/A-cam/A001</code>, <code>Day1/Sound</code>. Put the sound rolls, LUTs
          and any notes in the same shoot folder.
        </li>
        <li>
          <strong>Decide on proxies.</strong> If your editor wants to start tomorrow and the
          originals won't finish overnight, send proxies first. They're about a fifth of the size of
          ProRes 422 HQ. Send the originals after.
        </li>
        <li>
          <strong>Send the shoot folder in one go</strong> and pick how long the link lasts. Then
          send your editor the link with a line on what's in it.
        </li>
      </ol>

      <h2>Why does resume matter so much for video?</h2>
      <p>
        Because a 300 GB upload on a 50 Mbps line runs for over 13 hours, and nothing stays perfect
        for 13 hours. The hotel Wi-Fi drops. The laptop sleeps. macOS installs an update. If the
        tool starts over every time, you can lose a whole night.
      </p>
      <p>
        Tranzfer keeps every part that already arrived. It retries through a drop by itself and
        carries on after sleep. If the browser crashes or you close the tab, open Tranzfer, pick the
        same folder, and only the missing parts go up. It checks the files match what already
        arrived first, so a different take with the same name can't sneak in.
      </p>

      <h2>Which tools work for sending footage?</h2>
      <div class={tableWrap}>
        <table class={table}>
          <thead>
            <tr>
              <th scope="col">Tool</th>
              <th scope="col">Good for</th>
              <th scope="col">The catch</th>
            </tr>
          </thead>
          <tbody>
            <tr class="us">
              <th scope="row">Tranzfer</th>
              <td>Whole shoots from a browser, flat monthly price</td>
              <td>No desktop app; links last 14 days at most</td>
            </tr>
            <tr>
              <th scope="row">MASV</th>
              <td>Desktop app, client upload portals</td>
              <td>$0.25 per GB; the browser starts over after a closed tab</td>
            </tr>
            <tr>
              <th scope="row">WeTransfer</th>
              <td>Short clips and exports</td>
              <td>Starter allows 300 GB in 30 days</td>
            </tr>
            <tr>
              <th scope="row">Google Drive or Dropbox</th>
              <td>Teams already sharing a drive</td>
              <td>Files count against your storage until you delete them</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        The full ranked list, with sources, is on{" "}
        <a href="/alternatives/wetransfer">WeTransfer alternatives</a>.
      </p>

      <h2>What does my editor do with the link?</h2>
      <p>
        They open it and see every file and folder in the delivery. No account, no app. On desktop
        Chrome or Edge, Download all asks for a folder once and saves everything into it with its
        subfolders, and carries on if the download is interrupted. Other browsers download file by
        file. There's more on that side of it on the <a href="/for/editors">page for editors</a>.
      </p>
    </Article>
  );
}

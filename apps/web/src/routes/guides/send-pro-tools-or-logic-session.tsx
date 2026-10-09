import { plans } from "@tranzfer/contracts";
import { bytes } from "../../dashboard/format";
import Article, { table, tableWrap } from "../../guides/Article";
import { guides, updated } from "../../guides/guides";

const page = guides["send-pro-tools-or-logic-session"];

const faq = [
  {
    a: "Some of the audio lived outside the session folder. In Pro Tools, use File, Save Copy In with All audio files ticked, and send the copy. In Logic, use File, Project Management, Consolidate before you send.",
    q: "My mixer says files are missing. What happened?",
  },
  {
    a: "No. A transfer link delivers the WAV and AIFF files exactly as they are, byte for byte. Never send a session through anything that converts audio.",
    q: "Will the audio get compressed?",
  },
  {
    a: "Stems. Export every track as a full-length audio file starting at the same point, at the session's sample rate and bit depth. Any DAW can line them up.",
    q: "What if my mixer uses a different DAW?",
  },
  {
    a: `Tranzfer Free holds ${bytes(plans.free.activeBytes)} at once, which fits a song or an EP. Starter holds ${bytes(plans.starter.activeBytes)} for $${plans.starter.monthlyUsd} a month, enough for an album with every take.`,
    q: "How much does it cost to send a session?",
  },
];

export default function SendSession() {
  return (
    <Article
      answer={
        <p>
          To send a Pro Tools session, use Save Copy In with all audio files included and send the
          whole session folder. To send a Logic project, consolidate it so the audio sits inside the
          project, then compress the .logicx and send that. Either way, add a note with the sample
          rate, tempo and plugins.
        </p>
      }
      description="How to send a Pro Tools session or Logic Pro project to a mixer: collect every audio file, handle plugins, add notes, and send the folder without bouncing or splitting it."
      eyebrow="Guide"
      faq={faq}
      path="/guides/send-pro-tools-or-logic-session"
      related={[
        { href: "/for/music", label: "For music & audio" },
        { href: "/features/folders", label: "Send whole folders" },
        { href: "/features/resume", label: "Resume anything" },
        { href: "/guides/how-to-send-large-files", label: "How to send large files" },
      ]}
      title={page.title}
      updated={updated}
    >
      <h2>How do I send a Pro Tools session?</h2>
      <p>
        A Pro Tools session is a folder. Inside it are the .ptx session file and folders such as
        Audio Files, Clip Groups, Bounced Files and Session File Backups. The .ptx file on its own
        is useless to your mixer; it points at audio it doesn't contain.
      </p>
      <ol>
        <li>
          <strong>Collect everything.</strong> If you imported audio without copying it, some of it
          lives outside the session folder. Choose File, then Save Copy In. Under Items to copy,
          tick All audio files, and video files if there's picture.
        </li>
        <li>
          <strong>Pick the session format.</strong> The same dialog lets you save for an older
          version of Pro Tools if your mixer hasn't updated.
        </li>
        <li>
          <strong>Deal with plugins.</strong> If a track's sound depends on a plugin or virtual
          instrument your mixer may not own, commit or bounce that track and keep the original muted
          next to it.
        </li>
        <li>
          <strong>Send the copied session folder</strong>, not the one you work in, so nothing
          changes while it uploads.
        </li>
      </ol>

      <h2>How do I send a Logic project?</h2>
      <ol>
        <li>
          <strong>Consolidate.</strong> Choose File, then Project Management, then Consolidate. Tick
          the options to copy audio files and any sampler instruments, Alchemy samples or impulse
          responses you used. Now the project holds everything it needs.
        </li>
        <li>
          <strong>Check how it's saved.</strong> Logic saves projects as a package by default.
          That\'s one .logicx item that's really a folder inside. If yours is saved as a folder
          instead, send the whole project folder.
        </li>
        <li>
          <strong>Compress the package.</strong> Right-click the .logicx in Finder and choose
          Compress. Audio barely shrinks, so the zip is about the same size, but a package then
          travels as one file and opens with a double-click on the other end.
        </li>
        <li>
          <strong>Bounce in place</strong> any track that relies on a third-party plugin your mixer
          may not have, and keep the original track muted.
        </li>
      </ol>

      <h2>What should I include besides the session?</h2>
      <ul>
        <li>A text file with the sample rate, bit depth, tempo, key and the plugins you used.</li>
        <li>A rough mix bounce, so your mixer hears what you hear.</li>
        <li>References, if you have them, in their own folder.</li>
        <li>
          Stems as a fallback, every track exported from the same start point, full length. If the
          session won't open, the mix can still start.
        </li>
      </ul>

      <h2>How big is a session?</h2>
      <p>
        Smaller than video, bigger than email. Uncompressed audio grows with tracks, length and
        sample rate:
      </p>
      <div class={tableWrap}>
        <table class={table}>
          <thead>
            <tr>
              <th scope="col">Mono track, per minute</th>
              <th scope="col">Size</th>
              <th scope="col">48 tracks, 4 minutes</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">24-bit, 48 kHz</th>
              <td>8.6 MB</td>
              <td>1.7 GB</td>
            </tr>
            <tr>
              <th scope="row">32-bit float, 48 kHz</th>
              <td>11.5 MB</td>
              <td>2.2 GB</td>
            </tr>
            <tr>
              <th scope="row">24-bit, 96 kHz</th>
              <td>17.3 MB</td>
              <td>3.3 GB</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        Alternate takes and playlists multiply that. A 12-song album at 24-bit, 48 kHz is around 20
        GB before takes, and twice that at 96 kHz. That's past most free plans, and past the point
        where you want an upload to start over because the Wi-Fi blinked.
      </p>

      <h2>How do I send the folder?</h2>
      <p>
        Drag the session folder, or the zipped Logic project, onto Tranzfer and send. Folders keep
        their structure, so Audio Files stays Audio Files on the other end. If the connection drops,
        it retries. If the browser crashes, pick the same files and only what's missing uploads.
        Your mixer opens the link and downloads, no account. There's more on the{" "}
        <a href="/for/music">page for music and audio</a>.
      </p>
      <p>
        Keep sessions out of chat apps and anything else that converts audio on the way. A transfer
        link hands over the same bytes you uploaded.
      </p>
    </Article>
  );
}

import { For } from "solid-js";
import Article, { table, tableWrap } from "../../guides/Article";
import { guides, updated } from "../../guides/guides";
import { duration, planningShare, uploadSeconds } from "../../tools/UploadTimeCalculator";

const page = guides["how-long-to-upload-100-gb"];

const speeds = [10, 20, 50, 100, 200, 500, 1000];
const hundredGb = 100e9;
const at = (mbps: number, gb = 100) => duration(uploadSeconds(gb * 1e9, mbps));

const faq = [
  {
    a: `${at(1000)} at a full gigabit. In practice, plan for ${duration(uploadSeconds(hundredGb, 1000 * planningShare))} or more, because few uploads hold the full line speed for long.`,
    q: "How long does 100 GB take on gigabit internet?",
  },
  {
    a: `${at(100, 1000)} at 100 Mbps with the line flat out, and ${at(50, 1000)} at 50 Mbps. A terabyte is an overnight job on almost any home connection, so use a tool that resumes.`,
    q: "How long does it take to upload 1 TB?",
  },
  {
    a: "Divide by 8. Internet speeds are in megabits per second (Mbps); file sizes are in megabytes (MB). 100 Mbps moves 12.5 MB a second.",
    q: "What's the difference between Mbps and MB/s?",
  },
  {
    a: "The recipient's download speed decides that, not yours. Home connections usually download several times faster than they upload, so the download is often the short part.",
    q: "Does the download take as long as the upload?",
  },
];

export default function UploadHundredGb() {
  return (
    <Article
      answer={
        <p>
          Uploading 100 GB takes about {at(50)} at 50 Mbps, {at(100)} at 100 Mbps and {at(500)} at
          500 Mbps, if your connection holds its full upload speed the whole way. Real uploads run
          slower, so plan for about a quarter longer.
        </p>
      }
      description="How long it takes to upload 100 GB at 10 Mbps to 1 Gbps, why real uploads run slower than the math, and how to make a big upload finish sooner."
      eyebrow="Guide"
      faq={faq}
      path="/guides/how-long-to-upload-100-gb"
      related={[
        { href: "/tools/upload-time-calculator", label: "Upload time calculator" },
        { href: "/features/resume", label: "Resume anything" },
        { href: "/features/send-large-files", label: "Send huge files" },
        { href: "/guides/how-to-send-large-files", label: "How to send large files" },
      ]}
      title={page.title}
      updated={updated}
    >
      <h2>100 GB at common upload speeds</h2>
      <p>
        The first column is the math: 100 GB is 800,000 megabits, divided by your speed. The second
        assumes the upload holds {Math.round(planningShare * 100)}% of that speed, which is a safer
        number to plan around. For any other size, use the{" "}
        <a href="/tools/upload-time-calculator">upload time calculator</a>.
      </p>
      <div class={tableWrap}>
        <table class={table}>
          <thead>
            <tr>
              <th scope="col">Upload speed</th>
              <th scope="col">At full speed</th>
              <th scope="col">At {Math.round(planningShare * 100)}%</th>
              <th scope="col">MB per second</th>
            </tr>
          </thead>
          <tbody>
            <For each={speeds}>
              {(mbps) => (
                <tr>
                  <th scope="row">{mbps >= 1000 ? `${mbps / 1000} Gbps` : `${mbps} Mbps`}</th>
                  <td>{at(mbps)}</td>
                  <td>{duration(uploadSeconds(hundredGb, mbps * planningShare))}</td>
                  <td>{mbps / 8} MB/s</td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </div>

      <h2>What's my upload speed?</h2>
      <p>
        Run a speed test, like{" "}
        <a href="https://speed.cloudflare.com" rel="nofollow noopener">
          Cloudflare's
        </a>{" "}
        or{" "}
        <a href="https://fast.com" rel="nofollow noopener">
          fast.com
        </a>
        , from the computer you'll upload from, on the same Wi-Fi or cable. Use the upload number,
        not the download. On cable and DSL plans the upload is often a small fraction of the
        download: a plan sold as 300 Mbps might upload at 20.
      </p>

      <h2>Why does a real upload take longer than the math?</h2>
      <ul>
        <li>
          <strong>Overhead.</strong> Every request carries headers, encryption and acknowledgements
          on top of your file. It's a few percent, but it never goes away.
        </li>
        <li>
          <strong>Wi-Fi.</strong> Walls, distance and the neighbours' networks all cut into the
          speed your laptop gets. A speed test next to the router flatters you.
        </li>
        <li>
          <strong>Everything else on the line.</strong> Cloud backups, photo sync, a video call in
          the next room. They share the same upload.
        </li>
        <li>
          <strong>The service.</strong> Some upload one piece at a time, so each pause between
          pieces is wasted time. Some put free accounts in a slower queue.
        </li>
        <li>
          <strong>Interruptions.</strong> On a long upload something will happen. A tool that starts
          over can turn a 4-hour upload into an 8-hour one.
        </li>
      </ul>

      <h2>What did we measure?</h2>
      <p>
        Our release test uploads 100 GiB (about 107 GB) from a browser while breaking it on purpose
        eight times: offline for 90 seconds, a rejected part, a reload, a closed tab, a 20-minute
        freeze, a browser crash, a wrong file picked, and a lost final response. It finished in 56
        minutes, freeze included, with the file matching byte for byte.
      </p>
      <p>
        Between failures it ran at 74 to 75 MiB/s, about 620 Mbps. That ran on a data-centre
        machine, not a home connection, so read it as what the uploader can do, not what your Wi-Fi
        will. Sending four parts at once instead of one took a 10 GiB test with the same failures
        from 14.8 to 43.1 MiB/s.
      </p>

      <h2>How do I make a big upload finish sooner?</h2>
      <ol>
        <li>Plug in an ethernet cable if you can. It beats Wi-Fi almost every time.</li>
        <li>Pause cloud backups and sync apps until the upload is done.</li>
        <li>Run one big upload at a time. Two at once each get half.</li>
        <li>
          Keep the computer awake. On a Mac, plug in power and stop it sleeping in Battery settings.
          Resuming saves the work, not the time; a sleeping laptop uploads nothing.
        </li>
        <li>
          Use a tool that keeps what arrived. With Tranzfer, a drop or a crash costs you the parts
          in flight, not the hours before them. Start it before bed and check in the morning.
        </li>
      </ol>
    </Article>
  );
}

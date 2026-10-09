import Article from "../../guides/Article";
import { updated } from "../../guides/guides";
import UploadTimeCalculator, {
  duration,
  planningShare,
  uploadSeconds,
} from "../../tools/UploadTimeCalculator";

const percent = Math.round(planningShare * 100);
const at = (gb: number, mbps: number) => duration(uploadSeconds(gb * 1e9, mbps));

const faq = [
  {
    a: `Time in seconds is the size in megabits divided by your speed in Mbps. 100 GB is 800,000 megabits, so at 50 Mbps it's 16,000 seconds, about ${at(100, 50)}.`,
    q: "How do I work out upload time by hand?",
  },
  {
    a: "Mbps is megabits per second, which is how internet plans are sold. MB/s is megabytes per second, which is how files are measured. There are 8 bits in a byte, so divide Mbps by 8 to get MB/s.",
    q: "What's the difference between Mbps and MB/s?",
  },
  {
    a: `Your connection rarely holds its advertised speed for hours. Protocol overhead, Wi-Fi and other traffic all take a share. We show the time at ${percent}% of your speed as the number to plan around.`,
    q: "Why does the calculator show two times?",
  },
  {
    a: "Here a GB is 1,000,000,000 bytes, the way drive makers, macOS and Tranzfer count. Windows shows sizes in GiB but labels them GB, so a 100 GB folder shows as about 93 GB there.",
    q: "Is a GB 1,000 or 1,024 megabytes?",
  },
  {
    a: "No. It runs in your browser. Nothing you type is sent anywhere.",
    q: "Does the calculator upload anything?",
  },
];

const description =
  "Free upload time calculator: enter a file size and your upload speed in Mbps to see how long the upload takes, with a realistic estimate for planning.";

// The tool itself, for search engines; Article adds the article and FAQ.
const webApplication = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  applicationCategory: "UtilitiesApplication",
  description,
  isAccessibleForFree: true,
  name: "Upload time calculator",
  offers: { "@type": "Offer", price: 0, priceCurrency: "USD" },
  operatingSystem: "Any modern web browser",
  url: "https://tranzfer.app/tools/upload-time-calculator",
};

export default function UploadTimeCalculatorPage() {
  return (
    <Article
      answer={
        <p>
          Enter a file size and your upload speed to see how long the upload takes. At 50 Mbps, 100
          GB takes about {at(100, 50)} with the line running flat out, and about{" "}
          {duration(uploadSeconds(100e9, 50 * planningShare))} at a more realistic {percent}%.
        </p>
      }
      description={description}
      eyebrow="Free tool"
      faq={faq}
      path="/tools/upload-time-calculator"
      related={[
        { href: "/guides/how-long-to-upload-100-gb", label: "How long does 100 GB take?" },
        { href: "/guides/how-to-send-large-files", label: "How to send large files" },
        { href: "/features/resume", label: "Resume anything" },
        { href: "/pricing", label: "Price calculator" },
      ]}
      title="Upload time calculator"
      tool={<UploadTimeCalculator />}
      updated={updated}
    >
      <script type="application/ld+json">{JSON.stringify(webApplication)}</script>
      <h2>Mbps or MB/s?</h2>
      <p>
        Internet plans are sold in megabits per second (Mbps). Files are measured in megabytes and
        gigabytes. A byte is 8 bits, so a 100 Mbps connection moves at most 12.5 MB a second, or 45
        GB an hour. If a speed test or an app shows MB/s, multiply by 8 before you type it in.
      </p>

      <h2>Which speed should I enter?</h2>
      <p>
        Your upload speed, from a speed test run on the computer and network you'll send from. Not
        the download speed and not the number on your bill. Most home connections upload much slower
        than they download, and that's the number that decides how long you wait.
      </p>

      <h2>How accurate is it?</h2>
      <p>
        The first number is the floor: your file can't go up faster than the line allows. Real
        uploads lose a share to protocol overhead, Wi-Fi, other devices and the service at the other
        end, which is why we also show the time at {percent}% of your speed. That's a planning
        figure, not a measurement. If you're on Wi-Fi in a busy house, expect worse.
      </p>
      <p>
        The bigger risk on a long upload isn't speed, it's starting over. Tranzfer keeps every part
        that arrived, so a dropped connection or a crashed browser costs minutes instead of the
        whole run. There's more on that in{" "}
        <a href="/guides/how-long-to-upload-100-gb">how long it takes to upload 100 GB</a>.
      </p>
    </Article>
  );
}

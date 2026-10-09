import filmmaker from "../landing/assets/filmmaker.webp";
import loftPacking from "../landing/assets/loft-packing.webp";
import mountainStudio from "../landing/assets/mountain-studio.webp";
import videoEdit from "../landing/assets/video-edit.webp";
import wrong1 from "../landing/assets/wrong-01-cafe-wifi.webp";
import wrong3 from "../landing/assets/wrong-03-refreshed-tab.webp";
import wrong4 from "../landing/assets/wrong-04-overnight.webp";
import wrong5 from "../landing/assets/wrong-05-damaged-piece.webp";
import wrong6 from "../landing/assets/wrong-06-delivered.webp";

// The feature and use-case pages: one entry each, feeding the nav menus, the
// page template and the prerender list. Only claim what Tranzfer does today.

export interface Page {
  readonly description: string;
  readonly eyebrow: string;
  readonly image: string;
  readonly lede: string;
  readonly menu: string;
  readonly note: string;
  readonly points: readonly { readonly h: string; readonly p: string }[];
  readonly slug: string;
  readonly title: readonly [string, string];
  /** Use-case pages: how a send goes for this person, start to finish. */
  readonly steps?: readonly { readonly h: string; readonly p: string }[];
  /** File types this person sends, in the words they'd search with. */
  readonly files?: readonly string[];
  /** What Tranzfer replaces for them. */
  readonly instead?: readonly { readonly h: string; readonly p: string }[];
  readonly faq?: readonly { readonly q: string; readonly a: string }[];
}

export const features: readonly Page[] = [
  {
    description:
      "Send hundreds of gigabytes from your browser. No app, no size anxiety, no splitting files.",
    eyebrow: "Send huge files",
    image: videoEdit,
    lede: "Drag in a whole shoot and hit send. Tranzfer moves hundreds of gigabytes straight from your browser. Nothing to install, nothing to zip, no splitting a project into polite little pieces.",
    menu: "Send huge files",
    note: "the whole shoot? sure.",
    points: [
      {
        h: "Your plan is the only limit",
        p: "No separate cap per file. Free holds 20 GB at once, Studio holds 3 TB.",
      },
      {
        h: "Straight from the browser",
        p: "Chrome, Edge, Safari, Firefox. If it opens tranzfer.app, it can send.",
      },
      {
        h: "Tested at 100 GB",
        p: "One upload, eight things broken on purpose, the exact same file at the end.",
      },
    ],
    slug: "send-large-files",
    title: ["Send the files", "email laughs at."],
  },
  {
    description:
      "Wi-Fi drops, laptop sleeps, browser crashes: Tranzfer keeps what arrived and sends only what's missing.",
    eyebrow: "Resume anything",
    image: wrong1,
    lede: "Uploads die at the worst moment. Tranzfer keeps every piece that already arrived, so a dropped connection, a sleeping laptop or a crashed browser never sends you back to zero.",
    menu: "Resume anything",
    note: "63%? keep going.",
    points: [
      {
        h: "Connection drops",
        p: "Tranzfer waits for it to come back, then carries on by itself.",
      },
      {
        h: "Reloads, closed tabs, crashes",
        p: "The upload waits on your dashboard. Pick the same files and only the missing bits go up.",
      },
      {
        h: "Wrong copy picked",
        p: "Your files get checked against what already arrived. No match, no mix-up.",
      },
    ],
    slug: "resume",
    title: ["Never start over.", "Not even at 63%."],
  },
  {
    description:
      "Send a whole folder with its subfolders. Recipients on desktop Chrome or Edge save it all into one folder.",
    eyebrow: "Send whole folders",
    image: loftPacking,
    lede: "Pick a folder and everything inside goes, subfolders and file names included. On desktop Chrome or Edge, your recipient picks a destination folder once and everything lands there. Other browsers download the files one by one.",
    menu: "Send whole folders",
    note: "A001/, A002/… all of it.",
    points: [
      {
        h: "Structure kept",
        p: "Card folders, project folders, whatever you send, it arrives the way you sorted it.",
      },
      {
        h: "One click to save it all",
        p: "Desktop Chrome and Edge save everything into a folder you choose, and carry on if it gets interrupted.",
      },
      {
        h: "Or file by file",
        p: "Any browser can download each file on its own.",
      },
    ],
    slug: "folders",
    title: ["Send the card.", "Not 1,842 files."],
  },
  {
    description:
      "Every delivery is one link. Recipients download without an account, and links end when you say.",
    eyebrow: "One link, no account",
    image: filmmaker,
    lede: "Every delivery becomes one link. Your editor clicks it and downloads. They don't sign up, they don't install anything, and they don't email you asking how.",
    menu: "One link, no account",
    note: "no sign-up. promise.",
    points: [
      {
        h: "Links that end",
        p: "Choose 1, 3, 7 or 14 days, depending on your plan. Then the files are deleted.",
      },
      {
        h: "Cancel any time",
        p: "Changed your mind? Cancel the delivery and the link stops working right away.",
      },
      {
        h: "Nothing to explain",
        p: "A plain page with the files and a download button. That's it.",
      },
    ],
    slug: "share-links",
    title: ["One link.", "Zero 'how do I open this'."],
  },
  {
    description:
      "See every delivery in one place: what's moving, what's ready, what got interrupted, and how much space you're using.",
    eyebrow: "Your delivery desk",
    image: mountainStudio,
    lede: "Every delivery lives on one dashboard: what's moving, what's ready to share, what got interrupted and needs the files again. Plus how much of your plan you're using.",
    menu: "Track every delivery",
    note: "one screen. no spreadsheet.",
    points: [
      {
        h: "Moving, ready, interrupted",
        p: "Each delivery sits where it belongs, with honest progress. No fake speeds.",
      },
      {
        h: "Copy a link in one click",
        p: "Ready deliveries keep their link and expiry right there.",
      },
      {
        h: "Know your space",
        p: "See what's in use at once, and watch it free up as links end.",
      },
    ],
    slug: "dashboard",
    title: ["Every delivery,", "one desk."],
  },
  {
    description:
      "Files are encrypted, links are private, and everything is deleted when the link ends. No ads, no tracking.",
    eyebrow: "Private by default",
    image: wrong6,
    lede: "Your footage is your business. Files are encrypted on the way and while stored, only people with the link can download them, and they're deleted the moment the link ends.",
    menu: "Private by default",
    note: "we don't look. we don't sell.",
    points: [
      {
        h: "Deleted when it ends",
        p: "Expired or cancelled deliveries are wiped within minutes, not kept 'just in case'.",
      },
      {
        h: "No ads, no tracking",
        p: "We don't sell data and we don't run advertising trackers.",
      },
      {
        h: "Your files stay yours",
        p: "We store them only to deliver them. Read the privacy policy, it's short.",
      },
    ],
    slug: "privacy",
    title: ["Private by default.", "Gone when it's done."],
  },
];

export const audiences: readonly Page[] = [
  {
    description:
      "Send raw footage, dailies and whole camera cards to your editor, without babysitting the upload.",
    eyebrow: "For videographers",
    faq: [
      {
        a: "Drag the shoot folder onto Tranzfer and send. Your editor gets one link to everything, folders included. Free holds 20 GB live at once, Starter 300 GB, Pro 1 TB and Studio 3 TB.",
        q: "How do I send a whole day of footage to my editor?",
      },
      {
        a: "Tranzfer keeps every part that already arrived and retries when the connection comes back. If the browser closes or crashes, open Tranzfer again and pick the same files. It sends only what's missing.",
        q: "What happens if the hotel Wi-Fi drops mid-upload?",
      },
      {
        a: "No. They open the link and download. Desktop Chrome and Edge can save the whole delivery into one folder; other browsers download file by file.",
        q: "Does my editor need an account?",
      },
      {
        a: "That's what it's built for: hundreds of gigabytes from a browser, on a connection that won't behave. There's an honest side-by-side on the Tranzfer vs WeTransfer page.",
        q: "Is Tranzfer a WeTransfer alternative for big shoots?",
      },
    ],
    files: [
      "BRAW",
      "ProRes RAW",
      "ProRes 422 HQ",
      "R3D",
      "ARRIRAW",
      "XAVC",
      "MXF",
      "H.265 MP4",
      "Proxies",
      "WAV sound rolls",
      "LUTs",
      "Drone footage",
      "Whole camera cards",
    ],
    image: videoEdit,
    instead: [
      { h: "Shipping a hard drive", p: "No courier, no waiting a day for a drive to land." },
      {
        h: "Splitting cards into free-tier chunks",
        p: "No 'part 7 of 12'. The whole card is one delivery.",
      },
      {
        h: "Waiting for a cloud folder to sync",
        p: "No sync client. Your editor downloads from a link.",
      },
    ],
    lede: "Wrap the shoot, dump the cards, send the lot to your editor. When the hotel Wi-Fi drops, Tranzfer keeps what arrived and carries on. You don't have to watch it.",
    menu: "For videographers",
    note: "A-cam, B-cam, drone. go.",
    points: [
      {
        h: "Whole cards at once",
        p: "Folders keep their structure, so the edit starts organized.",
      },
      {
        h: "Survives the hotel Wi-Fi",
        p: "Drops and sleeps don't restart anything. It carries on from where it was.",
      },
      {
        h: "Your editor just clicks",
        p: "One link, no account. Desktop Chrome or Edge saves it all into one folder; other browsers take it file by file.",
      },
    ],
    slug: "videographers",
    steps: [
      {
        h: "Offload the cards",
        p: "Copy them off with whatever you already use. Keep the folder names; Tranzfer sends them as they are.",
      },
      {
        h: "Drop the whole shoot",
        p: "A-cam, B-cam, drone and sound in one go. Pick how long the link lasts, up to 14 days on Pro.",
      },
      {
        h: "Send your editor one link",
        p: "Text it, Slack it, email it. They open it and download, no account. If the Wi-Fi drops on your end, Tranzfer retries by itself.",
      },
    ],
    title: ["Dailies to your editor.", "Without starting over."],
  },
  {
    description:
      "Deliver full-resolution shoots, raw files and selects to clients without splitting galleries.",
    eyebrow: "For photographers",
    faq: [
      {
        a: "Drag the folder of RAW files onto Tranzfer and send. Your client gets one link and downloads the originals, untouched.",
        q: "How do I send RAW photos to a client?",
      },
      {
        a: "Yes, if it fits your plan. A few thousand RAW files usually comes to 50 to 150 GB, which fits Starter's 300 GB.",
        q: "Can I send a whole wedding in one go?",
      },
      {
        a: "No. What you upload is exactly what downloads, byte for byte.",
        q: "Do my photos get compressed?",
      },
      {
        a: "You choose when you send: up to 3 days on Free, 7 on Starter, 14 on Pro and Studio. You can cancel a link early from your dashboard.",
        q: "How long does my client have to download?",
      },
    ],
    files: [
      "CR3",
      "NEF",
      "ARW",
      "RAF",
      "DNG",
      "Full-size JPEG",
      "TIFF",
      "PSD",
      "Lightroom catalogs",
      "Capture One sessions",
      "Video clips from the day",
    ],
    image: wrong3,
    instead: [
      { h: "Seven zip files", p: "Send the folder as it is. Nothing to compress or split." },
      {
        h: "A gallery that wasn't built for handover",
        p: "Proof in your gallery. Hand over the originals here.",
      },
      { h: "A USB stick in the post", p: "No couriers, no lost sticks, no waiting." },
    ],
    lede: "Thousands of raw files from a wedding or a campaign, sent in one go. Your client gets one link, not seven zip files and an apology.",
    menu: "For photographers",
    note: "RAW + JPEG? both.",
    points: [
      {
        h: "Full resolution",
        p: "Send the originals, not compressed previews.",
      },
      {
        h: "Folders for selects",
        p: "Keep selects, edits and raws in their folders. They arrive that way.",
      },
      {
        h: "Links that expire",
        p: "Deliveries end on schedule, so old shoots don't float around forever.",
      },
    ],
    slug: "photographers",
    steps: [
      {
        h: "Sort it how you like",
        p: "Selects, Edits, RAW. Whatever folders you use, they arrive the same way.",
      },
      {
        h: "Drop the folder, pick how long",
        p: "Links last up to 3 days on Free, 7 on Starter and 14 on Pro and Studio.",
      },
      {
        h: "Your client clicks and downloads",
        p: "No gallery login, no account. The originals, at full size.",
      },
    ],
    title: ["The whole shoot.", "One link."],
  },
  {
    description: "Get footage from shooters without walking anyone through an upload portal.",
    eyebrow: "For editors",
    faq: [
      {
        a: "Ask them to send with Tranzfer. Free takes 20 GB at once; bigger shoots need Starter or Pro. You just open the link.",
        q: "How do I get large video files from a shooter?",
      },
      {
        a: "No. Anyone with the link can download until it expires.",
        q: "Do I need a Tranzfer account to download?",
      },
      {
        a: "On desktop Chrome or Edge, yes. Pick the folder once and everything saves into it with its subfolders.",
        q: "Can I download straight into my project folder?",
      },
      {
        a: "Yes, byte for byte. Tranzfer doesn't transcode, compress or rename anything.",
        q: "Will the files match the camera originals?",
      },
    ],
    files: [
      "Camera originals",
      "Proxies",
      "Sound rolls",
      "XML and EDL",
      "AAF",
      "Premiere projects",
      "Resolve projects",
      "LUTs",
      "Graphics packages",
      "Music stems",
      "Reference cuts",
    ],
    image: mountainStudio,
    instead: [
      {
        h: "Teaching someone a portal",
        p: "If they can drag a folder, they can send you footage.",
      },
      { h: "Fourteen links for one shoot", p: "One delivery, one link, the whole card." },
      { h: "Rebuilding the folder structure", p: "It arrives the way the shooter sorted it." },
    ],
    lede: "You need the footage, not a tutorial. When your shooter sends with Tranzfer, you get one link and the whole card, folder structure and all.",
    menu: "For editors",
    note: "finally, the B-cam.",
    points: [
      {
        h: "No account needed",
        p: "Click the link, download. Nothing to sign up for.",
      },
      {
        h: "Everything in one folder",
        p: "On desktop Chrome or Edge, pick a folder once and the whole delivery saves into it.",
      },
      {
        h: "Same files, every byte",
        p: "What they sent is exactly what you get.",
      },
    ],
    slug: "editors",
    steps: [
      {
        h: "Point your shooter at Tranzfer",
        p: "They sign in with Google, drop the cards and send. That's the whole tutorial.",
      },
      {
        h: "Open the link",
        p: "No account, no portal. You see every file and folder in the delivery.",
      },
      {
        h: "Save it into your project",
        p: "On desktop Chrome or Edge, pick your media folder once and the whole delivery lands there, sorted. If it gets interrupted, it carries on.",
      },
    ],
    title: ["Start cutting.", "Stop chasing footage."],
  },
  {
    description:
      "Hand off raw recordings and project files to your editor, even from a laptop on the road.",
    eyebrow: "For creators",
    faq: [
      {
        a: "Drop the folder on Tranzfer, send, and give your editor the link. They don't need an account.",
        q: "What's the easiest way to send footage to my video editor?",
      },
      {
        a: "Yes. Dropped connections, sleep and crashes don't throw away what already arrived. After a crash or closed tab, pick the same files again to carry on.",
        q: "Can I send from my laptop while traveling?",
      },
      { a: "Yes. 20 GB live at once, links up to 3 days, no card.", q: "Is there a free plan?" },
      {
        a: "No. They get a link and download from wherever they are.",
        q: "My editor is in another country. Does that matter?",
      },
    ],
    files: [
      "4K and 6K camera files",
      "OBS recordings",
      "Screen captures",
      "Mic and lav audio",
      "Phone footage",
      "Thumbnails and PSDs",
      "Premiere and Resolve projects",
      "B-roll folders",
    ],
    image: wrong4,
    instead: [
      { h: "Uploading to Drive and hoping", p: "No 'upload failed' at 3am that you find at 9." },
      {
        h: "Waiting until you're home",
        p: "Hotel and café Wi-Fi are fine. It keeps what arrived.",
      },
      { h: "Paying per gigabyte", p: "Flat monthly plans, or free for 20 GB at once." },
    ],
    lede: "You filmed it, your editor's eight hours ahead, and the upload has to survive a night of your laptop going to sleep. Tranzfer was built for exactly that night.",
    menu: "For creators & YouTubers",
    note: "post on time. sleep anyway.",
    points: [
      {
        h: "Hit send, go to bed",
        p: "Interruptions don't restart anything. Check in the morning.",
      },
      {
        h: "Free to start",
        p: "20 GB at once on the free plan. No card.",
      },
      {
        h: "Bigger when you are",
        p: "Up to 3 TB at once, and links that last two weeks.",
      },
    ],
    slug: "creators",
    steps: [
      {
        h: "Drop the raw recordings",
        p: "A-roll, B-roll, screen captures, the mic track. Sign in with Google, no card.",
      },
      {
        h: "Send it before bed",
        p: "If the Wi-Fi drops it retries. If the laptop sleeps, it picks up when it wakes.",
      },
      {
        h: "Your editor downloads in their morning",
        p: "One link, no account, wherever they are.",
      },
    ],
    title: ["Your editor's asleep.", "The upload isn't."],
  },
  {
    description:
      "Move productions between shooters, editors, colorists and clients on flat monthly plans.",
    eyebrow: "For studios",
    faq: [
      {
        a: "No. You pay for how much is live at once. When a link expires or you cancel it, that space goes back to your plan.",
        q: "Is the pricing per gigabyte?",
      },
      {
        a: "Yes. Anyone with the link can download until it expires.",
        q: "Can clients download without an account?",
      },
      {
        a: "They're deleted, and the space returns to your plan.",
        q: "What happens to files after a link expires?",
      },
      {
        a: "Not yet. Today a plan belongs to one Google account. Tell us if your team needs more.",
        q: "Do you have team seats?",
      },
    ],
    files: [
      "ProRes 4444 masters",
      "DCP folders",
      "IMF packages",
      "Conform packages",
      "EXR sequences",
      "Stems and M&E",
      "Graded and ungraded exports",
      "Subtitle files",
      "Client review cuts",
    ],
    image: wrong5,
    instead: [
      {
        h: "Per-gigabyte invoices",
        p: "Studio is $69 a month for 3 TB live at once, however much you send through it.",
      },
      { h: "Client logins on yet another portal", p: "Clients click a link. That's it." },
      { h: "A shelf of shuttle drives", p: "Send the master the day it's done." },
    ],
    lede: "Footage in from set, cuts out to clients, masters off to color. Tranzfer moves the big stuff on a flat monthly plan, so heavy weeks don't come with a per-gigabyte bill.",
    menu: "For studios & agencies",
    note: "3 TB on the go at once.",
    points: [
      {
        h: "Flat pricing",
        p: "Pay for how much is live at once, not every gigabyte you ever send.",
      },
      {
        h: "Space comes back",
        p: "When a link ends, its space frees up for the next delivery.",
      },
      {
        h: "Clients never sign up",
        p: "One link per delivery, no client accounts to manage.",
      },
    ],
    slug: "studios",
    steps: [
      {
        h: "Cuts and masters out to clients",
        p: "Drop the export folder and send one link. Clients never make an account.",
      },
      {
        h: "Hand-offs to color, sound and VFX",
        p: "Send the conform package as a folder. It arrives sorted.",
      },
      {
        h: "Keep an eye on it in one place",
        p: "Your dashboard shows what's moving, what's ready and how much space is in use. Cancel a link and its files are deleted.",
      },
    ],
    title: ["Heavy weeks.", "Flat bills."],
  },
  {
    description: "Send multitrack sessions, stems and masters without bouncing them down to fit.",
    eyebrow: "For music & audio",
    faq: [
      {
        a: "Drag the session folder onto Tranzfer and send. Your mixer gets one link to the whole folder.",
        q: "How do I send a Pro Tools session to a mixer?",
      },
      { a: "No. Every file arrives exactly as you sent it.", q: "Will my audio get compressed?" },
      {
        a: "Put them in a folder and send it. However many there are, it's one link.",
        q: "How do I send stems to a mixer?",
      },
      {
        a: "Yes. Any file type works, and big single files are what Tranzfer is for.",
        q: "Can I send a Dolby Atmos ADM file?",
      },
    ],
    files: [
      "Pro Tools sessions",
      "Logic projects",
      "Ableton projects",
      "24-bit and 32-bit float WAV",
      "AIFF",
      "Stems",
      "DDP images",
      "Dolby Atmos ADM BWF",
      "Video for sync",
      "MIDI",
    ],
    image: wrong6,
    instead: [
      { h: "Bouncing down to fit a limit", p: "Send the full-resolution session." },
      { h: "Stems in five batches", p: "All of them, one link." },
      { h: "Zipping a session and hoping", p: "Folders go as folders. Nothing to unpack." },
    ],
    lede: "Multitrack sessions, stems, masters, the whole project folder. Send it as it is, without bouncing, zipping or splitting it to squeeze under a limit.",
    menu: "For music & audio",
    note: "stems. all 96 of them.",
    points: [
      {
        h: "Whole sessions",
        p: "Send the project folder and it arrives the same way.",
      },
      {
        h: "Lossless means lossless",
        p: "Files arrive exactly as you sent them.",
      },
      {
        h: "No accounts for collaborators",
        p: "Mixers and labels just click the link.",
      },
    ],
    slug: "music",
    steps: [
      {
        h: "Collect the session",
        p: "The project folder with its audio files, bounces and notes.",
      },
      {
        h: "Send it as it is",
        p: "No zipping, no splitting into batches. Folders arrive the way you sorted them.",
      },
      { h: "Your mixer clicks the link", p: "No account. They download the session and open it." },
    ],
    title: ["Send the session.", "Not a bounce."],
  },
];

export const resources = [
  { href: "/pricing", menu: "Pricing calculator" },
  { href: "/vs/masv", menu: "Tranzfer vs MASV" },
  { href: "/vs/wetransfer", menu: "Tranzfer vs WeTransfer" },
  { href: "/#faq", menu: "Questions" },
  { href: "/about", menu: "Why we built it" },
  { href: "mailto:support@tranzfer.app", menu: "Help" },
];

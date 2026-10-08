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
}

export const features: readonly Page[] = [
  {
    description:
      "Send hundreds of gigabytes from your browser. No app, no size anxiety, no splitting files.",
    eyebrow: "Send huge files",
    image: videoEdit,
    lede: "Drag in a whole shoot and hit send. Tranzfer moves hundreds of gigabytes straight from your browser. Nothing to install, nothing to zip, no splitting a project into polite little pieces.",
    menu: "Send huge files",
    note: "400 GB? sure.",
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
    lede: "Uploads die at the worst moment. Tranzfer keeps every piece that already arrived, so a dropped connection, a sleeping laptop or a crashed browser costs you minutes, not the whole night.",
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
      "Send a whole folder with its subfolders. Recipients on Chrome or Edge save it all in one go.",
    eyebrow: "Send whole folders",
    image: loftPacking,
    lede: "Pick a folder and everything inside goes, subfolders and file names included. On Chrome or Edge, your recipient saves the lot into one folder with a single click.",
    menu: "Send whole folders",
    note: "A001/, A002/… all of it.",
    points: [
      {
        h: "Structure kept",
        p: "Card folders, project folders, whatever you send, it arrives the way you sorted it.",
      },
      {
        h: "One click to save it all",
        p: "Chrome and Edge save everything into a folder you choose, and carry on if it gets interrupted.",
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
    image: videoEdit,
    lede: "Wrap the shoot, dump the cards, send the lot to your editor tonight. Tranzfer handles 400 GB of dailies over hotel Wi-Fi and doesn't need you watching.",
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
        p: "One link, no account. Days of footage, one download.",
      },
    ],
    slug: "videographers",
    title: ["Dailies tonight.", "Not 'when the upload finishes'."],
  },
  {
    description:
      "Deliver full-resolution shoots, raw files and selects to clients without splitting galleries.",
    eyebrow: "For photographers",
    image: wrong3,
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
    title: ["The whole shoot.", "One link."],
  },
  {
    description: "Get footage from shooters without walking anyone through an upload portal.",
    eyebrow: "For editors",
    image: mountainStudio,
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
        p: "On Chrome or Edge, save the entire delivery with one click.",
      },
      {
        h: "Same files, every byte",
        p: "What they sent is exactly what you get.",
      },
    ],
    slug: "editors",
    title: ["Start cutting.", "Stop chasing footage."],
  },
  {
    description:
      "Hand off raw recordings and project files to your editor, even from a laptop on the road.",
    eyebrow: "For creators",
    image: wrong4,
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
    title: ["Your editor's asleep.", "The upload isn't."],
  },
  {
    description:
      "Move productions between shooters, editors, colorists and clients on flat monthly plans.",
    eyebrow: "For studios",
    image: wrong5,
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
    title: ["Heavy weeks.", "Flat bills."],
  },
  {
    description: "Send multitrack sessions, stems and masters without bouncing them down to fit.",
    eyebrow: "For music & audio",
    image: wrong6,
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

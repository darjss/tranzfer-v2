import filmmaker from "../landing/assets/filmmaker.webp";
import loftPacking from "../landing/assets/loft-packing.webp";
import mountainStudio from "../landing/assets/mountain-studio.webp";
import videoEdit from "../landing/assets/video-edit.webp";
import wrong1 from "../landing/assets/wrong-01-cafe-wifi.webp";
import wrong6 from "../landing/assets/wrong-06-delivered.webp";
import type { Page } from "./content";

export const features: readonly Page[] = [
  {
    description:
      "Send hundreds of gigabytes from your browser as one link. Nothing to install, nothing to zip or split, and the upload resumes if the connection drops.",
    eyebrow: "Send huge files",
    faq: [
      {
        a: "No separate one. A single file can be as big as your plan holds at once: 20 GB on Free, 300 GB on Starter, 1 TB on Pro and 3 TB on Studio.",
        q: "Is there a size limit per file?",
      },
      {
        a: "No. Tranzfer runs in Chrome, Edge, Safari and Firefox. The person you send to doesn't install anything either.",
        q: "Do I need to install anything?",
      },
      {
        a: "No. Send files and folders as they are. Subfolders and file names arrive the way you sent them.",
        q: "Do I have to zip it first?",
      },
      {
        a: "We sent one 100 GB upload and broke it eight ways on purpose, including Wi-Fi off, a reload, a closed tab and a crashed browser. It finished, and the file on the other end matched the original exactly.",
        q: "How was it tested?",
      },
    ],
    guides: [
      { href: "/guides/how-to-send-large-files", label: "How to send large files" },
      { href: "/guides/send-a-100gb-file", label: "Send a 100 GB file" },
    ],
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
      "When the Wi-Fi drops, the laptop sleeps or the browser crashes, Tranzfer keeps every part that arrived and sends only what's missing. On every plan.",
    eyebrow: "Resume anything",
    faq: [
      {
        a: "No. Tranzfer waits for the connection to come back and carries on by itself.",
        q: "Do I have to do anything when the Wi-Fi drops?",
      },
      {
        a: "The upload waits on your dashboard. Open Tranzfer, pick the same files again, and only the missing parts go up. The browser forgets your files when it closes, which is why it has to ask.",
        q: "What if I close the tab or the browser crashes?",
      },
      {
        a: "Tranzfer checks what you picked against what already arrived. If it doesn't match, it tells you instead of mixing them up.",
        q: "What if I pick the wrong file?",
      },
      {
        a: "No. Every plan has it, Free included.",
        q: "Is resume a paid extra?",
      },
    ],
    guides: [
      { href: "/guides/resume-an-interrupted-upload", label: "Resume an interrupted upload" },
    ],
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
      "Send a whole folder with its subfolders and file names. Recipients on desktop Chrome or Edge save it all into one folder; other browsers get a file list.",
    eyebrow: "Send whole folders",
    faq: [
      {
        a: "Yes. Pick the folder and everything inside goes, subfolders and file names included.",
        q: "Can I send a folder with subfolders in it?",
      },
      {
        a: "On desktop Chrome or Edge, Download all asks for a folder once and saves the whole delivery into it, subfolders included. If it gets interrupted, it carries on.",
        q: "How does my recipient save it all at once?",
      },
      {
        a: "They download each file on its own.",
        q: "What about Safari, Firefox or a phone?",
      },
    ],
    guides: [
      {
        href: "/guides/send-large-video-files-to-an-editor",
        label: "Transfer raw footage to your editor",
      },
    ],
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
      "Every delivery is one link. Recipients download without an account or an app, and the link ends after 1, 3, 7 or 14 days, up to your plan's limit.",
    eyebrow: "One link, no account",
    faq: [
      {
        a: "No. They open the link and download. Nothing to sign up for, nothing to install.",
        q: "Does the person I send to need an account?",
      },
      {
        a: "You pick 1, 3, 7 or 14 days, up to your plan's limit: 3 on Free, 7 on Starter, 14 on Pro and Studio. When it ends, the files are deleted.",
        q: "How long does a link last?",
      },
      {
        a: "Yes. Cancel the delivery on your dashboard and the link stops working right away.",
        q: "Can I stop a link early?",
      },
    ],
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
      "See every delivery in one place: what's moving, what's ready to share, what got interrupted and needs the files again, and how much of your plan is in use.",
    eyebrow: "Your delivery desk",
    faq: [
      {
        a: "Every delivery: what's uploading, what's ready to share, what was interrupted and needs the files again, and how much of your plan is in use.",
        q: "What does the dashboard show?",
      },
      {
        a: "It stays on the dashboard. Pick the same files again and Tranzfer sends only what's missing.",
        q: "What happens to an interrupted upload?",
      },
      {
        a: "The link stops working, the files are deleted and the space goes back to your plan.",
        q: "What happens when I cancel a delivery?",
      },
    ],
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
      "Files are encrypted in transit and at rest, only people with the link can download them, and everything is deleted when the link ends. No ads, no tracking.",
    eyebrow: "Private by default",
    faq: [
      {
        a: "Yes, on the way to us and while they're stored.",
        q: "Are my files encrypted?",
      },
      {
        a: "When the link ends or you cancel the delivery. Expired and cancelled deliveries are wiped within minutes.",
        q: "When are my files deleted?",
      },
      {
        a: "No. We don't sell data and we don't run advertising trackers.",
        q: "Do you run ads or sell data?",
      },
    ],
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

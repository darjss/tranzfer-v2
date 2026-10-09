// The question guides by slug. Each route in src/routes/guides reads its title
// and summary from here, so the hub, the page and llms.txt say the same thing.

export const guides = {
  "how-long-to-upload-100-gb": {
    summary:
      "About 4 hours 27 minutes at 50 Mbps and 2 hours 13 minutes at 100 Mbps, at full speed. What slows it down and how to plan.",
    title: "How long does it take to upload 100 GB?",
  },
  "how-to-send-large-files": {
    summary:
      "Use a transfer link, not email. Which tool fits which size, and what to do so a 200 GB upload doesn't die at 63%.",
    title: "How to send large files",
  },
  "send-large-video-files-to-an-editor": {
    summary:
      "Send the whole card folder, untouched, through a transfer that resumes. How to prepare it so your editor can start cutting.",
    title: "How to send large video files to an editor",
  },
  "send-pro-tools-or-logic-session": {
    summary:
      "Collect every audio file into the session folder first, then send the whole folder. What to include so your mixer can open it.",
    title: "How to send a Pro Tools or Logic session",
  },
  "send-raw-photos-to-a-client": {
    summary:
      "Send the folder of originals as a download link and keep your gallery for proofing. Don't forget the XMP sidecars.",
    title: "How to send RAW photos to a client",
  },
};

/** When the facts on the guides and alternatives pages were last checked. */
export const updated = "2026-10-09";

// PROTOTYPE, throwaway. Fake deliveries shaped like the agreed schema
// (delivery -> transfers) plus the browser-only states RELIABILITY.md names
// (offline, needs the original file). Sizes are GB.

export type Stage =
  | { kind: "uploading"; confirmed: number; inFlight: number; speed: string; eta: string }
  | { kind: "offline"; confirmed: number }
  | { kind: "needs-file"; confirmed: number; file: string }
  | { kind: "finalizing" }
  | { kind: "ready"; link: string; expires: string }
  | { kind: "expired"; ago: string };

export interface File {
  path: string;
  size: number;
  confirmed: number;
  state: "uploading" | "waiting" | "complete" | "needs-file";
}

export interface Delivery {
  id: string;
  title: string;
  size: number;
  retentionDays: number;
  sent: string;
  stage: Stage;
  files: File[];
}

export const deliveries: Delivery[] = [
  {
    files: [
      { confirmed: 124.1, path: "EP14_A-Cam/", size: 214, state: "uploading" },
      { confirmed: 61, path: "EP14_B-Cam/", size: 61, state: "complete" },
      { confirmed: 11, path: "EP14_Audio/", size: 11, state: "complete" },
    ],
    id: "ep14",
    retentionDays: 3,
    sent: "Today, 01:12",
    size: 286,
    stage: {
      confirmed: 196.1,
      eta: "about 16 min",
      inFlight: 0.4,
      kind: "uploading",
      speed: "94 MB/s",
    },
    title: "Episode 14",
  },
  {
    files: [{ confirmed: 25, path: "Drone_Day2/", size: 61, state: "uploading" }],
    id: "drone",
    retentionDays: 3,
    sent: "Today, 00:40",
    size: 61,
    stage: { confirmed: 25, kind: "offline" },
    title: "Drone day 2",
  },
  {
    files: [
      { confirmed: 205, path: "Interviews/INT_Selects_v2.mov", size: 228, state: "needs-file" },
      { confirmed: 12, path: "Interviews/INT_Room_Tone.wav", size: 12, state: "complete" },
    ],
    id: "int",
    retentionDays: 7,
    sent: "Yesterday, 22:05",
    size: 240,
    stage: { confirmed: 217, file: "INT_Selects_v2.mov", kind: "needs-file" },
    title: "Interview selects",
  },
  {
    files: [{ confirmed: 18, path: "Color_Pass_v3.mov", size: 18, state: "complete" }],
    id: "color",
    retentionDays: 3,
    sent: "Yesterday, 19:30",
    size: 18,
    stage: { kind: "finalizing" },
    title: "Color pass v3",
  },
  {
    files: [
      { confirmed: 170, path: "EP13_A-Cam/", size: 170, state: "complete" },
      { confirmed: 64, path: "EP13_B-Cam/", size: 64, state: "complete" },
      { confirmed: 10, path: "EP13_Audio/", size: 10, state: "complete" },
    ],
    id: "ep13",
    retentionDays: 3,
    sent: "Mon, 23:48",
    size: 244,
    stage: { expires: "in 2 days", kind: "ready", link: "tranzfer.app/d/k7Qm2xPa" },
    title: "Episode 13",
  },
  {
    files: [{ confirmed: 221, path: "EP12/", size: 221, state: "complete" }],
    id: "ep12",
    retentionDays: 3,
    sent: "Sep 14",
    size: 221,
    stage: { ago: "4 days ago", kind: "expired" },
    title: "Episode 12",
  },
  {
    files: [{ confirmed: 277, path: "EP11/", size: 277, state: "complete" }],
    id: "ep11",
    retentionDays: 7,
    sent: "Sep 6",
    size: 277,
    stage: { ago: "11 days ago", kind: "expired" },
    title: "Episode 11",
  },
];

export const gb = (value: number) =>
  `${value >= 100 || Number.isInteger(value) ? Math.round(value) : value.toFixed(1)} GB`;

export const items = (d: Delivery) =>
  `${d.files.length} ${d.files.length === 1 ? "item" : "items"}`;

export const confirmedOf = (d: Delivery) => {
  const { stage } = d;
  if (stage.kind === "uploading" || stage.kind === "offline" || stage.kind === "needs-file") {
    return stage.confirmed;
  }
  return d.size;
};

export const isActive = (d: Delivery) => d.stage.kind !== "ready" && d.stage.kind !== "expired";

export type Tone = "blue" | "amber" | "rust" | "ok" | "mut";

// One place for status copy, so every variant says the same thing.
interface Status {
  tone: Tone;
  short: string;
  long: string;
}

export const status = (d: Delivery): Status => {
  const { stage } = d;
  if (stage.kind === "uploading") {
    return {
      long: `${gb(stage.confirmed)} of ${gb(d.size)} confirmed · ${stage.speed} · ${stage.eta} left`,
      short: `${Math.floor((stage.confirmed / d.size) * 100)}% · ${stage.eta}`,
      tone: "blue",
    };
  }
  if (stage.kind === "offline") {
    return {
      long: "Connection lost. We'll continue when you're back online.",
      short: "Paused, offline",
      tone: "amber",
    };
  }
  if (stage.kind === "needs-file") {
    return {
      long: `We need the original file to continue. ${gb(stage.confirmed)} is already uploaded.`,
      short: "Needs the original file",
      tone: "rust",
    };
  }
  if (stage.kind === "finalizing") {
    return { long: "Every byte is uploaded. Finishing up.", short: "Finishing up", tone: "blue" };
  }
  if (stage.kind === "ready") {
    return {
      long: `Ready. The link expires ${stage.expires}.`,
      short: `Expires ${stage.expires}`,
      tone: "ok",
    };
  }
  return {
    long: `Expired ${stage.ago}. Files are deleted.`,
    short: `Expired ${stage.ago}`,
    tone: "mut",
  };
};

export const toneText: Record<Tone, string> = {
  amber: "text-amber",
  blue: "text-blue",
  mut: "text-mut",
  ok: "text-ok",
  rust: "text-rust",
};

export const toneBar: Record<Tone, string> = {
  amber: "bg-amber",
  blue: "bg-blue",
  mut: "bg-mut/40",
  ok: "bg-ok",
  rust: "bg-rust",
};

export const retentionChoices = [1, 3, 7, 14] as const;

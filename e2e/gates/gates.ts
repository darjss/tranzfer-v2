import type * as Duration from "effect/Duration";

export type Fault =
  | { readonly kind: "offline"; readonly for: Duration.Input }
  | { readonly kind: "failPart" }
  | { readonly kind: "reload" }
  | { readonly kind: "closeTab" }
  | { readonly kind: "sleep"; readonly for: Duration.Input }
  | { readonly kind: "crash" }
  | { readonly kind: "impostor" };

export interface Gate {
  /** Bytes; `NGiB` strings keep the table readable. */
  readonly size: string;
  /** `at` is the fraction of parts acked at which the fault lands. */
  readonly faults: readonly { readonly at: number; readonly fault: Fault }[];
}

// The 20-minute sleep outlasts the 15-minute UPLOAD_URL_TTL, which is the
// "authorization expiry" row of the release-gate table. Every gate also
// loses the Complete response (see the scenario).
export const gates = {
  beta: {
    faults: [
      { at: 0.1, fault: { for: "90 seconds", kind: "offline" } },
      { at: 0.2, fault: { kind: "failPart" } },
      { at: 0.25, fault: { kind: "reload" } },
      { at: 0.4, fault: { kind: "closeTab" } },
      { at: 0.5, fault: { for: "20 minutes", kind: "sleep" } },
      { at: 0.6, fault: { kind: "crash" } },
      { at: 0.7, fault: { kind: "impostor" } },
    ],
    size: "100GiB",
  },
  internal: {
    faults: [
      { at: 0.2, fault: { for: "90 seconds", kind: "offline" } },
      { at: 0.35, fault: { kind: "failPart" } },
      { at: 0.5, fault: { kind: "reload" } },
    ],
    size: "10GiB",
  },
  promise: {
    faults: [
      { at: 0.63, fault: { for: "10 minutes", kind: "offline" } },
      { at: 0.75, fault: { kind: "crash" } },
      { at: 0.85, fault: { kind: "impostor" } },
    ],
    size: "350GiB",
  },
} satisfies Record<string, Gate>;

export type GateName = keyof typeof gates;

export const parseSize = (value: string) => {
  const gib = /^(?<count>\d+)GiB$/u.exec(value);
  if (gib?.groups?.count !== undefined) {
    return Number(gib.groups.count) * 1024 ** 3;
  }
  const bytes = Number(value);
  if (!Number.isInteger(bytes) || bytes <= 0) {
    throw new Error(`can't parse a size from "${value}" (bytes or NGiB)`);
  }
  return bytes;
};

import type { LinkToken, TransferId } from "@tranzfer/contracts";

// What this tab knows about each transfer it sends, beyond the progress in
// store.ts. Module state like the store, so it survives navigation (law 11).
// New per-transfer facts go here, and forget is the only place they end.
interface Entry {
  // Acknowledged bytes over time, oldest first, since the transfer last
  // started moving in this tab. Empty until the first bytes go out.
  acks: { at: number; confirmed: number }[];
  // Transport retries spent; any acknowledged part resets the budget because
  // progress proves transport works.
  autoRetries: number;
  // Complete signed means the bytes may already be a finished object; an
  // error after this point reconciles instead of restarting transport.
  completeSigned: boolean;
  // Part numbers R2 holds. Parts finish out of order, so confirmed bytes come
  // from this set, seeded from ListParts on resume.
  doneParts: Set<number>;
  // Signing hands us object keys, so this is how a signed request finds its
  // transfer.
  readonly objectKey: string;
  // The file request's token, for a transfer an uploader without an account
  // sends. Its calls go to the token-bound RPCs.
  token: LinkToken | undefined;
  readonly transferId: TransferId;
  // The upload id already persisted; a new multipart upload for the same
  // transfer records again.
  uploadId: string | undefined;
}

const entries = new Map<TransferId, Entry>();

export const ledger = {
  /** The entry for a signed request's object key, if this tab sends it. */
  byKey: (objectKey: string) => {
    for (const entry of entries.values()) {
      if (entry.objectKey === objectKey) {
        return entry;
      }
    }
    return undefined;
  },
  /** The transfer's entry, made on first use. */
  entry: (transferId: TransferId, objectKey: string) => {
    const known = entries.get(transferId);
    if (known !== undefined) {
      return known;
    }
    const made: Entry = {
      acks: [],
      autoRetries: 0,
      completeSigned: false,
      doneParts: new Set(),
      objectKey,
      token: undefined,
      transferId,
      uploadId: undefined,
    };
    entries.set(transferId, made);
    return made;
  },
  forget: (transferId: TransferId) => {
    entries.delete(transferId);
  },
  of: (transferId: TransferId) => entries.get(transferId),
};

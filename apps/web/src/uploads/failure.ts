import * as Data from "effect/Data";

/**
 * Why an upload stopped, so its row can say what to do next. "gone" is the
 * multipart upload missing (404), which must never restart silently; "denied"
 * is storage refusing the signature (403). Kept apart from uploads.ts so the
 * error words don't pull Uppy into every page.
 */
export class UploadFailed extends Data.TaggedError("UploadFailed")<{
  readonly reason: "denied" | "gone" | "network" | "unknown";
  readonly status: number | undefined;
}> {}

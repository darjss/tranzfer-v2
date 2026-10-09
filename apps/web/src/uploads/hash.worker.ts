import { verifyParts } from "./verify";
import type { VerifyReply, VerifyRequest } from "./verify";

// The options form of postMessage: a worker takes a transfer list, not a
// target origin, and nothing here is transferred.
const reply = (message: VerifyReply) => {
  self.postMessage(message, { transfer: [] });
};

// Worker entry, an adapter edge: a failed read or hash is reported back as a
// message, and the page turns it into a typed failure.
self.addEventListener("message", ({ data }: MessageEvent<VerifyRequest>) => {
  void verifyParts(data.file, data.parts, data.partSize, (checked) => {
    reply({ checked });
  }).then(
    (ok) => {
      reply({ ok });
    },
    () => {
      reply({ failed: true });
    },
  );
});

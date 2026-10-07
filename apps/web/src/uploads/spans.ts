import type { DeliveryId, TransferId } from "@tranzfer/contracts";
import { partCount, partSize } from "@tranzfer/contracts";
import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import type * as Tracer from "effect/Tracer";

type Outcome = "cancelled" | "done" | "failed";
type Attributes = Record<string, boolean | number | string | undefined>;

const defined = (attributes: Attributes) =>
  Object.entries(attributes).filter(([, value]) => value !== undefined);

const finish = (span: Tracer.Span, exit: Exit.Exit<void, Error>) =>
  Effect.flatMap(Clock.currentTimeNanos, (now) =>
    Effect.sync(() => {
      span.end(now, exit);
    }),
  );

const attach = <A, E, R>(parent: Tracer.Span | undefined, effect: Effect.Effect<A, E, R>) =>
  parent === undefined ? effect : Effect.withParentSpan(effect, parent);

/**
 * One span per delivery upload and per file, held open across Uppy callbacks
 * and ended by the upload's outcome, not by the call that started it. Parts
 * get none: a 350 GB file is thousands of them. File names never become
 * attributes; ids, sizes and counts do.
 */
export const makeUploadSpans = Effect.sync(() => {
  const files = new Map<TransferId, { deliveryId: DeliveryId; span: Tracer.Span }>();
  const deliveries = new Map<
    DeliveryId,
    { done: number; failed: number; open: number; span: Tracer.Span }
  >();

  const beginDelivery = (deliveryId: DeliveryId, attributes: Record<string, number | boolean>) =>
    Effect.gen(function* openDelivery() {
      const span = yield* Effect.makeSpan("Uploads.delivery", {
        attributes: { "delivery.id": deliveryId, ...attributes },
      });
      deliveries.set(deliveryId, { done: 0, failed: 0, open: 0, span });
    });

  return {
    /** The send never got as far as a file, so the delivery span ends with it. */
    abandon: (deliveryId: DeliveryId, reason: string) =>
      Effect.suspend(() => {
        const entry = deliveries.get(deliveryId);
        deliveries.delete(deliveryId);
        return entry === undefined ? Effect.void : finish(entry.span, Exit.fail(new Error(reason)));
      }),

    beginDelivery,

    /** A resumed or retried file may arrive without its delivery span; it gets a fresh one. */
    beginFile: (
      deliveryId: DeliveryId,
      transfer: { readonly id: TransferId; readonly size: number },
      resumed: boolean,
    ) =>
      Effect.gen(function* openFile() {
        if (files.has(transfer.id)) {
          return;
        }
        if (!deliveries.has(deliveryId)) {
          yield* beginDelivery(deliveryId, { "upload.resumed": true });
        }
        const delivery = deliveries.get(deliveryId);
        if (delivery === undefined) {
          return;
        }
        delivery.open += 1;
        files.set(transfer.id, {
          deliveryId,
          span: yield* Effect.makeSpan("Uploads.file", {
            attributes: {
              "delivery.id": deliveryId,
              "file.part_count": partCount(transfer.size),
              "file.part_size": partSize(transfer.size),
              "file.size": transfer.size,
              "transfer.id": transfer.id,
              "upload.resumed": resumed,
            },
            parent: delivery.span,
          }),
        });
      }),

    /** Ends the file's span, and the delivery's once its last open file ends. */
    endFile: (transferId: TransferId, outcome: Outcome, attributes: Attributes = {}) =>
      Effect.gen(function* endFile() {
        const file = files.get(transferId);
        if (file === undefined) {
          return;
        }
        files.delete(transferId);
        file.span.attribute("upload.outcome", outcome);
        for (const [key, value] of defined(attributes)) {
          file.span.attribute(key, value);
        }
        yield* finish(
          file.span,
          outcome === "failed" ? Exit.fail(new Error("upload failed")) : Exit.void,
        );
        const delivery = deliveries.get(file.deliveryId);
        if (delivery === undefined) {
          return;
        }
        delivery.open -= 1;
        delivery.done += outcome === "done" ? 1 : 0;
        delivery.failed += outcome === "failed" ? 1 : 0;
        if (delivery.open === 0) {
          deliveries.delete(file.deliveryId);
          delivery.span.attribute("delivery.files_done", delivery.done);
          delivery.span.attribute("delivery.files_failed", delivery.failed);
          yield* finish(
            delivery.span,
            delivery.failed > 0 ? Exit.fail(new Error("files failed")) : Exit.void,
          );
        }
      }),

    /** A moment in the file's upload: an offline pause, a retry, a verification. */
    note: (transferId: TransferId, name: string, attributes: Attributes = {}) =>
      Effect.flatMap(Clock.currentTimeNanos, (now) =>
        Effect.sync(() => {
          files.get(transferId)?.span.event(name, now, Object.fromEntries(defined(attributes)));
        }),
      ),

    /** Runs the effect as a child of the delivery's span. */
    underDelivery:
      (id: DeliveryId) =>
      <A, E, R>(effect: Effect.Effect<A, E, R>) =>
        attach(deliveries.get(id)?.span, effect),

    /** Runs the effect as a child of the file's span. */
    underFile:
      (id: TransferId | undefined) =>
      <A, E, R>(effect: Effect.Effect<A, E, R>) =>
        attach(id === undefined ? undefined : files.get(id)?.span, effect),
  };
});

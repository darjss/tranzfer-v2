import { DeliveryId, rateLimits, TransferId } from "@tranzfer/contracts";
import type { NewDelivery, NewFile, RetentionDays } from "@tranzfer/contracts";
import { Database, schema } from "@tranzfer/db";
import { testDatabase } from "@tranzfer/db/testing";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Redacted from "effect/Redacted";

import { Deliveries } from "../src/deliveries";
import { FileRequests } from "../src/file-requests";
import { LinkTokens } from "../src/link-tokens";
import { Plans } from "../src/plans";
import { SharedLinks } from "../src/shared-links";
import { Storage } from "../src/storage";
import type { StoredObject } from "../src/storage";
import { SigningRate, Transfers } from "../src/transfers";

/** Object storage as a map; tests put objects the way a browser upload would. */
export const makeMemoryStorage = () => {
  const objects = new Map<string, StoredObject>();
  const purged: string[] = [];
  const sealed: string[] = [];
  const layer = Layer.succeed(
    Storage,
    Storage.of({
      head: (key) => Effect.succeed(Option.fromNullishOr(objects.get(key))),
      purge: (prefix, keys) =>
        Effect.sync(() => {
          purged.push(prefix);
          for (const key of keys) {
            objects.delete(key);
          }
        }),
      seal: (key) =>
        Effect.sync(() => {
          sealed.push(key);
        }),
      signDownload: (key) =>
        Effect.succeed({ expiresAt: new Date(0), headers: {}, url: `memory://get/${key}` }),
      signUpload: (key, request) =>
        Effect.succeed({
          expiresAt: new Date(0),
          headers: {},
          url: `memory://${request._tag}/${key}`,
        }),
    }),
  );
  return { layer, objects, purged, sealed };
};

/** A rate-limit binding as a count per key that never resets. */
const counting = (limit: number) => {
  const counts = new Map<string, number>();
  return (key: string) =>
    Effect.sync(() => {
      const count = (counts.get(key) ?? 0) + 1;
      counts.set(key, count);
      return count <= limit;
    });
};

/** The domain over a fresh migrated local D1 and the given storage. */
export const domainLayer = (storage: Layer.Layer<Storage>) =>
  Layer.mergeAll(
    Layer.suspend(() =>
      SharedLinks.layer({
        allowIp: counting(rateLimits.passwordAttemptsPerIp.limit),
        allowLink: counting(rateLimits.passwordAttemptsPerLink.limit),
      }),
    ),
    FileRequests.layer({
      callsPerIp: counting(rateLimits.portalCallsPerIp.limit),
      callsPerRequest: counting(rateLimits.portalCallsPerRequest.limit),
      uploadsPerIp: counting(rateLimits.portalUploadsPerIp.limit),
    }).pipe(Layer.provideMerge(Transfers.layer)),
  ).pipe(
    Layer.provideMerge(
      Layer.sync(SigningRate, () =>
        SigningRate.of({ allow: counting(rateLimits.uploadSigning.limit) }),
      ),
    ),
    Layer.provideMerge(Deliveries.layer),
    Layer.provideMerge(Plans.layer(counting(rateLimits.codeRedemptions.limit))),
    Layer.provideMerge(
      LinkTokens.layer(Effect.succeed(Redacted.make("test-link-secret-0123456789abcdef"))),
    ),
    Layer.provideMerge(storage),
    Layer.provideMerge(testDatabase),
  );

export const addUser = (id: string, name = "Sender") =>
  Effect.flatMap(Effect.service(Database), ({ db }) =>
    db.insert(schema.user).values({ email: `${id}@test`, id, name }),
  ).pipe(Effect.orDie);

export const newFile = (path: string, size: number): NewFile => ({
  contentType: null,
  id: TransferId.make(crypto.randomUUID()),
  lastModified: 0,
  path,
  size,
});

export const newDelivery = (
  files: readonly NewFile[],
  title = "Delivery",
  retentionDays: RetentionDays = 3,
): NewDelivery => ({
  files,
  id: DeliveryId.make(crypto.randomUUID()),
  retentionDays,
  title,
});

/** The first transfer of a delivery; transfers come back ordered by path. */
export const first = <A>(items: readonly A[]) => {
  const [item] = items;
  if (item === undefined) {
    throw new Error("expected at least one transfer");
  }
  return item;
};

export const firstTwo = <A>(items: readonly A[]) => {
  const [one, two] = items;
  if (one === undefined || two === undefined) {
    throw new Error(`expected two transfers, got ${items.length}`);
  }
  return [one, two] as const;
};

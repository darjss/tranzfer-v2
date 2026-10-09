import * as Effect from "effect/Effect";
import * as Base64Url from "effect/encoding/Base64Url";

const encoder = new TextEncoder();

// PBKDF2-SHA256 is the one slow KDF WebCrypto has in a Worker, with no WASM to
// ship. Workers refuse more than 100,000 iterations, so that is the cost. It is
// below OWASP's 600,000 for PBKDF2-SHA256; the attempt limits in SharedLinks
// and a random 128-bit salt per password carry the rest. The count is stored
// with each hash, so a later change to it doesn't lock anyone out.
const ITERATIONS = 100_000;
const SCHEME = "pbkdf2-sha256";

// WebCrypto is Promise-only, so this is an adapter edge.
const derive = async (password: string, salt: Uint8Array<ArrayBuffer>, iterations: number) => {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { hash: "SHA-256", iterations, name: "PBKDF2", salt },
    key,
    256,
  );
  return new Uint8Array(bits);
};

/** `pbkdf2-sha256$<iterations>$<salt>$<hash>`: the only form a password is ever stored in. */
export const hashPassword = Effect.fn("Passwords.hash")(function* hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = yield* Effect.promise(async () => await derive(password, salt, ITERATIONS));
  return `${SCHEME}$${ITERATIONS}$${Base64Url.encode(salt)}$${Base64Url.encode(hash)}`;
});

// A guess can't steer where the derived bytes first differ from the stored
// ones, so an early exit here tells an attacker nothing.
const sameBytes = (left: Uint8Array, right: Uint8Array) =>
  left.length === right.length && left.every((byte, index) => byte === right[index]);

export const checkPassword = Effect.fn("Passwords.check")(function* checkPassword(
  password: string,
  stored: string,
) {
  const [scheme, rounds, saltText, hashText, ...rest] = stored.split("$");
  const iterations = Number(rounds);
  const salt = Base64Url.decode(saltText ?? "");
  const expected = Base64Url.decode(hashText ?? "");
  if (
    scheme !== SCHEME ||
    rest.length > 0 ||
    !Number.isSafeInteger(iterations) ||
    iterations < 1 ||
    salt._tag === "Failure" ||
    expected._tag === "Failure"
  ) {
    // Only hashPassword writes this column.
    return yield* Effect.die(new Error("Stored password hash is malformed"));
  }
  const actual = yield* Effect.promise(
    async () => await derive(password, new Uint8Array(salt.success), iterations),
  );
  return sameBytes(actual, expected.success);
});

import type { RuntimeContext } from "alchemy";
import type { HttpEffect } from "alchemy/Http";
import * as Cloudflare from "alchemy/Cloudflare";

// The class is the deploy-time identifier; index.ts supplies props and impl
// through .make(), which bundlers tree-shake out of consumers. The runtime
// provides RuntimeContext to fetch, so per-request code may require it.
export class ApiWorker extends Cloudflare.Worker<
  ApiWorker,
  { fetch: HttpEffect<RuntimeContext> }
>()("Api") {}

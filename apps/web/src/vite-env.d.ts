/// <reference types="vite-plus/client" />
/// <reference types="@solidjs/vite-plugin/boundary-modules" />
/// <reference types="@solidjs/vite-plugin/virtual-solid-manifest" />
/// <reference types="../file-routes.d.ts" />

interface ImportMetaEnv {
  /** Set per stage at deploy from PAID_PLANS_OPEN (infra/alchemy.run.ts). */
  readonly VITE_PAID_PLANS_OPEN?: "false" | "true";
}

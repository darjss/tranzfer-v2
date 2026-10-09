/// <reference types="vite-plus/client" />
/// <reference types="@solidjs/vite-plugin/boundary-modules" />
/// <reference types="@solidjs/vite-plugin/virtual-solid-manifest" />
/// <reference types="../file-routes.d.ts" />

/** An image imported as `?w=…;…&as=img`: the largest size plus a srcset of all sizes. */
interface ResponsiveImage {
  readonly src: string;
  readonly srcset: string;
  readonly w: number;
  readonly h: number;
}

declare module "*.webp?*" {
  const image: ResponsiveImage;
  export default image;
}

interface ImportMetaEnv {
  /** Set per stage at deploy from PAID_PLANS_OPEN (infra/alchemy.run.ts). */
  readonly VITE_PAID_PLANS_OPEN?: "false" | "true";
}

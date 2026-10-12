// Writes file-routes.d.ts so `vp check` can typecheck before any Vite run.
// The filesystem-routing plugin writes it in buildStart, so start a server
// in middleware mode and close it. The flag keeps the Worker runtime off.
import { createServer } from "vite-plus";

process.env.ALCHEMY_CLOUDFLARE_VITE_INJECTED = "1";
const server = await createServer({ logLevel: "warn", server: { middlewareMode: true } });
await server.close();

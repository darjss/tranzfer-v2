import { createAuthClient } from "better-auth/client";

// Same-origin client: routes/api/auth/[...all].ts forwards /api/auth/* to the
// API worker over the service binding.
export const authClient = createAuthClient({ basePath: "/api/auth" });

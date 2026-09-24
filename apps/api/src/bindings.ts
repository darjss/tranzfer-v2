// Pure constants only: infra/alchemy.run.ts imports this file in the deploy
// process, so it stays free of application imports.
export const envBindings = {
  appUrl: "APP_URL",
  betterAuthSecret: "BETTER_AUTH_SECRET",
  googleClientId: "GOOGLE_CLIENT_ID",
  googleClientSecret: "GOOGLE_CLIENT_SECRET",
} as const;

// Pure constants only: infra/alchemy.run.ts imports this file and runs under
// infra's own effect version, so importing anything here poisons that process.
export const envBindings = {
  appUrl: "APP_URL",
  betterAuthSecret: "BETTER_AUTH_SECRET",
  googleClientId: "GOOGLE_CLIENT_ID",
  googleClientSecret: "GOOGLE_CLIENT_SECRET",
} as const;

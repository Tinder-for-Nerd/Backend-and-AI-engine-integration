import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

import { db } from "@tfn/db";

export function createBetterAuth(options: {
  baseUrl: string;
  secret: string;
  googleClientId?: string;
  googleClientSecret?: string;
  linkedinClientId?: string;
  linkedinClientSecret?: string;
}) {
  const socialProviders: Record<string, { clientId: string; clientSecret: string }> = {};
  if (options.googleClientId && options.googleClientSecret) {
    socialProviders.google = {
      clientId: options.googleClientId,
      clientSecret: options.googleClientSecret,
    };
  }
  if (options.linkedinClientId && options.linkedinClientSecret) {
    socialProviders.linkedin = {
      clientId: options.linkedinClientId,
      clientSecret: options.linkedinClientSecret,
    };
  }

  return betterAuth({
    baseURL: options.baseUrl,
    secret: options.secret,
    database: drizzleAdapter(db, {
      provider: "pg",
    }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
    },
    socialProviders,
  });
}

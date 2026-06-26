import type { FastifyInstance } from "fastify";
import { sql } from "drizzle-orm";

import { env } from "../config/env.js";

export async function healthRoutes(app: FastifyInstance) {
  app.get("/health", async () => ({ status: "ok", service: "tfn-fastify-api" }));

  app.get("/ready", async () => {
    const dbStart = Date.now();
    await app.db.execute(sql`select 1`);
    const redisStart = Date.now();
    await app.redis.ping();
    const chroma = await checkChroma();
    const ollama = env.AI_PROVIDER === "ollama" ? await checkOllama() : null;

    return {
      status: chroma.status === "ok" && (!ollama || ollama.status === "ok") ? "ready" : "degraded",
      checks: {
        database: { status: "ok", latencyMs: Date.now() - dbStart },
        redis: { status: "ok", latencyMs: Date.now() - redisStart },
        chroma,
        ...(ollama ? { ollama } : {}),
      },
      integrations: {
        aiProvider: {
          active: env.AI_PROVIDER,
          embeddingModel: env.AI_PROVIDER === "ollama" ? env.OLLAMA_EMBEDDING_MODEL : env.QWEN_EMBEDDING_MODEL,
          chatModel: env.AI_PROVIDER === "ollama" ? env.OLLAMA_CHAT_MODEL : env.QWEN_CHAT_MODEL,
        },
        ollama: configured(env.AI_PROVIDER === "ollama", ["AI_PROVIDER=ollama", "OLLAMA_BASE_URL"]),
        qwen: configured(env.AI_PROVIDER === "qwen" && Boolean(env.QWEN_API_KEY), ["AI_PROVIDER=qwen", "QWEN_API_KEY"]),
        r2: configured(Boolean(env.R2_ACCOUNT_ID && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY && env.R2_BUCKET), [
          "R2_ACCOUNT_ID",
          "R2_ACCESS_KEY_ID",
          "R2_SECRET_ACCESS_KEY",
          "R2_BUCKET",
        ]),
        resend: configured(Boolean(env.RESEND_API_KEY), ["RESEND_API_KEY"]),
        stripe: configured(Boolean(env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET && env.STRIPE_PRICE_PRO && env.STRIPE_PRICE_TEAM), [
          "STRIPE_SECRET_KEY",
          "STRIPE_WEBHOOK_SECRET",
          "STRIPE_PRICE_PRO",
          "STRIPE_PRICE_TEAM",
        ]),
        googleOAuth: configured(Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET), ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"]),
        linkedinOAuth: configured(Boolean(env.LINKEDIN_CLIENT_ID && env.LINKEDIN_CLIENT_SECRET), [
          "LINKEDIN_CLIENT_ID",
          "LINKEDIN_CLIENT_SECRET",
        ]),
      },
    };
  });
}

function configured(isConfigured: boolean, requiredEnv: string[]) {
  return {
    status: isConfigured ? "configured" : "missing_config",
    requiredEnv,
  };
}

async function checkChroma() {
  const start = Date.now();
  try {
    const baseUrl = env.CHROMA_URL.replace(/\/$/, "");
    const response = await fetch(`${baseUrl}/api/v2/heartbeat`, {
      signal: AbortSignal.timeout(3_000),
    });
    return {
      status: response.ok ? "ok" : "error",
      latencyMs: Date.now() - start,
    };
  } catch {
    return {
      status: "unreachable",
      latencyMs: Date.now() - start,
    };
  }
}

async function checkOllama() {
  const start = Date.now();
  try {
    const response = await fetch(`${env.OLLAMA_BASE_URL.replace(/\/$/, "")}/api/tags`, {
      signal: AbortSignal.timeout(3_000),
    });
    return {
      status: response.ok ? "ok" : "error",
      latencyMs: Date.now() - start,
    };
  } catch {
    return {
      status: "unreachable",
      latencyMs: Date.now() - start,
    };
  }
}

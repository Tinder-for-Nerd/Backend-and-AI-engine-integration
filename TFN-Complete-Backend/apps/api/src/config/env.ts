import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { config } from "dotenv";
import { z } from "zod";

const here = dirname(fileURLToPath(import.meta.url));

// Load env files from common launch locations:
// - repo root: pnpm dev
// - apps/api: pnpm --filter @tfn/api dev
// - dist output after build
for (const path of [
  resolve(process.cwd(), ".env"),
  resolve(process.cwd(), "../../.env"),
  resolve(here, "../../../.env"),
  resolve(here, "../../../../.env"),
]) {
  config({ path, override: false });
}

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  API_BASE_URL: z.string().url().default("http://localhost:3000"),
  WEB_APP_URL: z.string().url().default("http://localhost:3000"),
  CORS_ORIGINS: z.string().default("http://localhost:3000,http://localhost:5173,http://localhost:8501"),
  DATABASE_URL: z.string().url().default("postgres://postgres:postgres@localhost:5432/tfn"),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  BETTER_AUTH_SECRET: z.string().min(16).default("development-better-auth-secret-change-me"),
  JWT_SECRET: z.string().min(16).default("development-jwt-secret-change-me"),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  REFRESH_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(2_592_000),
  COOKIE_DOMAIN: z.string().optional().default(""),
  COOKIE_SECURE: z.coerce.boolean().default(false),
  GOOGLE_CLIENT_ID: z.string().optional().default(""),
  GOOGLE_CLIENT_SECRET: z.string().optional().default(""),
  LINKEDIN_CLIENT_ID: z.string().optional().default(""),
  LINKEDIN_CLIENT_SECRET: z.string().optional().default(""),
  R2_ACCOUNT_ID: z.string().optional().default(""),
  R2_ACCESS_KEY_ID: z.string().optional().default(""),
  R2_SECRET_ACCESS_KEY: z.string().optional().default(""),
  R2_BUCKET: z.string().optional().default(""),
  R2_PUBLIC_BASE_URL: z.string().optional().default(""),
  RESEND_API_KEY: z.string().optional().default(""),
  RESEND_FROM_EMAIL: z.string().default("TFN <notifications@example.com>"),
  STRIPE_PUBLISHABLE_KEY: z.string().optional().default(""),
  STRIPE_SECRET_KEY: z.string().optional().default(""),
  STRIPE_WEBHOOK_SECRET: z.string().optional().default(""),
  STRIPE_PRICE_PRO: z.string().optional().default(""),
  STRIPE_PRICE_TEAM: z.string().optional().default(""),
  OPENAI_API_KEY: z.string().optional().default(""),
  AI_PROVIDER: z.enum(["ollama", "qwen"]).default("ollama"),
  OLLAMA_BASE_URL: z.string().url().default("http://localhost:11434"),
  OLLAMA_EMBEDDING_MODEL: z.string().default("nomic-embed-text"),
  OLLAMA_CHAT_MODEL: z.string().default("qwen2.5:7b"),
  OLLAMA_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),
  QWEN_API_KEY: z.string().optional().default(""),
  QWEN_BASE_URL: z.string().url().default("https://dashscope-intl.aliyuncs.com/compatible-mode/v1"),
  QWEN_EMBEDDING_MODEL: z.string().default("text-embedding-v3"),
  QWEN_CHAT_MODEL: z.string().default("qwen-plus"),
  QWEN_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
  CHROMA_URL: z.string().url().default("http://localhost:8000"),
  CHROMA_PROFILE_COLLECTION: z.string().default("tfn_freelancer_profiles"),
  CHROMA_PROJECT_COLLECTION: z.string().default("tfn_project_requirements"),
  EMBEDDING_DEBOUNCE_MS: z.coerce.number().int().nonnegative().default(300_000),
  MATCH_EXPLANATION_TTL_SECONDS: z.coerce.number().int().positive().default(86_400),
  MATCH_FEED_CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(120),
});

export const env = envSchema.parse(process.env);

export const corsOrigins = env.CORS_ORIGINS.split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

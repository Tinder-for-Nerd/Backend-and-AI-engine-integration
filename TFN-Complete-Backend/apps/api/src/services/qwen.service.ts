import type { z } from "zod";

import { env } from "../config/env.js";

interface ChatMessage {
  role: "system" | "user";
  content: string;
}

function requireQwenApiKey() {
  if (!env.QWEN_API_KEY) {
    throw new Error("qwen_not_configured");
  }
  return env.QWEN_API_KEY;
}

async function postJson<T>(url: string, body: Record<string, unknown>, timeoutMs: number, headers: Record<string, string> = {}): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...headers,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`ai_request_failed:${response.status}:${detail.slice(0, 300)}`);
    }

    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

async function postQwen<T>(path: string, body: Record<string, unknown>): Promise<T> {
  return postJson<T>(`${env.QWEN_BASE_URL.replace(/\/$/, "")}${path}`, body, env.QWEN_REQUEST_TIMEOUT_MS, {
    authorization: `Bearer ${requireQwenApiKey()}`,
  });
}

async function postOllama<T>(path: string, body: Record<string, unknown>): Promise<T> {
  return postJson<T>(`${env.OLLAMA_BASE_URL.replace(/\/$/, "")}${path}`, body, env.OLLAMA_REQUEST_TIMEOUT_MS);
}

export async function createEmbedding(text: string) {
  if (env.AI_PROVIDER === "ollama") {
    const payload = await postOllama<{
      embedding?: number[];
    }>("/api/embeddings", {
      model: env.OLLAMA_EMBEDDING_MODEL,
      prompt: text,
    });

    if (!payload.embedding?.length) {
      throw new Error("ollama_embedding_empty");
    }
    return payload.embedding;
  }

  const payload = await postQwen<{
    data?: Array<{ embedding?: number[] }>;
  }>("/embeddings", {
    model: env.QWEN_EMBEDDING_MODEL,
    input: text,
  });

  const embedding = payload.data?.[0]?.embedding;
  if (!embedding?.length) {
    throw new Error("qwen_embedding_empty");
  }
  return embedding;
}

function extractJson(content: string) {
  const trimmed = content.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first >= 0 && last > first) {
    return trimmed.slice(first, last + 1);
  }

  throw new Error("qwen_json_not_found");
}

export async function completeJson<T>(messages: ChatMessage[], schema: z.ZodType<T>) {
  if (env.AI_PROVIDER === "ollama") {
    const payload = await postOllama<{
      message?: { content?: string };
      response?: string;
    }>("/api/chat", {
      model: env.OLLAMA_CHAT_MODEL,
      stream: false,
      format: "json",
      messages,
      options: {
        temperature: 0.1,
      },
    });

    const content = payload.message?.content ?? payload.response;
    if (!content) {
      throw new Error("ollama_completion_empty");
    }

    return schema.parse(JSON.parse(extractJson(content)));
  }

  const payload = await postQwen<{
    choices?: Array<{ message?: { content?: string } }>;
  }>("/chat/completions", {
    model: env.QWEN_CHAT_MODEL,
    temperature: 0.1,
    response_format: { type: "json_object" },
    messages,
  });

  const content = payload.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("qwen_completion_empty");
  }

  return schema.parse(JSON.parse(extractJson(content)));
}

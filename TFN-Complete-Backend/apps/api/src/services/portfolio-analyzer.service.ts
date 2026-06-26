import { z } from "zod";

import { createSourceHash } from "./text-blobs.service.js";
import { completeJson } from "./qwen.service.js";

const portfolioScoreSchema = z.object({
  score: z.number().min(0).max(1),
  summary: z.string().nullable().default(null),
  strengths: z.array(z.string()).default([]),
  risks: z.array(z.string()).default([]),
});

export type PortfolioScoreResult = z.infer<typeof portfolioScoreSchema>;

function fallbackScore(blob: string): PortfolioScoreResult {
  const urlCount = (blob.match(/https?:\/\//g) ?? []).length;
  const lengthScore = Math.min(0.4, blob.length / 3000);
  const score = Math.min(1, 0.25 + lengthScore + Math.min(0.35, urlCount * 0.12));

  return {
    score: Number(score.toFixed(2)),
    summary: "Portfolio quality estimated from available profile and portfolio detail.",
    strengths: urlCount ? ["Includes public portfolio links"] : [],
    risks: blob.length < 500 ? ["Limited portfolio detail available"] : [],
  };
}

export async function analyzePortfolioBlob(blob: string) {
  const enrichedBlob = await enrichPortfolioBlob(blob);
  const sourceHash = createSourceHash(enrichedBlob);

  try {
    const result = await completeJson(
      [
        {
          role: "system",
          content:
            "Evaluate freelancer portfolio quality for a technical marketplace. Use any fetched portfolio or GitHub page excerpts as evidence. Return strict JSON with score 0..1, summary, strengths, and risks.",
        },
        { role: "user", content: enrichedBlob },
      ],
      portfolioScoreSchema,
    );
    return { ...result, sourceHash, raw: result };
  } catch {
    const result = fallbackScore(enrichedBlob);
    return { ...result, sourceHash, raw: { ...result, fallback: true } };
  }
}

async function enrichPortfolioBlob(blob: string) {
  const urls = extractPublicUrls(blob).slice(0, 5);
  if (!urls.length) {
    return blob;
  }

  const excerpts = await Promise.all(urls.map((url) => fetchPortfolioExcerpt(url)));
  const fetched = excerpts.filter(Boolean).join("\n\n");
  return fetched ? `${blob}\n\nFetched portfolio page excerpts:\n${fetched}` : blob;
}

function extractPublicUrls(blob: string) {
  const matches = blob.match(/https?:\/\/[^\s)]+/g) ?? [];
  return [...new Set(matches.map((url) => url.replace(/[.,;]+$/, "")))].filter(isPublicHttpUrl);
}

function isPublicHttpUrl(value: string) {
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) return false;
    const host = url.hostname.toLowerCase();
    // Avoid fetching obvious local/private targets from worker infrastructure.
    if (host === "localhost" || host.endsWith(".local") || host === "::1") return false;
    if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host)) return false;
    if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return false;
    return true;
  } catch {
    return false;
  }
}

async function fetchPortfolioExcerpt(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(url, {
      headers: { "user-agent": "TFN-Portfolio-Analyzer/1.0" },
      redirect: "follow",
      signal: controller.signal,
    });
    const contentType = response.headers.get("content-type") ?? "";
    if (!response.ok || !/(text\/|application\/json|application\/ld\+json)/i.test(contentType)) {
      return "";
    }
    const text = stripMarkup((await response.text()).slice(0, 80_000));
    return `URL: ${url}\n${text.slice(0, 4_000)}`;
  } catch {
    return "";
  } finally {
    clearTimeout(timeout);
  }
}

function stripMarkup(value: string) {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

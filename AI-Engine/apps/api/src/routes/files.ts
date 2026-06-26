import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { createR2Client, createSignedUploadUrl } from "@tfn/integrations";
import { fileAssets } from "@tfn/db";

import { env } from "../config/env.js";
import { parseBody } from "../utils/validation.js";

export async function filesRoutes(app: FastifyInstance) {
  app.post("/signed-upload", { preHandler: app.requireAuth }, async (request, reply) => {
    const body = parseBody(
      z.object({
        purpose: z.enum(["portfolio", "attachment", "avatar", "company_logo"]),
        filename: z.string().min(1).max(240),
        contentType: z.string().min(1).max(120),
        sizeBytes: z.number().int().positive().optional(),
      }),
      request.body,
    );

    if (!env.R2_ACCOUNT_ID || !env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY || !env.R2_BUCKET) {
      return reply.code(503).send({ error: "r2_not_configured" });
    }

    const safeName = body.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    const key = `${request.user!.id}/${body.purpose}/${crypto.randomUUID()}-${safeName}`;
    const config = {
      accountId: env.R2_ACCOUNT_ID,
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      bucket: env.R2_BUCKET,
      publicBaseUrl: env.R2_PUBLIC_BASE_URL || undefined,
    };
    const client = createR2Client(config);
    const signed = await createSignedUploadUrl(client, config, {
      key,
      contentType: body.contentType,
    });
    const [asset] = await app.db
      .insert(fileAssets)
      .values({
        ownerId: request.user!.id,
        purpose: body.purpose,
        bucket: env.R2_BUCKET,
        key,
        contentType: body.contentType,
        sizeBytes: body.sizeBytes,
        publicUrl: signed.publicUrl,
      })
      .returning();

    return { ...signed, asset };
  });
}

import { and, desc, eq, isNull, or } from "drizzle-orm";
import type { FastifyInstance } from "fastify";

import { conversations, messages, users } from "@tfn/db";
import { idParamSchema, messageCreateSchema } from "@tfn/shared";

import { automateMessageReceived } from "../services/automation.js";
import { parseBody, parseParams } from "../utils/validation.js";

export async function messagesRoutes(app: FastifyInstance) {
  app.get("/conversations", { preHandler: app.requireAuth }, async (request) => {
    return app.db
      .select()
      .from(conversations)
      .where(or(eq(conversations.startupUserId, request.user!.id), eq(conversations.freelancerUserId, request.user!.id)))
      .orderBy(desc(conversations.lastMessageAt));
  });

  app.get("/conversations/:id", { preHandler: app.requireAuth }, async (request, reply) => {
    const { id } = parseParams(idParamSchema, request.params);
    const conversation = await requireConversationMember(app, id, request.user!.id);
    if (!conversation) {
      return reply.code(404).send({ error: "conversation_not_found" });
    }
    const rows = await app.db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, id))
      .orderBy(desc(messages.createdAt))
      .limit(100);
    return rows.reverse();
  });

  app.post("/", { preHandler: app.requireAuth }, async (request, reply) => {
    const body = parseBody(messageCreateSchema, request.body);
    const conversation = await requireConversationMember(app, body.conversationId, request.user!.id);
    if (!conversation) {
      return reply.code(404).send({ error: "conversation_not_found" });
    }
    const [message] = await app.db
      .insert(messages)
      .values({
        conversationId: body.conversationId,
        senderId: request.user!.id,
        body: body.body,
        attachmentIds: body.attachmentIds,
      })
      .returning();
    await app.db.update(conversations).set({ lastMessageAt: new Date(), updatedAt: new Date() }).where(eq(conversations.id, body.conversationId));

    const recipientId = conversation.startupUserId === request.user!.id ? conversation.freelancerUserId : conversation.startupUserId;
    const [sender] = await app.db.select().from(users).where(eq(users.id, request.user!.id)).limit(1);
    await automateMessageReceived(app, {
      recipientUserId: recipientId,
      senderName: sender?.name ?? request.user!.email,
      conversationId: body.conversationId,
      messageId: message!.id,
      preview: body.body,
    });
    return reply.code(201).send(message);
  });

  app.post("/conversations/:id/read", { preHandler: app.requireAuth }, async (request, reply) => {
    const { id } = parseParams(idParamSchema, request.params);
    const conversation = await requireConversationMember(app, id, request.user!.id);
    if (!conversation) {
      return reply.code(404).send({ error: "conversation_not_found" });
    }
    await app.db
      .update(messages)
      .set({ readAt: new Date(), updatedAt: new Date() })
      .where(and(eq(messages.conversationId, id), isNull(messages.readAt)));
    return { ok: true };
  });
}

async function requireConversationMember(app: FastifyInstance, conversationId: string, userId: string) {
  const [conversation] = await app.db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.id, conversationId),
        or(eq(conversations.startupUserId, userId), eq(conversations.freelancerUserId, userId)),
      ),
    )
    .limit(1);
  return conversation;
}

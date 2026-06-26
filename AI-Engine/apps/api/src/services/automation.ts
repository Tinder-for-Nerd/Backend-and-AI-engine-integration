import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";

import { users } from "@tfn/db";
import type { EmailJob, NotificationJob } from "@tfn/queue";
import type { NotificationType } from "@tfn/shared";

type EmailTemplate = EmailJob["template"];

interface UserRecipient {
  id: string;
  email: string;
  name: string | null;
}

async function getRecipient(app: FastifyInstance, userId: string): Promise<UserRecipient | null> {
  const [user] = await app.db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user?.email) {
    return null;
  }
  return {
    id: user.id,
    email: user.email,
    name: user.name,
  };
}

async function enqueueNotification(app: FastifyInstance, job: NotificationJob) {
  await app.queues.notifications.add(job.type, job);
}

async function enqueueEmail(
  app: FastifyInstance,
  recipient: UserRecipient,
  input: { subject: string; template: EmailTemplate; data?: Record<string, unknown> },
) {
  await app.queues.email.add(input.template, {
    to: recipient.email,
    subject: input.subject,
    template: input.template,
    data: {
      name: recipient.name ?? recipient.email,
      ...input.data,
    },
  });
}

export async function automateWelcome(app: FastifyInstance, userId: string) {
  const recipient = await getRecipient(app, userId);
  if (!recipient) return;

  const metadata = { automation: "welcome" };
  await enqueueNotification(app, {
    userId,
    type: "welcome",
    title: "Welcome to TFN",
    body: "Your account is ready. Complete your profile to start matching.",
    metadata,
  });
  await enqueueEmail(app, recipient, {
    subject: "Welcome to TFN",
    template: "welcome",
    data: metadata,
  });
}

export async function automateApplicationReceived(
  app: FastifyInstance,
  input: {
    startupUserId: string;
    applicationId: string;
    projectId: string;
    projectTitle: string;
    freelancerName?: string | null;
  },
) {
  const recipient = await getRecipient(app, input.startupUserId);
  if (!recipient) return;

  const metadata = {
    automation: "application_received",
    applicationId: input.applicationId,
    projectId: input.projectId,
    projectTitle: input.projectTitle,
    freelancerName: input.freelancerName ?? "A freelancer",
  };
  await enqueueNotification(app, {
    userId: input.startupUserId,
    type: "application_update",
    title: "New application received",
    body: `${metadata.freelancerName} applied to ${input.projectTitle}.`,
    metadata,
  });
  await enqueueEmail(app, recipient, {
    subject: `New application: ${input.projectTitle}`,
    template: "application_received",
    data: metadata,
  });
}

export async function automateApplicationStatus(
  app: FastifyInstance,
  input: {
    freelancerUserId: string;
    applicationId: string;
    projectId: string;
    projectTitle: string;
    status: string;
  },
) {
  const recipient = await getRecipient(app, input.freelancerUserId);
  if (!recipient) return;

  const metadata = {
    automation: "application_status",
    applicationId: input.applicationId,
    projectId: input.projectId,
    projectTitle: input.projectTitle,
    status: input.status,
  };
  await enqueueNotification(app, {
    userId: input.freelancerUserId,
    type: "application_update",
    title: `Application ${input.status}`,
    body: `Your application for ${input.projectTitle} was ${input.status}.`,
    metadata,
  });
  await enqueueEmail(app, recipient, {
    subject: `Application ${input.status}: ${input.projectTitle}`,
    template: "application_status",
    data: metadata,
  });
}

export async function automateMessageReceived(
  app: FastifyInstance,
  input: {
    recipientUserId: string;
    senderName?: string | null;
    conversationId: string;
    messageId: string;
    preview: string;
  },
) {
  const recipient = await getRecipient(app, input.recipientUserId);
  if (!recipient) return;

  const metadata = {
    automation: "message_received",
    conversationId: input.conversationId,
    messageId: input.messageId,
    senderName: input.senderName ?? "Someone",
    preview: input.preview.slice(0, 180),
  };
  await enqueueNotification(app, {
    userId: input.recipientUserId,
    type: "message",
    title: "New message",
    body: metadata.preview,
    metadata,
  });
  await enqueueEmail(app, recipient, {
    subject: "New TFN message",
    template: "message_received",
    data: metadata,
  });
}

export async function automateMatchAlert(
  app: FastifyInstance,
  input: {
    userId: string;
    title: string;
    body: string;
    metadata?: Record<string, unknown>;
  },
) {
  const recipient = await getRecipient(app, input.userId);
  if (!recipient) return;
  const metadata = { automation: "match_alert", ...input.metadata };
  await enqueueNotification(app, {
    userId: input.userId,
    type: "match_alert" satisfies NotificationType,
    title: input.title,
    body: input.body,
    metadata,
  });
  await enqueueEmail(app, recipient, {
    subject: input.title,
    template: "match_alert",
    data: {
      ...metadata,
      title: input.title,
      body: input.body,
    },
  });
}

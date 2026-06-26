import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Resend } from "resend";
import Stripe from "stripe";

export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicBaseUrl?: string | undefined;
}

export function createR2Client(config: R2Config) {
  return new S3Client({
    region: "auto",
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
}

export async function createSignedUploadUrl(
  client: S3Client,
  config: R2Config,
  input: { key: string; contentType: string; expiresIn?: number },
) {
  const command = new PutObjectCommand({
    Bucket: config.bucket,
    Key: input.key,
    ContentType: input.contentType,
  });
  const uploadUrl = await getSignedUrl(client, command, { expiresIn: input.expiresIn ?? 300 });
  const publicUrl = config.publicBaseUrl ? `${config.publicBaseUrl.replace(/\/$/, "")}/${input.key}` : undefined;
  return { uploadUrl, publicUrl, key: input.key };
}

export function createResend(apiKey?: string) {
  return apiKey ? new Resend(apiKey) : null;
}

export async function sendEmail(
  resend: Resend | null,
  input: { from: string; to: string; subject: string; html: string },
) {
  if (!resend) {
    return { id: "resend-disabled", skipped: true };
  }
  return resend.emails.send(input);
}

export function createStripe(secretKey?: string) {
  return secretKey
    ? new Stripe(secretKey, {
        apiVersion: "2025-02-24.acacia",
        typescript: true,
      })
    : null;
}

export function buildEmailTemplate(template: string, data: Record<string, unknown> = {}) {
  const templates: Record<string, { title: string; body: string; cta?: string }> = {
    welcome: {
      title: `Welcome to TFN${data.name ? `, ${String(data.name)}` : ""}`,
      body: "Your account is ready. Complete your profile to start matching with founders and freelancers.",
      cta: "Open TFN and finish your profile.",
    },
    match_alert: {
      title: "You have new matching opportunities",
      body: String(data.body ?? "A new project or freelancer looks like a strong fit for you."),
      cta: "Open your match feed to review the recommendation.",
    },
    confirmation: {
      title: String(data.title ?? "Confirmation"),
      body: String(data.body ?? "Your TFN action was completed successfully."),
    },
    application_received: {
      title: "New application received",
      body: `${String(data.freelancerName ?? "A freelancer")} applied to ${String(data.projectTitle ?? "your project")}.`,
      cta: "Open the hiring dashboard to review the applicant.",
    },
    application_status: {
      title: `Application ${String(data.status ?? "updated")}`,
      body: `Your application for ${String(data.projectTitle ?? "the project")} was ${String(data.status ?? "updated")}.`,
      cta: "Open TFN to see next steps.",
    },
    message_received: {
      title: "New message",
      body: `${String(data.senderName ?? "Someone")} sent you a message: ${String(data.preview ?? "").slice(0, 180)}`,
      cta: "Open the conversation to reply.",
    },
  };
  const resolved = templates[template] ?? {
    title: String(data.title ?? template.replace(/_/g, " ")),
    body: String(data.body ?? "You have a new TFN notification."),
  };
  return `
    <div style="font-family:Inter,Segoe UI,sans-serif;line-height:1.5;color:#111827">
      <h1>${escapeHtml(resolved.title)}</h1>
      <p>${escapeHtml(resolved.body)}</p>
      ${resolved.cta ? `<p><strong>${escapeHtml(resolved.cta)}</strong></p>` : ""}
      <p style="color:#6b7280;font-size:12px">TFN Complete Backend</p>
    </div>
  `;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

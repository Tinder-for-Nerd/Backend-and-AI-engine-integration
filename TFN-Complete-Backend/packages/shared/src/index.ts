import { z } from "zod";

export const roles = ["startup", "freelancer", "admin"] as const;
export const projectStatuses = ["draft", "open", "paused", "filled", "closed"] as const;
export const applicationStatuses = ["applied", "shortlisted", "accepted", "declined", "withdrawn"] as const;
export const subscriptionPlans = ["free", "pro", "team"] as const;
export const subscriptionStatuses = ["inactive", "trialing", "active", "past_due", "canceled"] as const;
export const notificationTypes = [
  "welcome",
  "match_alert",
  "application_update",
  "message",
  "subscription",
  "system",
] as const;

export type Role = (typeof roles)[number];
export type ProjectStatus = (typeof projectStatuses)[number];
export type ApplicationStatus = (typeof applicationStatuses)[number];
export type SubscriptionPlan = (typeof subscriptionPlans)[number];
export type SubscriptionStatus = (typeof subscriptionStatuses)[number];
export type NotificationType = (typeof notificationTypes)[number];

export const idParamSchema = z.object({
  id: z.string().uuid(),
});

export const paginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  name: z.string().min(1).max(160).optional(),
  role: z.enum(roles).default("freelancer"),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const freelancerProfileSchema = z.object({
  title: z.string().max(160).optional(),
  bio: z.string().max(4000).optional(),
  location: z.string().max(160).optional(),
  hourlyRateCents: z.number().int().min(0).optional(),
  projectRateCents: z.number().int().min(0).optional(),
  availability: z.enum(["available", "limited", "unavailable"]).optional(),
  skills: z.array(z.string().min(1).max(80)).max(50).optional(),
});

export const startupProfileSchema = z.object({
  companyName: z.string().min(1).max(180),
  website: z.string().url().optional(),
  industry: z.string().max(120).optional(),
  companySize: z.string().max(80).optional(),
  description: z.string().max(4000).optional(),
});

export const projectSchema = z.object({
  title: z.string().min(3).max(180),
  description: z.string().min(10).max(8000),
  budgetMinCents: z.number().int().min(0).optional(),
  budgetMaxCents: z.number().int().min(0).optional(),
  requiredSkills: z.array(z.string().min(1).max(80)).max(50).default([]),
  status: z.enum(projectStatuses).default("open"),
});

export const applicationCreateSchema = z.object({
  projectId: z.string().uuid(),
  coverLetter: z.string().max(5000).optional(),
  proposedRateCents: z.number().int().min(0).optional(),
});

export const messageCreateSchema = z.object({
  conversationId: z.string().uuid(),
  body: z.string().min(1).max(5000),
  attachmentIds: z.array(z.string().uuid()).max(10).default([]),
});

export const matchSignalSchema = z.object({
  projectId: z.string().uuid().optional(),
  freelancerId: z.string().uuid().optional(),
  signal: z.enum(["view", "save", "skip", "dismiss", "apply", "invite", "hire"]),
  weight: z.number().min(-10).max(10).default(1),
});

export const ratingSchema = z.object({
  projectId: z.string().uuid(),
  revieweeId: z.string().uuid(),
  score: z.number().int().min(1).max(5),
  comment: z.string().max(3000).optional(),
});

export function assertNever(value: never): never {
  throw new Error(`Unexpected value: ${value}`);
}

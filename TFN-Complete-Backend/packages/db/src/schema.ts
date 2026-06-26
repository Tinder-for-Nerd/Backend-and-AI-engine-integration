import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const roleEnum = pgEnum("role", ["startup", "freelancer", "admin"]);
export const projectStatusEnum = pgEnum("project_status", ["draft", "open", "paused", "filled", "closed"]);
export const applicationStatusEnum = pgEnum("application_status", [
  "applied",
  "shortlisted",
  "accepted",
  "declined",
  "withdrawn",
]);
export const subscriptionPlanEnum = pgEnum("subscription_plan", ["free", "pro", "team"]);
export const subscriptionStatusEnum = pgEnum("subscription_status", [
  "inactive",
  "trialing",
  "active",
  "past_due",
  "canceled",
]);
export const availabilityEnum = pgEnum("availability", ["available", "limited", "unavailable"]);
export const notificationTypeEnum = pgEnum("notification_type", [
  "welcome",
  "match_alert",
  "application_update",
  "message",
  "subscription",
  "system",
]);
export const filePurposeEnum = pgEnum("file_purpose", ["portfolio", "attachment", "avatar", "company_logo"]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
};

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: text("email").notNull(),
    emailVerified: boolean("email_verified").default(false).notNull(),
    passwordHash: text("password_hash"),
    name: text("name"),
    image: text("image"),
    role: roleEnum("role").default("freelancer").notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => ({
    emailUnique: uniqueIndex("users_email_unique").on(table.email),
    roleIdx: index("users_role_idx").on(table.role),
  }),
);

export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
    providerId: text("provider_id").notNull(),
    accountId: text("account_id").notNull(),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    ...timestamps,
  },
  (table) => ({
    providerAccountUnique: uniqueIndex("accounts_provider_account_unique").on(table.providerId, table.accountId),
    userIdx: index("accounts_user_idx").on(table.userId),
  }),
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
    token: text("token").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    ...timestamps,
  },
  (table) => ({
    tokenUnique: uniqueIndex("sessions_token_unique").on(table.token),
    userIdx: index("sessions_user_idx").on(table.userId),
    expiresIdx: index("sessions_expires_idx").on(table.expiresAt),
  }),
);

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.identifier, table.token] }),
    tokenIdx: index("verification_tokens_token_idx").on(table.token),
  }),
);

export const lockouts = pgTable(
  "lockouts",
  {
    key: text("key").primaryKey(),
    attempts: integer("attempts").default(0).notNull(),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    lockedUntilIdx: index("lockouts_locked_until_idx").on(table.lockedUntil),
  }),
);

export const freelancers = pgTable(
  "freelancers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
    title: text("title"),
    bio: text("bio"),
    location: text("location"),
    hourlyRateCents: integer("hourly_rate_cents"),
    projectRateCents: integer("project_rate_cents"),
    availability: availabilityEnum("availability").default("available").notNull(),
    skills: text("skills").array().default([]).notNull(),
    portfolioSummary: text("portfolio_summary"),
    profileViews: integer("profile_views").default(0).notNull(),
    ratingAvg: real("rating_avg").default(0).notNull(),
    ratingCount: integer("rating_count").default(0).notNull(),
    ...timestamps,
  },
  (table) => ({
    userUnique: uniqueIndex("freelancers_user_unique").on(table.userId),
    skillsIdx: index("freelancers_skills_idx").using("gin", table.skills),
    availabilityIdx: index("freelancers_availability_idx").on(table.availability),
    rateIdx: index("freelancers_rate_idx").on(table.hourlyRateCents),
  }),
);

export const startups = pgTable(
  "startups",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
    companyName: text("company_name").notNull(),
    website: text("website"),
    industry: text("industry"),
    companySize: text("company_size"),
    description: text("description"),
    logoAssetId: uuid("logo_asset_id"),
    ...timestamps,
  },
  (table) => ({
    userUnique: uniqueIndex("startups_user_unique").on(table.userId),
    industryIdx: index("startups_industry_idx").on(table.industry),
  }),
);

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    startupId: uuid("startup_id").references(() => startups.id, { onDelete: "cascade" }).notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    budgetMinCents: integer("budget_min_cents"),
    budgetMaxCents: integer("budget_max_cents"),
    requiredSkills: text("required_skills").array().default([]).notNull(),
    status: projectStatusEnum("status").default("open").notNull(),
    viewCount: integer("view_count").default(0).notNull(),
    filledByFreelancerId: uuid("filled_by_freelancer_id"),
    ...timestamps,
  },
  (table) => ({
    startupIdx: index("projects_startup_idx").on(table.startupId),
    statusIdx: index("projects_status_idx").on(table.status),
    skillsIdx: index("projects_required_skills_idx").using("gin", table.requiredSkills),
    createdIdx: index("projects_created_idx").on(table.createdAt),
  }),
);

export const portfolioItems = pgTable(
  "portfolio_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    freelancerId: uuid("freelancer_id").references(() => freelancers.id, { onDelete: "cascade" }).notNull(),
    title: text("title").notNull(),
    description: text("description"),
    url: text("url"),
    assetId: uuid("asset_id"),
    ...timestamps,
  },
  (table) => ({
    freelancerIdx: index("portfolio_items_freelancer_idx").on(table.freelancerId),
  }),
);

export const availabilitySlots = pgTable(
  "availability_slots",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    freelancerId: uuid("freelancer_id").references(() => freelancers.id, { onDelete: "cascade" }).notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    timezone: text("timezone").default("UTC").notNull(),
    ...timestamps,
  },
  (table) => ({
    freelancerTimeIdx: index("availability_slots_freelancer_time_idx").on(table.freelancerId, table.startsAt),
  }),
);

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    startupUserId: uuid("startup_user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
    freelancerUserId: uuid("freelancer_user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => ({
    participantsUnique: uniqueIndex("conversations_participants_project_unique").on(
      table.projectId,
      table.startupUserId,
      table.freelancerUserId,
    ),
    startupIdx: index("conversations_startup_idx").on(table.startupUserId),
    freelancerIdx: index("conversations_freelancer_idx").on(table.freelancerUserId),
    lastMessageIdx: index("conversations_last_message_idx").on(table.lastMessageAt),
  }),
);

export const applications = pgTable(
  "applications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
    freelancerId: uuid("freelancer_id").references(() => freelancers.id, { onDelete: "cascade" }).notNull(),
    conversationId: uuid("conversation_id").references(() => conversations.id, { onDelete: "set null" }),
    coverLetter: text("cover_letter"),
    proposedRateCents: integer("proposed_rate_cents"),
    status: applicationStatusEnum("status").default("applied").notNull(),
    ...timestamps,
  },
  (table) => ({
    projectFreelancerUnique: uniqueIndex("applications_project_freelancer_unique").on(table.projectId, table.freelancerId),
    projectStatusIdx: index("applications_project_status_idx").on(table.projectId, table.status),
    freelancerIdx: index("applications_freelancer_idx").on(table.freelancerId),
  }),
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    conversationId: uuid("conversation_id").references(() => conversations.id, { onDelete: "cascade" }).notNull(),
    senderId: uuid("sender_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
    body: text("body").notNull(),
    attachmentIds: uuid("attachment_ids").array().default([]).notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => ({
    conversationCreatedIdx: index("messages_conversation_created_idx").on(table.conversationId, table.createdAt),
    unreadIdx: index("messages_unread_idx").on(table.conversationId, table.readAt),
  }),
);

export const ratings = pgTable(
  "ratings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
    reviewerId: uuid("reviewer_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
    revieweeId: uuid("reviewee_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
    score: integer("score").notNull(),
    comment: text("comment"),
    ...timestamps,
  },
  (table) => ({
    projectReviewerUnique: uniqueIndex("ratings_project_reviewer_unique").on(table.projectId, table.reviewerId),
    revieweeIdx: index("ratings_reviewee_idx").on(table.revieweeId),
  }),
);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
    type: notificationTypeEnum("type").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => ({
    inboxIdx: index("notifications_inbox_idx").on(table.userId, table.readAt, table.createdAt),
  }),
);

export const matchSignals = pgTable(
  "match_signals",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
    freelancerId: uuid("freelancer_id").references(() => freelancers.id, { onDelete: "cascade" }),
    signal: text("signal").notNull(),
    weight: real("weight").default(1).notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
    ...timestamps,
  },
  (table) => ({
    userSignalIdx: index("match_signals_user_signal_idx").on(table.userId, table.signal, table.createdAt),
    projectIdx: index("match_signals_project_idx").on(table.projectId),
    freelancerIdx: index("match_signals_freelancer_idx").on(table.freelancerId),
  }),
);

export const aiEmbeddingRecords = pgTable(
  "ai_embedding_records",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerType: text("owner_type").notNull(),
    ownerId: uuid("owner_id").notNull(),
    vectorId: text("vector_id").notNull(),
    collection: text("collection").notNull(),
    model: text("model").notNull(),
    sourceHash: text("source_hash").notNull(),
    status: text("status").default("pending").notNull(),
    dimensions: integer("dimensions"),
    error: text("error"),
    embeddedAt: timestamp("embedded_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => ({
    ownerUnique: uniqueIndex("ai_embedding_records_owner_unique").on(table.ownerType, table.ownerId),
    vectorUnique: uniqueIndex("ai_embedding_records_vector_unique").on(table.collection, table.vectorId),
    statusIdx: index("ai_embedding_records_status_idx").on(table.status, table.updatedAt),
  }),
);

export const projectRequirementAnalyses = pgTable(
  "project_requirement_analyses",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
    sourceHash: text("source_hash").notNull(),
    extractedSkills: text("extracted_skills").array().default([]).notNull(),
    budgetMinCents: integer("budget_min_cents"),
    budgetMaxCents: integer("budget_max_cents"),
    durationWeeks: integer("duration_weeks"),
    seniority: text("seniority"),
    domain: text("domain"),
    summary: text("summary"),
    raw: jsonb("raw").$type<Record<string, unknown>>().default({}).notNull(),
    analyzedAt: timestamp("analyzed_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => ({
    projectUnique: uniqueIndex("project_requirement_analyses_project_unique").on(table.projectId),
    sourceHashIdx: index("project_requirement_analyses_source_hash_idx").on(table.sourceHash),
  }),
);

export const matchExplanations = pgTable(
  "match_explanations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
    freelancerId: uuid("freelancer_id").references(() => freelancers.id, { onDelete: "cascade" }).notNull(),
    sourceHash: text("source_hash").notNull(),
    explanation: text("explanation").notNull(),
    model: text("model").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (table) => ({
    matchUnique: uniqueIndex("match_explanations_match_unique").on(table.projectId, table.freelancerId, table.sourceHash),
    expiresIdx: index("match_explanations_expires_idx").on(table.expiresAt),
  }),
);

export const portfolioQualityScores = pgTable(
  "portfolio_quality_scores",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    freelancerId: uuid("freelancer_id").references(() => freelancers.id, { onDelete: "cascade" }).notNull(),
    sourceHash: text("source_hash").notNull(),
    score: real("score").default(0).notNull(),
    summary: text("summary"),
    strengths: text("strengths").array().default([]).notNull(),
    risks: text("risks").array().default([]).notNull(),
    raw: jsonb("raw").$type<Record<string, unknown>>().default({}).notNull(),
    evaluatedAt: timestamp("evaluated_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => ({
    freelancerUnique: uniqueIndex("portfolio_quality_scores_freelancer_unique").on(table.freelancerId),
    sourceHashIdx: index("portfolio_quality_scores_source_hash_idx").on(table.sourceHash),
  }),
);

export const fileAssets = pgTable(
  "file_assets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
    purpose: filePurposeEnum("purpose").notNull(),
    bucket: text("bucket").notNull(),
    key: text("key").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes"),
    publicUrl: text("public_url"),
    ...timestamps,
  },
  (table) => ({
    keyUnique: uniqueIndex("file_assets_key_unique").on(table.bucket, table.key),
    ownerIdx: index("file_assets_owner_idx").on(table.ownerId),
  }),
);

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
    plan: subscriptionPlanEnum("plan").default("free").notNull(),
    status: subscriptionStatusEnum("status").default("inactive").notNull(),
    stripeCustomerId: text("stripe_customer_id"),
    stripeSubscriptionId: text("stripe_subscription_id"),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    ...timestamps,
  },
  (table) => ({
    userUnique: uniqueIndex("subscriptions_user_unique").on(table.userId),
    stripeSubUnique: uniqueIndex("subscriptions_stripe_subscription_unique").on(table.stripeSubscriptionId),
    customerIdx: index("subscriptions_customer_idx").on(table.stripeCustomerId),
  }),
);

export const stripeEvents = pgTable(
  "stripe_events",
  {
    id: text("id").primaryKey(),
    type: text("type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    typeIdx: index("stripe_events_type_idx").on(table.type),
  }),
);

export const analyticsEvents = pgTable(
  "analytics_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    subjectUserId: uuid("subject_user_id").references(() => users.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    subjectTypeDateIdx: index("analytics_subject_type_date_idx").on(table.subjectUserId, table.type, table.createdAt),
    projectDateIdx: index("analytics_project_date_idx").on(table.projectId, table.createdAt),
  }),
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    targetIdx: index("audit_logs_target_idx").on(table.targetType, table.targetId),
    actorDateIdx: index("audit_logs_actor_date_idx").on(table.actorId, table.createdAt),
  }),
);

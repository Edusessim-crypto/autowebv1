import {
  pgTable,
  text,
  timestamp,
  integer,
  boolean,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import type { Role } from "@/domain/policies";
import type { Plan } from "@/domain/plans";
import type { statuses } from "@/domain/validation";
import type { LeadSource, LeadStage, ActivityType } from "@/domain/crm";
import type {
  ProjectStatus,
  JobStatus,
  AssetStatus,
  TemplateVariant,
} from "@/domain/studio";
const dates = {
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
};
export const users = pgTable("users", {
  id: text().primaryKey(),
  name: text().notNull(),
  email: text().notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  ...dates,
});
export const dealerships = pgTable("dealerships", {
  id: text().primaryKey(),
  tradeName: text("trade_name").notNull(),
  legalName: text("legal_name"),
  cnpj: text().notNull().unique(),
  slug: text().notNull().unique(),
  phone: text().notNull(),
  city: text().notNull(),
  state: text().notNull(),
  logoUrl: text("logo_url"),
  primaryColor: text("primary_color").notNull().default("#FF1E1E"),
  plan: text().$type<Plan>().notNull().default("START"),
  billingCycle: text("billing_cycle").notNull().default("MONTHLY"),
  subscriptionStatus: text("subscription_status").notNull().default("TRIAL"),
  trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }).notNull(),
  isDemo: boolean("is_demo").notNull().default(false),
  ...dates,
});
export const memberships = pgTable(
  "memberships",
  {
    id: text().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    dealershipId: text("dealership_id")
      .notNull()
      .references(() => dealerships.id),
    role: text().$type<Role>().notNull(),
    status: text().notNull().default("ACTIVE"),
  },
  (t) => [uniqueIndex("membership_unique").on(t.userId, t.dealershipId)],
);
export const sessions = pgTable("sessions", {
  tokenHash: text("token_hash").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  dealershipId: text("dealership_id").references(() => dealerships.id),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});
export const vehicles = pgTable(
  "vehicles",
  {
    id: text().primaryKey(),
    dealershipId: text("dealership_id")
      .notNull()
      .references(() => dealerships.id),
    createdById: text("created_by_id")
      .notNull()
      .references(() => users.id),
    brand: text().notNull(),
    model: text().notNull(),
    version: text().notNull().default(""),
    yearManufacture: integer("year_manufacture").notNull(),
    yearModel: integer("year_model").notNull(),
    mileage: integer().notNull(),
    transmission: text().notNull(),
    fuel: text().notNull(),
    color: text().notNull(),
    price: integer().notNull(),
    plate: text().notNull().default(""),
    description: text().notNull().default(""),
    options: jsonb().$type<string[]>().notNull().default([]),
    status: text()
      .$type<(typeof statuses)[number]>()
      .notNull()
      .default("AVAILABLE"),
    soldAt: timestamp("sold_at", { withTimezone: true }),
    ...dates,
  },
  (t) => [index("vehicle_tenant_idx").on(t.dealershipId, t.createdAt)],
);
export const vehicleMedia = pgTable("vehicle_media", {
  id: text().primaryKey(),
  dealershipId: text("dealership_id")
    .notNull()
    .references(() => dealerships.id),
  vehicleId: text("vehicle_id")
    .notNull()
    .references(() => vehicles.id, { onDelete: "cascade" }),
  storageKey: text("storage_key").notNull(),
  thumbnailKey: text("thumbnail_key").notNull(),
  position: integer().notNull(),
  isCover: boolean("is_cover").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const usage = pgTable(
  "usage",
  {
    id: text().primaryKey(),
    dealershipId: text("dealership_id")
      .notNull()
      .references(() => dealerships.id),
    period: text().notNull(),
    vehicleCount: integer("vehicle_count").notNull().default(0),
  },
  (t) => [uniqueIndex("usage_unique").on(t.dealershipId, t.period)],
);
export const auditLogs = pgTable("audit_logs", {
  id: text().primaryKey(),
  dealershipId: text("dealership_id")
    .notNull()
    .references(() => dealerships.id),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  entityId: text("entity_id").notNull(),
  event: text().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const loginAttempts = pgTable("login_attempts", {
  key: text().primaryKey(),
  count: integer().notNull(),
  resetAt: timestamp("reset_at", { withTimezone: true }).notNull(),
});
export const customers = pgTable(
  "customers",
  {
    id: text().primaryKey(),
    dealershipId: text("dealership_id")
      .notNull()
      .references(() => dealerships.id),
    createdById: text("created_by_id")
      .notNull()
      .references(() => users.id),
    name: text().notNull(),
    phone: text().notNull().default(""),
    whatsapp: text().notNull().default(""),
    email: text().notNull().default(""),
    notes: text().notNull().default(""),
    ...dates,
  },
  (t) => [
    index("customer_tenant_idx").on(t.dealershipId, t.createdAt),
    index("customer_phone_idx").on(t.dealershipId, t.phone),
  ],
);
export const leads = pgTable(
  "leads",
  {
    id: text().primaryKey(),
    dealershipId: text("dealership_id")
      .notNull()
      .references(() => dealerships.id),
    customerId: text("customer_id")
      .notNull()
      .references(() => customers.id),
    vehicleId: text("vehicle_id").references(() => vehicles.id),
    assignedToUserId: text("assigned_to_user_id").references(() => users.id),
    createdById: text("created_by_id")
      .notNull()
      .references(() => users.id),
    source: text().$type<LeadSource>().notNull().default("OTHER"),
    stage: text().$type<LeadStage>().notNull().default("NEW"),
    notes: text().notNull().default(""),
    lastContactAt: timestamp("last_contact_at", { withTimezone: true }),
    nextActionAt: timestamp("next_action_at", { withTimezone: true }),
    lostReason: text("lost_reason").notNull().default(""),
    ...dates,
  },
  (t) => [
    index("lead_stage_idx").on(t.dealershipId, t.stage, t.updatedAt),
    index("lead_assigned_idx").on(t.dealershipId, t.assignedToUserId, t.stage),
    index("lead_vehicle_idx").on(t.dealershipId, t.vehicleId),
    index("lead_customer_idx").on(t.dealershipId, t.customerId),
  ],
);
export const crmActivities = pgTable(
  "crm_activities",
  {
    id: text().primaryKey(),
    dealershipId: text("dealership_id")
      .notNull()
      .references(() => dealerships.id),
    leadId: text("lead_id")
      .notNull()
      .references(() => leads.id),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    type: text().$type<ActivityType>().notNull().default("NOTE"),
    content: text().notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("activity_lead_idx").on(t.leadId, t.createdAt)],
);
export const contentProjects = pgTable(
  "content_projects",
  {
    id: text().primaryKey(),
    dealershipId: text("dealership_id")
      .notNull()
      .references(() => dealerships.id),
    vehicleId: text("vehicle_id")
      .notNull()
      .references(() => vehicles.id),
    createdById: text("created_by_id")
      .notNull()
      .references(() => users.id),
    templateKey: text("template_key").notNull(),
    templateVersion: integer("template_version").notNull().default(1),
    templateVariant: text("template_variant")
      .$type<TemplateVariant>()
      .notNull()
      .default("STANDARD"),
    status: text().$type<ProjectStatus>().notNull().default("DRAFT"),
    configuration: jsonb()
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    errorMessage: text("error_message").notNull().default(""),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    ...dates,
  },
  (t) => [
    index("content_project_tenant_idx").on(t.dealershipId, t.createdAt),
    index("content_project_vehicle_idx").on(t.dealershipId, t.vehicleId),
    index("content_project_status_idx").on(t.dealershipId, t.status),
  ],
);
export const renderJobs = pgTable(
  "render_jobs",
  {
    id: text().primaryKey(),
    dealershipId: text("dealership_id")
      .notNull()
      .references(() => dealerships.id),
    contentProjectId: text("content_project_id")
      .notNull()
      .references(() => contentProjects.id),
    attempt: integer().notNull().default(1),
    status: text().$type<JobStatus>().notNull().default("QUEUED"),
    engineVersion: text("engine_version").notNull().default(""),
    errorCode: text("error_code").notNull().default(""),
    errorMessage: text("error_message").notNull().default(""),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("render_job_project_idx").on(t.contentProjectId, t.attempt),
    index("render_job_status_idx").on(t.dealershipId, t.status),
  ],
);
export const generatedAssets = pgTable(
  "generated_assets",
  {
    id: text().primaryKey(),
    dealershipId: text("dealership_id")
      .notNull()
      .references(() => dealerships.id),
    contentProjectId: text("content_project_id")
      .notNull()
      .references(() => contentProjects.id),
    renderJobId: text("render_job_id").references(() => renderJobs.id),
    sourceMediaId: text("source_media_id").references(() => vehicleMedia.id),
    position: integer().notNull().default(0),
    storageKey: text("storage_key").notNull(),
    mimeType: text("mime_type").notNull().default("image/png"),
    width: integer().notNull().default(0),
    height: integer().notNull().default(0),
    status: text().$type<AssetStatus>().notNull().default("OK"),
    framing: jsonb().$type<Record<string, number>>().notNull().default({}),
    metrics: jsonb().$type<Record<string, number> | null>(),
    issues: jsonb().$type<string[]>().notNull().default([]),
    detectedVehicleType: text("detected_vehicle_type").notNull().default(""),
    photoGroup: text("photo_group").notNull().default(""),
    manuallyAdjusted: boolean("manually_adjusted").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("generated_asset_project_idx").on(t.contentProjectId, t.position),
    index("generated_asset_tenant_idx").on(t.dealershipId, t.createdAt),
  ],
);
export type Vehicle = typeof vehicles.$inferSelect;
export type ContentProject = typeof contentProjects.$inferSelect;
export type RenderJob = typeof renderJobs.$inferSelect;
export type GeneratedAsset = typeof generatedAssets.$inferSelect;
export type Customer = typeof customers.$inferSelect;
export type Lead = typeof leads.$inferSelect;
export type CrmActivity = typeof crmActivities.$inferSelect;
export type Dealership = typeof dealerships.$inferSelect;
export type Media = typeof vehicleMedia.$inferSelect;

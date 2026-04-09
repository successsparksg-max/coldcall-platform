import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  integer,
  decimal,
  jsonb,
  date,
  index,
} from "drizzle-orm/pg-core";

// ============================================================
// USERS & AUTH
// ============================================================

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash"),
  role: text("role", { enum: ["agent", "admin", "it_admin"] }).notNull(),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// ============================================================
// AGENT CREDENTIALS
// ============================================================

export const agentCredentials = pgTable(
  "agent_credentials",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    // Bot label for multi-bot support
    botLabel: text("bot_label").notNull().default("Default Bot"),

    // ElevenLabs (required)
    elevenlabsApiKey: text("elevenlabs_api_key").notNull(),
    elevenlabsAgentId: text("elevenlabs_agent_id").notNull(),
    elevenlabsWebhookSecret: text("elevenlabs_webhook_secret"),

    // Telephony path
    telephonyProvider: text("telephony_provider", {
      enum: ["twilio", "didww"],
    }).notNull(),

    // Twilio path
    elevenlabsPhoneNumberId: text("elevenlabs_phone_number_id"),

    // DIDWW path
    didwwPhoneNumber: text("didww_phone_number"),

    // Caller ID
    outboundCallerId: text("outbound_caller_id"),

    // Tracking
    credentialsComplete: boolean("credentials_complete").default(false),
    updatedBy: uuid("updated_by").references(() => users.id),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_agent_credentials_agent").on(table.agentId),
  ]
);

// ============================================================
// BILLING
// ============================================================

export const agentBilling = pgTable("agent_billing", {
  id: uuid("id").primaryKey().defaultRandom(),
  agentId: uuid("agent_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" })
    .unique(),
  plan: text("plan").notNull().default("basic"),
  isPaid: boolean("is_paid").default(false),
  billingCycleStart: date("billing_cycle_start"),
  billingCycleEnd: date("billing_cycle_end"),
  notes: text("notes"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// ============================================================
// CALL LISTS
// ============================================================

export const callLists = pgTable(
  "call_lists",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    originalFilename: text("original_filename").notNull(),
    fileHash: text("file_hash"),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true }).defaultNow(),

    parseStatus: text("parse_status", { enum: ["parsed", "failed"] })
      .notNull()
      .default("parsed"),
    validationErrors: jsonb("validation_errors"),

    botCredentialId: uuid("bot_credential_id").references(
      () => agentCredentials.id,
      { onDelete: "set null" }
    ),

    callStatus: text("call_status", {
      enum: ["ready", "in_progress", "paused", "completed", "cancelled"],
    })
      .notNull()
      .default("ready"),
    totalNumbers: integer("total_numbers").default(0),
    callsMade: integer("calls_made").default(0),
    callsAnswered: integer("calls_answered").default(0),
    callsNoAnswer: integer("calls_no_answer").default(0),
    callsFailed: integer("calls_failed").default(0),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    index("idx_call_lists_agent").on(table.agentId),
    index("idx_call_lists_status").on(table.callStatus),
  ]
);

// ============================================================
// CALL ENTRIES
// ============================================================

export const callEntries = pgTable(
  "call_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    callListId: uuid("call_list_id")
      .notNull()
      .references(() => callLists.id, { onDelete: "cascade" }),

    phoneNumber: text("phone_number").notNull(),
    contactName: text("contact_name").notNull().default("Contact"),
    company: text("company"),
    policyType: text("policy_type"),
    preferredTime: text("preferred_time"),
    language: text("language"),
    notes: text("notes"),

    callStatus: text("call_status", {
      enum: [
        "pending",
        "calling",
        "called",
        "answered",
        "no_answer",
        "busy",
        "failed",
        "skipped",
      ],
    })
      .notNull()
      .default("pending"),

    conversationId: text("conversation_id"),
    telephonyCallSid: text("telephony_call_sid"),
    callDurationSeconds: integer("call_duration_seconds"),
    callStartedAt: timestamp("call_started_at", { withTimezone: true }),
    callEndedAt: timestamp("call_ended_at", { withTimezone: true }),

    callAttempts: integer("call_attempts").notNull().default(0),
    sortOrder: integer("sort_order").notNull().default(0),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_call_entries_list").on(table.callListId),
    index("idx_call_entries_status").on(table.callListId, table.callStatus),
  ]
);

// ============================================================
// CALLS (with analysis)
// ============================================================

export const calls = pgTable(
  "calls",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    callEntryId: uuid("call_entry_id").references(() => callEntries.id),

    callTime: timestamp("call_time", { withTimezone: true }).defaultNow(),
    callingNumber: text("calling_number"),
    phoneNumber: text("phone_number"),
    conversationId: text("conversation_id"),
    callId: text("call_id"),
    numberStatus: text("number_status", { enum: ["busy", "idle"] }).default(
      "busy"
    ),

    duration: integer("duration"),
    callCost: decimal("call_cost", { precision: 10, scale: 4 }),

    rating: integer("rating"),
    summary: text("summary"),
    email: text("email"),
    name: text("name"),
    bookingStatus: text("booking_status", { enum: ["TRUE", "FALSE"] }),
    bookingLocation: text("booking_location"),
    bookingDate: text("booking_date"),
    bookingTime: text("booking_time"),
    estimatedCost: decimal("estimated_cost", { precision: 10, scale: 2 }),
    callType: text("call_type"),

    transcript: text("transcript"),
    recordingUrl: text("recording_url"),

    elevenlabsAgentId: text("elevenlabs_agent_id"),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_calls_conversation").on(table.conversationId),
    index("idx_calls_entry").on(table.callEntryId),
  ]
);

// ============================================================
// UPLOAD VALIDATIONS
// ============================================================

export const uploadValidations = pgTable("upload_validations", {
  id: uuid("id").primaryKey().defaultRandom(),
  agentId: uuid("agent_id")
    .notNull()
    .references(() => users.id),
  originalFilename: text("original_filename").notNull(),
  fileHash: text("file_hash"),
  totalRows: integer("total_rows"),
  validRows: integer("valid_rows"),
  errorRows: integer("error_rows"),
  errors: jsonb("errors"),
  warnings: jsonb("warnings"),
  validationPassed: boolean("validation_passed").notNull(),
  callListId: uuid("call_list_id").references(() => callLists.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

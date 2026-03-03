import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  real,
  jsonb,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// Aceabalize V2 — Sessions
// Groups related jobs into a named processing run
// ---------------------------------------------------------------------------
export const aceV2Sessions = pgTable('ace_v2_sessions', {
  id: serial('id').primaryKey(),
  sessionId: text('session_id').notNull().unique(),
  ownerUserId: text('owner_user_id').notNull(),
  originalFileName: text('original_file_name'),
  config: jsonb('config'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  pipelineStartedAt: timestamp('pipeline_started_at', { withTimezone: true }),
  pipelineCompletedAt: timestamp('pipeline_completed_at', { withTimezone: true }),
});

// ---------------------------------------------------------------------------
// Aceabalize V2 — Jobs
// Individual async processing task (one per phase per session)
// ---------------------------------------------------------------------------
export const aceV2Jobs = pgTable('ace_v2_jobs', {
  id: serial('id').primaryKey(),
  jobId: text('job_id').notNull().unique(),
  sessionId: text('session_id')
    .notNull()
    .references(() => aceV2Sessions.sessionId, { onDelete: 'cascade' }),
  ownerUserId: text('owner_user_id').notNull(),
  phase: text('phase').notNull(), // process | enhance | polish | book_ends
  status: text('status').notNull().default('pending'), // pending | running | done | error | canceled
  progress: real('progress').default(0),
  currentChunk: integer('current_chunk'),
  totalChunks: integer('total_chunks'),
  messages: jsonb('messages').$type<string[]>().default([]),
  errors: jsonb('errors').$type<string[]>().default([]),
  config: jsonb('config'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
});

// ---------------------------------------------------------------------------
// Aceabalize V2 — Artifacts
// Text output produced by each job (processed_md, enhanced_md, etc.)
// ---------------------------------------------------------------------------
export const aceV2Artifacts = pgTable('ace_v2_artifacts', {
  id: serial('id').primaryKey(),
  sessionId: text('session_id')
    .notNull()
    .references(() => aceV2Sessions.sessionId, { onDelete: 'cascade' }),
  jobId: text('job_id')
    .notNull()
    .references(() => aceV2Jobs.jobId, { onDelete: 'cascade' }),
  artifactKey: text('artifact_key').notNull(), // processed_md | enhanced_md | polished_md | final_md
  contentText: text('content_text'),
  mimeType: text('mime_type').default('text/markdown'),
  sizeBytes: integer('size_bytes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// Aceabalize V2 — Prompt Outputs (Audit Trail)
// Full record of every LLM call: input prompt, output, model, tokens, latency
// ---------------------------------------------------------------------------
export const aceV2PromptOutputs = pgTable('ace_v2_prompt_outputs', {
  id: serial('id').primaryKey(),
  sessionId: text('session_id')
    .notNull()
    .references(() => aceV2Sessions.sessionId, { onDelete: 'cascade' }),
  jobId: text('job_id')
    .notNull()
    .references(() => aceV2Jobs.jobId, { onDelete: 'cascade' }),
  phase: text('phase').notNull(),
  stepName: text('step_name'),
  promptInput: text('prompt_input'),
  promptOutput: text('prompt_output'),
  modelUsed: text('model_used'),
  tokensInput: integer('tokens_input'),
  tokensOutput: integer('tokens_output'),
  latencyMs: integer('latency_ms'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// Aceabalize V2 — Chunks
// Chunk state for the Process phase (tracks which chunks have been applied)
// ---------------------------------------------------------------------------
export const aceV2Chunks = pgTable('ace_v2_chunks', {
  id: serial('id').primaryKey(),
  sessionId: text('session_id')
    .notNull()
    .references(() => aceV2Sessions.sessionId, { onDelete: 'cascade' }),
  chunkIndex: integer('chunk_index').notNull(),
  content: text('content'),
  tokens: integer('tokens'),
  sha256: text('sha256'),
  applied: boolean('applied').default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// Aceabalize V2 — Prompts
// Versioned prompt templates, editable via the UI
// ---------------------------------------------------------------------------
export const aceV2Prompts = pgTable('ace_v2_prompts', {
  id: serial('id').primaryKey(),
  slug: text('slug').notNull().unique(), // e.g. "notes_to_content", "enhance", "polish"
  name: text('name').notNull(),
  description: text('description'),
  content: text('content').notNull(),
  activeVersion: integer('active_version').default(1),
  updatedBy: text('updated_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// Aceabalize V2 — Prompt Versions
// Full history of every prompt edit
// ---------------------------------------------------------------------------
export const aceV2PromptVersions = pgTable('ace_v2_prompt_versions', {
  id: serial('id').primaryKey(),
  promptId: integer('prompt_id')
    .notNull()
    .references(() => aceV2Prompts.id, { onDelete: 'cascade' }),
  version: integer('version').notNull(),
  content: text('content').notNull(),
  changeNote: text('change_note'),
  createdBy: text('created_by'),
  isArchived: boolean('is_archived').default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// Phase 4 Human Review — Recommendations
// AI-generated content recommendations awaiting human approve/reject
// ---------------------------------------------------------------------------
export const reviewRecommendations = pgTable('review_recommendations', {
  id: serial('id').primaryKey(),
  recId: text('rec_id').notNull().unique(),
  sessionId: text('session_id')
    .notNull()
    .references(() => aceV2Sessions.sessionId, { onDelete: 'cascade' }),
  category: text('category'),
  issue: text('issue'),
  recommendedLanguage: text('recommended_language'),
  insertionPoint: text('insertion_point'),
  sourceUrls: jsonb('source_urls').$type<
    Array<{ ref: string; url: string; description: string; is_placeholder: boolean }>
  >().default([]),
  status: text('status').notNull().default('pending'), // pending | approved | rejected
  humanNotes: text('human_notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------
export const aceV2SessionsRelations = relations(aceV2Sessions, ({ many }) => ({
  jobs: many(aceV2Jobs),
  artifacts: many(aceV2Artifacts),
  promptOutputs: many(aceV2PromptOutputs),
  chunks: many(aceV2Chunks),
  recommendations: many(reviewRecommendations),
}));

export const aceV2JobsRelations = relations(aceV2Jobs, ({ one, many }) => ({
  session: one(aceV2Sessions, {
    fields: [aceV2Jobs.sessionId],
    references: [aceV2Sessions.sessionId],
  }),
  artifacts: many(aceV2Artifacts),
  promptOutputs: many(aceV2PromptOutputs),
}));

export const aceV2ArtifactsRelations = relations(aceV2Artifacts, ({ one }) => ({
  session: one(aceV2Sessions, {
    fields: [aceV2Artifacts.sessionId],
    references: [aceV2Sessions.sessionId],
  }),
  job: one(aceV2Jobs, {
    fields: [aceV2Artifacts.jobId],
    references: [aceV2Jobs.jobId],
  }),
}));

export const aceV2PromptOutputsRelations = relations(aceV2PromptOutputs, ({ one }) => ({
  session: one(aceV2Sessions, {
    fields: [aceV2PromptOutputs.sessionId],
    references: [aceV2Sessions.sessionId],
  }),
  job: one(aceV2Jobs, {
    fields: [aceV2PromptOutputs.jobId],
    references: [aceV2Jobs.jobId],
  }),
}));

export const aceV2ChunksRelations = relations(aceV2Chunks, ({ one }) => ({
  session: one(aceV2Sessions, {
    fields: [aceV2Chunks.sessionId],
    references: [aceV2Sessions.sessionId],
  }),
}));

export const aceV2PromptsRelations = relations(aceV2Prompts, ({ many }) => ({
  versions: many(aceV2PromptVersions),
}));

export const aceV2PromptVersionsRelations = relations(aceV2PromptVersions, ({ one }) => ({
  prompt: one(aceV2Prompts, {
    fields: [aceV2PromptVersions.promptId],
    references: [aceV2Prompts.id],
  }),
}));

export const reviewRecommendationsRelations = relations(reviewRecommendations, ({ one }) => ({
  session: one(aceV2Sessions, {
    fields: [reviewRecommendations.sessionId],
    references: [aceV2Sessions.sessionId],
  }),
}));

import { db } from '@/lib/db';
import { aceV2Jobs, aceV2Sessions } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

export type JobPhase = 'process' | 'enhance' | 'polish' | 'book_ends';
export type JobStatus = 'pending' | 'running' | 'done' | 'error' | 'canceled';

export interface JobUpdate {
  status?: JobStatus;
  progress?: number;
  currentChunk?: number;
  totalChunks?: number;
  message?: string;
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
}

/**
 * Create a new session for a user, returning the sessionId.
 */
export async function createSession(
  ownerUserId: string,
  originalFileName: string,
  config?: Record<string, unknown>
): Promise<string> {
  const sessionId = uuidv4();
  await db.insert(aceV2Sessions).values({
    sessionId,
    ownerUserId,
    originalFileName,
    config,
    pipelineStartedAt: new Date(),
  });
  return sessionId;
}

/**
 * Create a job record with status "pending" and return the jobId.
 * The caller is responsible for running the background task.
 */
export async function createJob(
  sessionId: string,
  ownerUserId: string,
  phase: JobPhase,
  config?: Record<string, unknown>
): Promise<string> {
  const jobId = uuidv4();
  await db.insert(aceV2Jobs).values({
    jobId,
    sessionId,
    ownerUserId,
    phase,
    status: 'pending',
    progress: 0,
    messages: [],
    errors: [],
    config,
  });
  return jobId;
}

/**
 * Update job status, progress, and optionally append a log message or error.
 */
export async function updateJob(jobId: string, update: JobUpdate): Promise<void> {
  // Fetch current messages/errors to append (jsonb arrays)
  if (update.message || update.error) {
    const rows = await db
      .select({ messages: aceV2Jobs.messages, errors: aceV2Jobs.errors })
      .from(aceV2Jobs)
      .where(eq(aceV2Jobs.jobId, jobId))
      .limit(1);

    const row = rows[0];
    if (row) {
      const currentMessages: string[] = (row.messages) ?? [];
      const currentErrors: string[] = (row.errors) ?? [];

      const newMessages = update.message
        ? [...currentMessages.slice(-49), update.message] // keep last 50
        : currentMessages;
      const newErrors = update.error
        ? [...currentErrors.slice(-49), update.error]
        : currentErrors;

      await db
        .update(aceV2Jobs)
        .set({
          ...(update.status !== undefined && { status: update.status }),
          ...(update.progress !== undefined && { progress: update.progress }),
          ...(update.currentChunk !== undefined && { currentChunk: update.currentChunk }),
          ...(update.totalChunks !== undefined && { totalChunks: update.totalChunks }),
          ...(update.startedAt !== undefined && { startedAt: update.startedAt }),
          ...(update.completedAt !== undefined && { completedAt: update.completedAt }),
          messages: newMessages,
          errors: newErrors,
        })
        .where(eq(aceV2Jobs.jobId, jobId));
      return;
    }
  }

  // No message/error append — plain update
  await db
    .update(aceV2Jobs)
    .set({
      ...(update.status !== undefined && { status: update.status }),
      ...(update.progress !== undefined && { progress: update.progress }),
      ...(update.currentChunk !== undefined && { currentChunk: update.currentChunk }),
      ...(update.totalChunks !== undefined && { totalChunks: update.totalChunks }),
      ...(update.startedAt !== undefined && { startedAt: update.startedAt }),
      ...(update.completedAt !== undefined && { completedAt: update.completedAt }),
    })
    .where(eq(aceV2Jobs.jobId, jobId));
}

/**
 * Get job by ID.
 */
export async function getJob(jobId: string) {
  const rows = await db
    .select()
    .from(aceV2Jobs)
    .where(eq(aceV2Jobs.jobId, jobId))
    .limit(1);
  return rows[0] ?? null;
}

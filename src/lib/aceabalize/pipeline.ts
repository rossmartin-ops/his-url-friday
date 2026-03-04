/**
 * Full sequential pipeline runner.
 * Runs all 4 phases in order: Process → Enhance → Polish → Book Ends.
 * Each phase reads from the previous phase's artifact in the DB.
 */

import { db } from '@/lib/db';
import { aceV2Artifacts, aceV2Sessions } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { runProcessPhase } from './phases/process';
import { runEnhancePhase } from './phases/enhance';
import { runPolishPhase } from './phases/polish';
import { runBookEndsPhase } from './phases/book-ends';
import { updateJob } from './job-runner';

export interface PipelineJobIds {
  process: string;
  enhance: string;
  polish: string;
  bookEnds: string;
}

async function getArtifactContent(sessionId: string, artifactKey: string): Promise<string | null> {
  const rows = await db
    .select({ contentText: aceV2Artifacts.contentText })
    .from(aceV2Artifacts)
    .where(
      and(
        eq(aceV2Artifacts.sessionId, sessionId),
        eq(aceV2Artifacts.artifactKey, artifactKey)
      )
    )
    .limit(1);
  return rows[0]?.contentText ?? null;
}

export async function runFullPipeline(
  sessionId: string,
  jobIds: PipelineJobIds,
  initialContent: string
): Promise<void> {
  // Mark session as started
  await db
    .update(aceV2Sessions)
    .set({ pipelineStartedAt: new Date() })
    .where(eq(aceV2Sessions.sessionId, sessionId));

  try {
    // Phase 1: Process
    await runProcessPhase(jobIds.process, sessionId, initialContent);

    const processedContent = await getArtifactContent(sessionId, 'processed_md');
    if (!processedContent) throw new Error('Process phase produced no output');

    // Phase 2: Enhance
    await runEnhancePhase(jobIds.enhance, sessionId, processedContent);

    const enhancedContent = await getArtifactContent(sessionId, 'enhanced_md');
    if (!enhancedContent) throw new Error('Enhance phase produced no output');

    // Phase 3: Polish
    await runPolishPhase(jobIds.polish, sessionId, enhancedContent);

    const polishedContent = await getArtifactContent(sessionId, 'polished_md');
    if (!polishedContent) throw new Error('Polish phase produced no output');

    // Phase 4: Book Ends
    await runBookEndsPhase(jobIds.bookEnds, sessionId, polishedContent);

    // Mark session as complete
    await db
      .update(aceV2Sessions)
      .set({ pipelineCompletedAt: new Date() })
      .where(eq(aceV2Sessions.sessionId, sessionId));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[pipeline] Full pipeline failed:', message);

    // Mark any still-pending jobs as canceled so UI doesn't hang
    for (const jobId of Object.values(jobIds) as string[]) {
      await updateJob(jobId, {
        status: 'canceled',
        completedAt: new Date(),
        error: `Pipeline aborted: ${message}`,
      }).catch(() => {/* ignore */});
    }
  }
}

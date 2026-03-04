/**
 * Process Phase
 * Chunks the raw SME notes and transforms each chunk through the
 * notes_to_content prompt to produce aceabalized educational content.
 *
 * Chunks are processed concurrently in batches (matching the old Python
 * ThreadPoolExecutor behaviour: min(10, max(4, ceil(total/5))) workers).
 */

import { db } from '@/lib/db';
import { aceV2Artifacts, aceV2Chunks, aceV2PromptOutputs } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { generateWithAnthropic } from '../anthropic-client';
import { chunkMarkdown, type ContentChunk } from '../content-chunker';
import { loadPrompt, interpolatePrompt } from '../prompt-loader';
import { updateJob } from '../job-runner';
import crypto from 'crypto';

const PROCESS_PROMPT_SLUG = 'notes_to_content';

/** Match old Python concurrency: min(10, max(4, ceil(total/5))) */
function calcConcurrency(total: number): number {
  return Math.min(10, Math.max(4, Math.ceil(total / 5)));
}

/** Process a single chunk and return its output text. */
async function processChunk(
  chunk: ContentChunk,
  total: number,
  promptTemplate: string,
  jobId: string,
  sessionId: string
): Promise<string> {
  const chunkNum = chunk.index + 1;

  const prompt = interpolatePrompt(promptTemplate, {
    SME_NOTES: chunk.content,
    CHUNK_CONTEXT: chunk.headingContext,
    CHUNK_INDEX: String(chunkNum),
    TOTAL_CHUNKS: String(total),
  });

  const result = await generateWithAnthropic(prompt, {
    temperature: 0.7,
    maxTokens: 8000,
    stepName: `process_chunk_${chunkNum}`,
  });

  // Record audit trail
  await db.insert(aceV2PromptOutputs).values({
    sessionId,
    jobId,
    phase: 'process',
    stepName: `chunk_${chunkNum}`,
    promptInput: prompt,
    promptOutput: result.text,
    modelUsed: result.modelUsed,
    tokensInput: result.tokensInput,
    tokensOutput: result.tokensOutput,
    latencyMs: result.latencyMs,
  });

  // Mark chunk as applied
  await db
    .update(aceV2Chunks)
    .set({ applied: true })
    .where(and(eq(aceV2Chunks.sessionId, sessionId), eq(aceV2Chunks.chunkIndex, chunk.index)));

  return result.text;
}

export async function runProcessPhase(
  jobId: string,
  sessionId: string,
  inputContent: string
): Promise<void> {
  await updateJob(jobId, { status: 'running', startedAt: new Date(), message: 'Starting process phase…' });

  try {
    const promptTemplate = await loadPrompt(PROCESS_PROMPT_SLUG);
    if (!promptTemplate) {
      throw new Error(`Prompt not found: ${PROCESS_PROMPT_SLUG}. Run npm run db:seed-prompts first.`);
    }

    const chunks = chunkMarkdown(inputContent);
    const total = chunks.length;
    const concurrency = calcConcurrency(total);

    await updateJob(jobId, {
      totalChunks: total,
      message: `Split into ${total} chunk(s), processing ${concurrency} at a time`,
    });

    // Store chunk records
    await db.insert(aceV2Chunks).values(
      chunks.map((c) => ({
        sessionId,
        chunkIndex: c.index,
        content: c.content,
        tokens: c.tokens,
        sha256: crypto.createHash('sha256').update(c.content).digest('hex'),
        applied: false,
      }))
    );

    // Process in concurrent batches, preserving chunk order in the output
    const processedParts: string[] = Array.from<string>({ length: total });
    let completedCount = 0;

    for (let batchStart = 0; batchStart < total; batchStart += concurrency) {
      const batch = chunks.slice(batchStart, batchStart + concurrency);

      await updateJob(jobId, {
        currentChunk: batchStart + 1,
        progress: Math.round((batchStart / total) * 90),
        message: `Processing chunks ${batchStart + 1}–${Math.min(batchStart + concurrency, total)} of ${total}…`,
      });

      // Run this batch in parallel
      const batchResults = await Promise.all(
        batch.map((chunk) => processChunk(chunk, total, promptTemplate, jobId, sessionId))
      );

      // Place results at their correct index positions
      batchResults.forEach((text, i) => {
        processedParts[batchStart + i] = text;
      });

      completedCount += batch.length;
      await updateJob(jobId, {
        currentChunk: completedCount,
        progress: Math.round((completedCount / total) * 90),
        message: `${completedCount}/${total} chunks complete`,
      });
    }

    // Merge all chunks in order
    const mergedContent = processedParts.join('\n\n');
    const sizeBytes = Buffer.byteLength(mergedContent, 'utf8');

    await db.insert(aceV2Artifacts).values({
      sessionId,
      jobId,
      artifactKey: 'processed_md',
      contentText: mergedContent,
      mimeType: 'text/markdown',
      sizeBytes,
    });

    await updateJob(jobId, {
      status: 'done',
      progress: 100,
      completedAt: new Date(),
      message: `Process phase complete — ${total} chunk(s) merged`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await updateJob(jobId, {
      status: 'error',
      completedAt: new Date(),
      error: message,
      message: `Process phase failed: ${message}`,
    });
    throw err;
  }
}

/**
 * Process Phase
 * Chunks the raw SME notes and transforms each chunk through the
 * notes_to_content prompt to produce aceabalized educational content.
 */

import { db } from '@/lib/db';
import { aceV2Artifacts, aceV2Chunks, aceV2PromptOutputs } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { generateWithAnthropic } from '../anthropic-client';
import { chunkMarkdown } from '../content-chunker';
import { loadPrompt, interpolatePrompt } from '../prompt-loader';
import { updateJob } from '../job-runner';
import crypto from 'crypto';

const PROCESS_PROMPT_SLUG = 'notes_to_content';

export async function runProcessPhase(
  jobId: string,
  sessionId: string,
  inputContent: string
): Promise<void> {
  await updateJob(jobId, { status: 'running', startedAt: new Date(), message: 'Starting process phase…' });

  try {
    // Load the prompt template from DB
    const promptTemplate = await loadPrompt(PROCESS_PROMPT_SLUG);
    if (!promptTemplate) {
      throw new Error(`Prompt not found: ${PROCESS_PROMPT_SLUG}. Seed prompts before running.`);
    }

    // Chunk the input
    const chunks = chunkMarkdown(inputContent);
    await updateJob(jobId, {
      totalChunks: chunks.length,
      message: `Split content into ${chunks.length} chunk(s)`,
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

    // Process each chunk
    const processedParts: string[] = [];
    for (const chunk of chunks) {
      const chunkNum = chunk.index + 1;
      await updateJob(jobId, {
        currentChunk: chunkNum,
        progress: Math.round((chunk.index / chunks.length) * 90),
        message: `Processing chunk ${chunkNum}/${chunks.length}: "${chunk.headingContext}"`,
      });

      const prompt = interpolatePrompt(promptTemplate, {
        SME_NOTES: chunk.content,
        CHUNK_CONTEXT: chunk.headingContext,
        CHUNK_INDEX: String(chunkNum),
        TOTAL_CHUNKS: String(chunks.length),
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
        .where(
          and(
            eq(aceV2Chunks.sessionId, sessionId),
            eq(aceV2Chunks.chunkIndex, chunk.index)
          )
        );

      processedParts.push(result.text);
    }

    // Merge chunks with section dividers
    const mergedContent = processedParts.join('\n\n');
    const sizeBytes = Buffer.byteLength(mergedContent, 'utf8');

    // Store artifact
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
      message: `Process phase complete — ${processedParts.length} chunk(s) merged`,
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

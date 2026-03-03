/**
 * Book Ends Phase
 * Extracts or generates an intro and summary, applies title-casing to headers,
 * and produces the final polished artifact.
 */

import { db } from '@/lib/db';
import { aceV2Artifacts, aceV2PromptOutputs } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { generateWithAnthropic } from '../anthropic-client';
import { loadPrompt, interpolatePrompt } from '../prompt-loader';
import { updateJob } from '../job-runner';

const BOOK_ENDS_PROMPT_SLUG = 'book_ends';

/**
 * Convert a markdown header line to title case.
 * e.g. "## the quick brown fox" → "## The Quick Brown Fox"
 */
function titleCaseHeaders(content: string): string {
  return content.replace(/^(#{1,6})\s+(.+)$/gm, (_, hashes, title: string) => {
    const titled = title
      .split(' ')
      .map((word, i) => {
        const lower = word.toLowerCase();
        // Always capitalize first word and words not in stop list
        const stopWords = new Set([
          'a', 'an', 'the', 'and', 'but', 'or', 'for', 'nor', 'on', 'at',
          'to', 'by', 'in', 'of', 'up', 'as', 'is',
        ]);
        if (i === 0 || !stopWords.has(lower)) {
          return word.charAt(0).toUpperCase() + word.slice(1);
        }
        return lower;
      })
      .join(' ');
    return `${hashes} ${titled}`;
  });
}

export async function runBookEndsPhase(
  jobId: string,
  sessionId: string,
  inputContent?: string
): Promise<void> {
  await updateJob(jobId, { status: 'running', startedAt: new Date(), message: 'Starting book ends phase…' });

  try {
    let content = inputContent;
    if (!content) {
      for (const key of ['polished_md', 'enhanced_md', 'processed_md']) {
        const rows = await db
          .select({ contentText: aceV2Artifacts.contentText })
          .from(aceV2Artifacts)
          .where(
            and(
              eq(aceV2Artifacts.sessionId, sessionId),
              eq(aceV2Artifacts.artifactKey, key)
            )
          )
          .limit(1);
        if (rows[0]?.contentText) {
          content = rows[0].contentText;
          break;
        }
      }
    }

    if (!content) {
      throw new Error('No content found. Run an earlier phase first.');
    }

    const promptTemplate = await loadPrompt(BOOK_ENDS_PROMPT_SLUG);
    if (!promptTemplate) {
      throw new Error(`Prompt not found: ${BOOK_ENDS_PROMPT_SLUG}`);
    }

    await updateJob(jobId, { progress: 10, message: 'Generating intro and summary…' });

    const prompt = interpolatePrompt(promptTemplate, { CONTENT: content });

    const result = await generateWithAnthropic(prompt, {
      temperature: 0.7,
      maxTokens: 16000,
      stepName: 'book_ends',
    });

    await db.insert(aceV2PromptOutputs).values({
      sessionId,
      jobId,
      phase: 'book_ends',
      stepName: 'book_ends',
      promptInput: prompt,
      promptOutput: result.text,
      modelUsed: result.modelUsed,
      tokensInput: result.tokensInput,
      tokensOutput: result.tokensOutput,
      latencyMs: result.latencyMs,
    });

    // Apply title-casing to all headers in the final output
    const finalContent = titleCaseHeaders(result.text);
    const sizeBytes = Buffer.byteLength(finalContent, 'utf8');

    await db.insert(aceV2Artifacts).values({
      sessionId,
      jobId,
      artifactKey: 'final_md',
      contentText: finalContent,
      mimeType: 'text/markdown',
      sizeBytes,
    });

    await updateJob(jobId, {
      status: 'done',
      progress: 100,
      completedAt: new Date(),
      message: 'Book ends phase complete — final content ready',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await updateJob(jobId, {
      status: 'error',
      completedAt: new Date(),
      error: message,
      message: `Book ends phase failed: ${message}`,
    });
    throw err;
  }
}

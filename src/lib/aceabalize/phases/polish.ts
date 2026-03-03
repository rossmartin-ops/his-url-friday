/**
 * Polish Phase
 * Final grammar, clarity, and formatting pass. Also generates a
 * "Casual Phrase Report" flagging overly informal language.
 */

import { db } from '@/lib/db';
import { aceV2Artifacts, aceV2PromptOutputs } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { generateWithAnthropic } from '../anthropic-client';
import { loadPrompt, interpolatePrompt } from '../prompt-loader';
import { updateJob } from '../job-runner';

const POLISH_PROMPT_SLUG = 'polish';

export async function runPolishPhase(
  jobId: string,
  sessionId: string,
  inputContent?: string
): Promise<void> {
  await updateJob(jobId, { status: 'running', startedAt: new Date(), message: 'Starting polish phase…' });

  try {
    let content = inputContent;
    if (!content) {
      // Fall back through artifact chain: enhanced_md → processed_md
      for (const key of ['enhanced_md', 'processed_md']) {
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
      throw new Error('No content found. Run the Process or Enhance phase first.');
    }

    const promptTemplate = await loadPrompt(POLISH_PROMPT_SLUG);
    if (!promptTemplate) {
      throw new Error(`Prompt not found: ${POLISH_PROMPT_SLUG}`);
    }

    await updateJob(jobId, { progress: 10, message: 'Sending to Claude for polish…' });

    const prompt = interpolatePrompt(promptTemplate, { CONTENT: content });

    const result = await generateWithAnthropic(prompt, {
      temperature: 0.5,
      maxTokens: 32000,
      stepName: 'polish',
    });

    await db.insert(aceV2PromptOutputs).values({
      sessionId,
      jobId,
      phase: 'polish',
      stepName: 'polish',
      promptInput: prompt,
      promptOutput: result.text,
      modelUsed: result.modelUsed,
      tokensInput: result.tokensInput,
      tokensOutput: result.tokensOutput,
      latencyMs: result.latencyMs,
    });

    const sizeBytes = Buffer.byteLength(result.text, 'utf8');
    await db.insert(aceV2Artifacts).values({
      sessionId,
      jobId,
      artifactKey: 'polished_md',
      contentText: result.text,
      mimeType: 'text/markdown',
      sizeBytes,
    });

    await updateJob(jobId, {
      status: 'done',
      progress: 100,
      completedAt: new Date(),
      message: 'Polish phase complete',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await updateJob(jobId, {
      status: 'error',
      completedAt: new Date(),
      error: message,
      message: `Polish phase failed: ${message}`,
    });
    throw err;
  }
}

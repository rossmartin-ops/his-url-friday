import { anthropic } from '@ai-sdk/anthropic';
import { generateText } from 'ai';

const DEFAULT_MODEL = 'claude-opus-4-1-20250805';
const FALLBACK_MODELS = [
  'claude-opus-4-1-20250805',
  'claude-3-5-sonnet-20241022',
  'claude-3-opus-20240229',
];

export function getAnthropicModel() {
  return process.env['ANTHROPIC_MODEL'] ?? DEFAULT_MODEL;
}

export function getAnthropicFallbacks(primary: string): string[] {
  return FALLBACK_MODELS.filter((m) => m !== primary);
}

export interface GenerateOptions {
  system?: string;
  temperature?: number;
  maxTokens?: number;
  stepName?: string;
}

/**
 * Call Anthropic with automatic fallback on error.
 * Returns { text, modelUsed, tokensInput, tokensOutput, latencyMs }
 */
export async function generateWithAnthropic(
  prompt: string,
  options: GenerateOptions = {}
): Promise<{
  text: string;
  modelUsed: string;
  tokensInput: number;
  tokensOutput: number;
  latencyMs: number;
}> {
  const { system, temperature = 0.7, maxTokens = 32000 } = options;
  const primaryModel = getAnthropicModel();
  const modelsToTry = [primaryModel, ...getAnthropicFallbacks(primaryModel)];

  let lastError: Error = new Error('All Anthropic models failed');

  for (const modelId of modelsToTry) {
    const startMs = Date.now();
    try {
      const result = await generateText({
        model: anthropic(modelId),
        temperature,
        maxOutputTokens: maxTokens,
        messages: [
          ...(system ? [{ role: 'system' as const, content: system }] : []),
          { role: 'user' as const, content: prompt },
        ],
      });

      return {
        text: result.text,
        modelUsed: modelId,
        tokensInput: result.usage.inputTokens ?? 0,
        tokensOutput: result.usage.outputTokens ?? 0,
        latencyMs: Date.now() - startMs,
      };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.warn(`[anthropic-client] Model ${modelId} failed, trying next fallback`, err);
    }
  }

  throw lastError;
}

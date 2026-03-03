import { db } from '@/lib/db';
import { aceV2Prompts } from '@/db/schema';
import { eq } from 'drizzle-orm';

// In-memory cache: slug → { content, expiresAt }
const cache = new Map<string, { content: string; expiresAt: number }>();
const CACHE_TTL_MS = 60_000; // 1 minute

/**
 * Load a prompt by slug.
 * Checks DB first (with short TTL cache), returns null if not found.
 */
export async function loadPrompt(slug: string): Promise<string | null> {
  const now = Date.now();
  const cached = cache.get(slug);
  if (cached && cached.expiresAt > now) {
    return cached.content;
  }

  const rows = await db
    .select({ content: aceV2Prompts.content })
    .from(aceV2Prompts)
    .where(eq(aceV2Prompts.slug, slug))
    .limit(1);

  if (rows.length === 0 || !rows[0]) return null;

  const content = rows[0].content;
  cache.set(slug, { content, expiresAt: now + CACHE_TTL_MS });
  return content;
}

/** Bust the cache for a specific slug (call after prompt update). */
export function bustPromptCache(slug: string) {
  cache.delete(slug);
}

/**
 * Interpolate template variables in a prompt string.
 * Variables are wrapped in {{DOUBLE_BRACES}}.
 */
export function interpolatePrompt(
  template: string,
  vars: Record<string, string>
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    return vars[key] ?? `{{${key}}}`;
  });
}

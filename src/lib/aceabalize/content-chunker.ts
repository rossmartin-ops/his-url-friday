/**
 * Splits markdown content into chunks suitable for LLM processing.
 * Preserves heading context and avoids splitting mid-section.
 */

const DEFAULT_MAX_TOKENS = 6000;
// Rough estimate: 1 token ≈ 4 characters for English prose
const CHARS_PER_TOKEN = 4;

export interface ContentChunk {
  index: number;
  content: string;
  tokens: number;
  headingContext: string; // The H1/H2 heading this chunk falls under
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Split markdown into chunks, trying to break at heading boundaries.
 * If a single section exceeds maxTokens it is split at paragraph boundaries.
 */
export function chunkMarkdown(
  content: string,
  maxTokens: number = DEFAULT_MAX_TOKENS
): ContentChunk[] {
  const maxChars = maxTokens * CHARS_PER_TOKEN;
  const lines = content.split('\n');
  const chunks: ContentChunk[] = [];

  let currentChunk: string[] = [];
  let currentChars = 0;
  let headingContext = '';
  let chunkIndex = 0;

  function flush() {
    const text = currentChunk.join('\n').trim();
    if (text.length === 0) return;
    chunks.push({
      index: chunkIndex++,
      content: text,
      tokens: estimateTokens(text),
      headingContext,
    });
    currentChunk = [];
    currentChars = 0;
  }

  for (const line of lines) {
    const isH1 = /^#\s/.test(line);
    const isH2 = /^##\s/.test(line);
    const lineChars = line.length + 1; // +1 for newline

    // Flush at H1/H2 boundaries if current chunk is non-trivial
    if ((isH1 || isH2) && currentChars > maxChars * 0.1) {
      flush();
    }

    // Track heading context for metadata
    if (isH1 || isH2) {
      headingContext = line.replace(/^#+\s/, '').trim();
    }

    // If adding this line would exceed limit, flush first
    if (currentChars + lineChars > maxChars && currentChunk.length > 0) {
      flush();
    }

    currentChunk.push(line);
    currentChars += lineChars;
  }

  flush();
  return chunks;
}

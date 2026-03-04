/**
 * AI Review Phase
 * Replicates jarvis-python Phase 3: sends final aceabalized content to Claude
 * for accuracy and improvement review, then parses the structured output into
 * recommendation records for Human Review.
 *
 * Output format (from perplexity_review_prompt.txt):
 *   ### Issue 1
 *   **STATEMENT**: "quote from content"
 *   **ISSUE**: what's wrong
 *   **CORRECTION**: corrected information
 *   **LOCATION**: section reference
 *   **SOURCES**: citation URLs
 */

import { db } from '@/lib/db';
import { aceV2Artifacts, reviewRecommendations } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { generateWithAnthropic } from '../anthropic-client';
import { loadPrompt, interpolatePrompt } from '../prompt-loader';
import { v4 as uuidv4 } from 'uuid';

const AI_REVIEW_SLUG = 'ai_review';

// ---------------------------------------------------------------------------
// Parser: extract structured recommendations from Claude's markdown response
// ---------------------------------------------------------------------------

interface ParsedRecommendation {
  category: string;
  issue: string;
  recommendedLanguage: string;
  insertionPoint: string;
  sourceUrls: Array<{ ref: string; url: string; description: string; is_placeholder: boolean }>;
}

/**
 * Parse a single source line into a structured source URL object.
 * Handles both real URLs and [SOURCE NEEDED: description] placeholders.
 */
function parseSource(raw: string): { ref: string; url: string; description: string; is_placeholder: boolean } {
  const urlMatch = /https?:\/\/\S+/.exec(raw);
  const isPlaceholder = raw.includes('[SOURCE NEEDED') || !urlMatch;

  if (isPlaceholder) {
    return {
      ref: '',
      url: '',
      description: raw.replace(/^\s*[-•]\s*/, '').trim(),
      is_placeholder: true,
    };
  }

  const url = urlMatch[0].replace(/[,.)]+$/, '');
  const description = raw.replace(url, '').replace(/^\s*[-•]\s*/, '').trim();

  return { ref: '', url, description, is_placeholder: false };
}

/**
 * Parse the AI review response into structured recommendation objects.
 * Handles the perplexity_review_prompt.txt format:
 *   ### Issue N / #### Issue N
 *   **STATEMENT**: ...
 *   **ISSUE**: ...
 *   **CORRECTION**: ...
 *   **LOCATION**: ...
 *   **SOURCES**: ...
 */
export function parseAIReviewResponse(response: string): ParsedRecommendation[] {
  const recommendations: ParsedRecommendation[] = [];

  // Split on issue headers: ### Issue N or #### Issue N
  const issueSections = response.split(/^#{2,4}\s+Issue\s+\d+/im).filter((s) => s.trim().length > 0);

  for (const section of issueSections) {
    const extract = (fieldName: string): string => {
      // Match **FIELD**: content (possibly multi-line until next **)
      const regex = new RegExp(
        `\\*\\*${fieldName}\\*\\*:?\\s*([\\s\\S]*?)(?=\\*\\*[A-Z]+\\*\\*:|$)`,
        'i'
      );
      const match = regex.exec(section);
      return match?.[1]?.trim().replace(/^["']|["']$/g, '') ?? '';
    };

    const statement = extract('STATEMENT');
    const issue = extract('ISSUE');
    const correction = extract('CORRECTION');
    const location = extract('LOCATION');
    const sourcesRaw = extract('SOURCES');

    // Skip empty/incomplete sections
    if (!issue && !correction) continue;

    // Parse sources — each line is a separate source
    const sourceLines = sourcesRaw
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !(/^sources?:?$/i.exec(l)));

    const sourceUrls = sourceLines.map(parseSource);

    // Combine statement + issue as the full "issue" description
    const fullIssue = statement ? `Statement: "${statement}"\n\n${issue}` : issue;

    recommendations.push({
      category: 'Accuracy',
      issue: fullIssue,
      recommendedLanguage: correction,
      insertionPoint: location,
      sourceUrls,
    });
  }

  return recommendations;
}

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

export async function runAIReview(sessionId: string): Promise<{
  recommendations: ParsedRecommendation[];
  rawResponse: string;
}> {
  // Get the final_md artifact for this session
  const artifacts = await db
    .select({ contentText: aceV2Artifacts.contentText })
    .from(aceV2Artifacts)
    .where(
      and(
        eq(aceV2Artifacts.sessionId, sessionId),
        eq(aceV2Artifacts.artifactKey, 'final_md')
      )
    )
    .limit(1);

  if (!artifacts[0]?.contentText) {
    throw new Error('No final_md artifact found. Run the full pipeline first.');
  }

  const content = artifacts[0].contentText;

  // Load the AI review prompt
  const promptTemplate = await loadPrompt(AI_REVIEW_SLUG);
  if (!promptTemplate) {
    throw new Error(`Prompt not found: ${AI_REVIEW_SLUG}. Run npm run db:seed-prompts.`);
  }

  // Build the full prompt with the content appended
  const prompt = interpolatePrompt(promptTemplate, {}) +
    `\n\n## CONTENT TO REVIEW:\n\n${content}`;

  // Call Claude
  const result = await generateWithAnthropic(prompt, {
    temperature: 0.1,
    maxTokens: 8000,
  });

  // Parse the response into recommendations
  const recommendations = parseAIReviewResponse(result.text);

  // Seed recommendations into the database, replacing any existing ones
  // Delete existing recommendations for this session first
  await db
    .delete(reviewRecommendations)
    .where(eq(reviewRecommendations.sessionId, sessionId));

  if (recommendations.length > 0) {
    await db.insert(reviewRecommendations).values(
      recommendations.map((r) => ({
        recId: uuidv4(),
        sessionId,
        category: r.category,
        issue: r.issue,
        recommendedLanguage: r.recommendedLanguage,
        insertionPoint: r.insertionPoint,
        sourceUrls: r.sourceUrls,
        status: 'pending' as const,
        humanNotes: null,
      }))
    );
  }

  return { recommendations, rawResponse: result.text };
}

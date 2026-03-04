import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import { aceV2Sessions, aceV2Artifacts } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { generateWithAnthropic } from '@/lib/aceabalize/anthropic-client';
import { generateWithAI } from '@/lib/ai';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DimensionScores {
  voice_tone: number;
  instructional_design: number;
  content_quality: number;
  formatting: number;
}

export interface EvalResult {
  scores: {
    a: DimensionScores;
    b: DimensionScores;
  };
  overall: { a: number; b: number };
  winner: 'A' | 'B' | 'Tie';
  summary: string;
  a_strengths: string[];
  a_weaknesses: string[];
  b_strengths: string[];
  b_weaknesses: string[];
  recommendation: string;
  provider: string;
}

export interface ContentMetrics {
  length: number;
  words: number;
  contractions: number;
  context_hooks: number;
  bolded_terms: number;
  paragraphs: number;
}

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

const CONTRACTIONS_RE = /\b(don't|won't|can't|isn't|aren't|wasn't|weren't|hasn't|haven't|hadn't|doesn't|didn't|wouldn't|shouldn't|couldn't|mightn't|mustn't|I'm|I've|I'll|I'd|you're|you've|you'll|you'd|he's|she's|it's|we're|we've|we'll|we'd|they're|they've|they'll|they'd|that's|who's|what's|there's|here's|let's)\b/gi;

const CONTEXT_HOOKS_RE = /here's (the catch|how it works|where|what|the thing|the key)|think of it|picture this|imagine (you|a|an|the)|here's why|the catch is|consider this/gi;

function calcMetrics(content: string): ContentMetrics {
  return {
    length: content.length,
    words: content.split(/\s+/).filter(Boolean).length,
    contractions: (content.match(CONTRACTIONS_RE) ?? []).length,
    context_hooks: (content.match(CONTEXT_HOOKS_RE) ?? []).length,
    bolded_terms: (content.match(/\*\*[^*]+\*\*/g) ?? []).length,
    paragraphs: content.split(/\n\s*\n/).filter((p) => p.trim().length > 0).length,
  };
}

// ---------------------------------------------------------------------------
// Evaluation prompt — both sessions evaluated together by one AI call
// ---------------------------------------------------------------------------

const EVAL_SYSTEM = `You are an expert evaluator of Aceable insurance course content. You will receive TWO versions of content (A and B) and evaluate both against Aceable's voice and instructional standards.

Score each version across these dimensions (0-10):
- voice_tone (30% weight): Patient instructor voice, contractions, conversational language, engagement hooks
- instructional_design (25% weight): Clear learning structure, layered definitions, real-world examples
- content_quality (30% weight): Factual accuracy, completeness, no regulatory anti-patterns ("your policy", "your claim")
- formatting (15% weight): Appropriate use of headers, bullets, bolded terms, paragraph length

Calculate overall = (voice_tone*0.30) + (instructional_design*0.25) + (content_quality*0.30) + (formatting*0.15)

Respond with ONLY valid JSON in this EXACT format (no markdown, no explanation):
{
  "scores": {
    "a": {"voice_tone": 0, "instructional_design": 0, "content_quality": 0, "formatting": 0},
    "b": {"voice_tone": 0, "instructional_design": 0, "content_quality": 0, "formatting": 0}
  },
  "overall": {"a": 0.0, "b": 0.0},
  "winner": "A",
  "summary": "one sentence comparing the two",
  "a_strengths": ["strength 1", "strength 2"],
  "a_weaknesses": ["weakness 1", "weakness 2"],
  "b_strengths": ["strength 1", "strength 2"],
  "b_weaknesses": ["weakness 1", "weakness 2"],
  "recommendation": "which to use and why"
}

winner must be exactly "A", "B", or "Tie".`;

function buildEvalPrompt(fileA: string, contentA: string, fileB: string, contentB: string): string {
  const limit = 40000;
  return `Compare these two versions of insurance course content:

=== VERSION A: ${fileA} ===
${contentA.slice(0, limit)}

=== VERSION B: ${fileB} ===
${contentB.slice(0, limit)}

Evaluate both versions using the Aceable scoring rubric.`;
}

async function runAnthropicEval(
  fileA: string, contentA: string,
  fileB: string, contentB: string
): Promise<EvalResult | null> {
  try {
    const result = await generateWithAnthropic(
      buildEvalPrompt(fileA, contentA, fileB, contentB),
      { system: EVAL_SYSTEM, temperature: 0.3, maxTokens: 1500 }
    );
    const parsed = JSON.parse(result.text) as EvalResult;
    return { ...parsed, provider: 'anthropic' };
  } catch (err) {
    console.warn('[compare] Anthropic eval failed:', err);
    return null;
  }
}

async function runOpenAIEval(
  fileA: string, contentA: string,
  fileB: string, contentB: string
): Promise<EvalResult | null> {
  try {
    const text = await generateWithAI(
      buildEvalPrompt(fileA, contentA, fileB, contentB),
      EVAL_SYSTEM
    );
    const parsed = JSON.parse(text) as EvalResult;
    return { ...parsed, provider: 'openai' };
  } catch (err) {
    console.warn('[compare] OpenAI eval failed:', err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = request.nextUrl;
  const sessionIdA = searchParams.get('a');
  const sessionIdB = searchParams.get('b');
  const skipAi = searchParams.get('skipAi') === 'true';

  if (!sessionIdA || !sessionIdB) {
    return NextResponse.json({ error: 'Both ?a= and ?b= session IDs are required' }, { status: 400 });
  }

  const [sessionA, sessionB] = await Promise.all([
    db.select().from(aceV2Sessions).where(
      and(eq(aceV2Sessions.sessionId, sessionIdA), eq(aceV2Sessions.ownerUserId, userId))
    ).limit(1),
    db.select().from(aceV2Sessions).where(
      and(eq(aceV2Sessions.sessionId, sessionIdB), eq(aceV2Sessions.ownerUserId, userId))
    ).limit(1),
  ]);

  if (!sessionA[0]) return NextResponse.json({ error: 'Session A not found' }, { status: 404 });
  if (!sessionB[0]) return NextResponse.json({ error: 'Session B not found' }, { status: 404 });

  const [artifactA, artifactB] = await Promise.all([
    db.select({ contentText: aceV2Artifacts.contentText })
      .from(aceV2Artifacts)
      .where(and(eq(aceV2Artifacts.sessionId, sessionIdA), eq(aceV2Artifacts.artifactKey, 'final_md')))
      .limit(1),
    db.select({ contentText: aceV2Artifacts.contentText })
      .from(aceV2Artifacts)
      .where(and(eq(aceV2Artifacts.sessionId, sessionIdB), eq(aceV2Artifacts.artifactKey, 'final_md')))
      .limit(1),
  ]);

  const contentA = artifactA[0]?.contentText ?? '';
  const contentB = artifactB[0]?.contentText ?? '';
  const fileA = sessionA[0].originalFileName ?? 'Session A';
  const fileB = sessionB[0].originalFileName ?? 'Session B';

  const metricsA = calcMetrics(contentA);
  const metricsB = calcMetrics(contentB);
  const lengthDiffPct = metricsA.length > 0
    ? Math.round(Math.abs(metricsA.length - metricsB.length) / metricsA.length * 100)
    : 0;

  // Both AIs evaluate BOTH sessions together (true A vs B comparison)
  const [anthropicEval, openaiEval]: [EvalResult | null, EvalResult | null] = skipAi
    ? [null, null]
    : await Promise.all([
        runAnthropicEval(fileA, contentA, fileB, contentB),
        runOpenAIEval(fileA, contentA, fileB, contentB),
      ]);

  return NextResponse.json({
    session_a: {
      id: sessionIdA,
      fileName: fileA,
      createdAt: sessionA[0].createdAt,
      completedAt: sessionA[0].pipelineCompletedAt,
    },
    session_b: {
      id: sessionIdB,
      fileName: fileB,
      createdAt: sessionB[0].createdAt,
      completedAt: sessionB[0].pipelineCompletedAt,
    },
    metrics: { lengthDiffPct, a: metricsA, b: metricsB },
    ai_evaluations: { anthropic: anthropicEval, openai: openaiEval },
    content_a: contentA,
    content_b: contentB,
  });
}

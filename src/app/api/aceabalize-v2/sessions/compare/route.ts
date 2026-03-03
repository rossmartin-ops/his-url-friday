import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import { aceV2Sessions, aceV2Artifacts } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { generateWithAnthropic } from '@/lib/aceabalize/anthropic-client';
import { generateWithAI } from '@/lib/ai';

interface EvalResult {
  completeness: number;
  accuracy: number;
  clarity: number;
  educational_value: number;
  structure: number;
  overall: number;
  summary: string;
}

interface BasicMetrics {
  length: number;
  words: number;
  lines: number;
  paragraphs: number;
  sentences: number;
}

function calcMetrics(content: string): BasicMetrics {
  return {
    length: content.length,
    words: content.split(/\s+/).filter(Boolean).length,
    lines: content.split('\n').length,
    paragraphs: content.split(/\n\s*\n/).filter((p) => p.trim().length > 0).length,
    sentences: (content.match(/[.!?]+/g) ?? []).length,
  };
}

const EVAL_SYSTEM = `You are an expert educational content evaluator. Score the following insurance course content on these dimensions (0-10):
- completeness: Does it cover all necessary topics?
- accuracy: Is the information factually correct?
- clarity: Is it easy to understand?
- educational_value: Will learners retain and apply this knowledge?
- structure: Is it logically organized?
- overall: Overall quality score

Respond with ONLY valid JSON in this exact format:
{"completeness": 0, "accuracy": 0, "clarity": 0, "educational_value": 0, "structure": 0, "overall": 0, "summary": "one sentence"}`;

async function runAnthropicEval(content: string) {
  try {
    const result = await generateWithAnthropic(
      `Evaluate this educational content:\n\n${content.slice(0, 8000)}`,
      { system: EVAL_SYSTEM, temperature: 0.3, maxTokens: 500 }
    );
    return JSON.parse(result.text) as EvalResult;
  } catch {
    return null;
  }
}

async function runOpenAIEval(content: string) {
  try {
    const text = await generateWithAI(
      `Evaluate this educational content:\n\n${content.slice(0, 8000)}`,
      EVAL_SYSTEM
    );
    return JSON.parse(text) as EvalResult;
  } catch {
    return null;
  }
}

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

  // Fetch both sessions (verify ownership)
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

  // Fetch final_md artifacts for both
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

  const metricsA = calcMetrics(contentA);
  const metricsB = calcMetrics(contentB);
  const lengthDiffPct =
    metricsA.length > 0
      ? Math.round(Math.abs(metricsA.length - metricsB.length) / metricsA.length * 100)
      : 0;

  // Run AI evals in parallel (optional)
  const [anthropicEval, openaiEval]: [EvalResult | null, EvalResult | null] = skipAi
    ? [null, null]
    : await Promise.all([runAnthropicEval(contentA), runOpenAIEval(contentB)]);

  return NextResponse.json({
    session_a: {
      id: sessionIdA,
      fileName: sessionA[0].originalFileName,
      createdAt: sessionA[0].createdAt,
      completedAt: sessionA[0].pipelineCompletedAt,
    },
    session_b: {
      id: sessionIdB,
      fileName: sessionB[0].originalFileName,
      createdAt: sessionB[0].createdAt,
      completedAt: sessionB[0].pipelineCompletedAt,
    },
    metrics: {
      lengthDiffPct,
      a: metricsA,
      b: metricsB,
    },
    ai_evaluations: {
      anthropic: anthropicEval,
      openai: openaiEval,
    },
    content_a: contentA,
    content_b: contentB,
  });
}

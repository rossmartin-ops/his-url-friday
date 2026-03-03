import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createSession, createJob } from '@/lib/aceabalize/job-runner';
import { runProcessPhase } from '@/lib/aceabalize/phases/process';
import { runEnhancePhase } from '@/lib/aceabalize/phases/enhance';
import { runPolishPhase } from '@/lib/aceabalize/phases/polish';
import { runBookEndsPhase } from '@/lib/aceabalize/phases/book-ends';

type Phase = 'process' | 'enhance' | 'polish' | 'book-ends';

const VALID_PHASES: Phase[] = ['process', 'enhance', 'polish', 'book-ends'];

interface SubmitBody {
  sessionId?: string;
  content?: string;
  originalFileName?: string;
  config?: Record<string, unknown>;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ phase: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { phase } = await params;
  if (!VALID_PHASES.includes(phase as Phase)) {
    return NextResponse.json({ error: `Unknown phase: ${phase}` }, { status: 400 });
  }

  let body: SubmitBody;
  try {
    body = (await request.json()) as SubmitBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { content, originalFileName, config } = body;
  let { sessionId } = body;

  if (phase === 'process' && !content) {
    return NextResponse.json({ error: 'content is required for the process phase' }, { status: 400 });
  }

  sessionId ??= await createSession(userId, originalFileName ?? 'untitled', config);

  const dbPhase = phase === 'book-ends' ? 'book_ends' : phase;
  const jobId = await createJob(sessionId, userId, dbPhase as 'process' | 'enhance' | 'polish' | 'book_ends', config);

  // Fire background processing — do NOT await, response returns immediately
  const capturedSessionId = sessionId;
  const capturedContent = content;
  void (async () => {
    try {
      if (phase === 'process' && capturedContent) {
        await runProcessPhase(jobId, capturedSessionId, capturedContent);
      } else if (phase === 'enhance') {
        await runEnhancePhase(jobId, capturedSessionId, capturedContent);
      } else if (phase === 'polish') {
        await runPolishPhase(jobId, capturedSessionId, capturedContent);
      } else if (phase === 'book-ends') {
        await runBookEndsPhase(jobId, capturedSessionId, capturedContent);
      }
    } catch (err) {
      console.error(`[aceabalize-v2/${phase}] Background job ${jobId} failed:`, err);
    }
  })();

  return NextResponse.json({ jobId, sessionId });
}

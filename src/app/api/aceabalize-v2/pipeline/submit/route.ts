import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createSession, createJob } from '@/lib/aceabalize/job-runner';
import { runFullPipeline, type PipelineJobIds } from '@/lib/aceabalize/pipeline';

interface PipelineSubmitBody {
  content: string;
  originalFileName?: string;
  sessionId?: string;
}

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: PipelineSubmitBody;
  try {
    body = (await request.json()) as PipelineSubmitBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { content, originalFileName } = body;
  let { sessionId } = body;

  if (!content.trim()) {
    return NextResponse.json({ error: 'content is required' }, { status: 400 });
  }

  // Create session if not provided
  sessionId ??= await createSession(userId, originalFileName ?? 'untitled');

  // Create all 4 jobs upfront so the UI can poll them immediately
  const [processJobId, enhanceJobId, polishJobId, bookEndsJobId] = await Promise.all([
    createJob(sessionId, userId, 'process'),
    createJob(sessionId, userId, 'enhance'),
    createJob(sessionId, userId, 'polish'),
    createJob(sessionId, userId, 'book_ends'),
  ]);

  const jobIds: PipelineJobIds = {
    process: processJobId,
    enhance: enhanceJobId,
    polish: polishJobId,
    bookEnds: bookEndsJobId,
  };

  // Fire full pipeline in background — do NOT await
  void runFullPipeline(sessionId, jobIds, content).catch((err: unknown) => {
    console.error('[pipeline/submit] Unhandled pipeline error:', err);
  });

  return NextResponse.json({ sessionId, jobs: jobIds });
}

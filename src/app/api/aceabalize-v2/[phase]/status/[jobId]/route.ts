import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getJob } from '@/lib/aceabalize/job-runner';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ phase: string; jobId: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { jobId } = await params;
  const job = await getJob(jobId);

  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  if (job.ownerUserId !== userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const durationSeconds =
    job.startedAt && job.completedAt
      ? Math.round((job.completedAt.getTime() - job.startedAt.getTime()) / 1000)
      : null;

  return NextResponse.json({
    jobId: job.jobId,
    sessionId: job.sessionId,
    phase: job.phase,
    status: job.status,
    progress: job.progress,
    currentChunk: job.currentChunk,
    totalChunks: job.totalChunks,
    messages: job.messages,
    errors: job.errors,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    durationSeconds,
  });
}

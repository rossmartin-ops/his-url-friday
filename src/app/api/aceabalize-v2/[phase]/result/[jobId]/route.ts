import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getJob } from '@/lib/aceabalize/job-runner';
import { db } from '@/lib/db';
import { aceV2Artifacts } from '@/db/schema';
import { eq } from 'drizzle-orm';

const PHASE_ARTIFACT_MAP: Record<string, string> = {
  process: 'processed_md',
  enhance: 'enhanced_md',
  polish: 'polished_md',
  'book-ends': 'final_md',
};

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ phase: string; jobId: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { phase, jobId } = await params;
  const job = await getJob(jobId);

  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  if (job.ownerUserId !== userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (job.status !== 'done') {
    return NextResponse.json({ error: `Job is not complete (status: ${job.status})` }, { status: 409 });
  }

  const artifactKey = PHASE_ARTIFACT_MAP[phase] ?? 'final_md';

  const artifacts = await db
    .select()
    .from(aceV2Artifacts)
    .where(eq(aceV2Artifacts.jobId, jobId));

  const artifact = artifacts.find((a) => a.artifactKey === artifactKey);

  return NextResponse.json({
    jobId,
    sessionId: job.sessionId,
    artifactKey,
    content: artifact?.contentText ?? null,
    sizeBytes: artifact?.sizeBytes ?? 0,
    createdAt: artifact?.createdAt ?? null,
  });
}

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getJob, updateJob } from '@/lib/aceabalize/job-runner';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ phase: string; jobId: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { jobId } = await params;
  const job = await getJob(jobId);

  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  if (job.ownerUserId !== userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  if (job.status === 'done' || job.status === 'canceled') {
    return NextResponse.json({ error: `Job is already ${job.status}` }, { status: 409 });
  }

  await updateJob(jobId, {
    status: 'canceled',
    completedAt: new Date(),
    message: 'Canceled by user',
  });

  return NextResponse.json({ jobId, status: 'canceled' });
}

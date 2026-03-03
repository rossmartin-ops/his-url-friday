import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import { aceV2Sessions, aceV2Jobs, aceV2Artifacts } from '@/db/schema';
import { eq, and, desc } from 'drizzle-orm';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { sessionId } = await params;

  const sessions = await db
    .select()
    .from(aceV2Sessions)
    .where(and(eq(aceV2Sessions.sessionId, sessionId), eq(aceV2Sessions.ownerUserId, userId)))
    .limit(1);

  if (!sessions[0]) return NextResponse.json({ error: 'Session not found' }, { status: 404 });

  const [jobs, artifacts] = await Promise.all([
    db.select().from(aceV2Jobs)
      .where(eq(aceV2Jobs.sessionId, sessionId))
      .orderBy(desc(aceV2Jobs.createdAt)),
    db.select({
      artifactKey: aceV2Artifacts.artifactKey,
      sizeBytes: aceV2Artifacts.sizeBytes,
      createdAt: aceV2Artifacts.createdAt,
      jobId: aceV2Artifacts.jobId,
    }).from(aceV2Artifacts).where(eq(aceV2Artifacts.sessionId, sessionId)),
  ]);

  return NextResponse.json({ session: sessions[0], jobs, artifacts });
}

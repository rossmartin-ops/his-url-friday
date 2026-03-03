import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import { aceV2Sessions, aceV2Artifacts } from '@/db/schema';
import { eq, and } from 'drizzle-orm';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ sessionId: string; artifactKey: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { sessionId, artifactKey } = await params;

  // Verify session ownership
  const sessions = await db
    .select({ id: aceV2Sessions.id })
    .from(aceV2Sessions)
    .where(and(eq(aceV2Sessions.sessionId, sessionId), eq(aceV2Sessions.ownerUserId, userId)))
    .limit(1);

  if (!sessions[0]) return NextResponse.json({ error: 'Session not found' }, { status: 404 });

  const artifacts = await db
    .select()
    .from(aceV2Artifacts)
    .where(
      and(
        eq(aceV2Artifacts.sessionId, sessionId),
        eq(aceV2Artifacts.artifactKey, artifactKey)
      )
    )
    .limit(1);

  if (!artifacts[0]) return NextResponse.json({ error: 'Artifact not found' }, { status: 404 });

  return NextResponse.json({
    sessionId,
    artifactKey,
    content: artifacts[0].contentText,
    sizeBytes: artifacts[0].sizeBytes,
    createdAt: artifacts[0].createdAt,
  });
}

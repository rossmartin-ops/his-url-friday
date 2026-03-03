import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import { aceV2Sessions, reviewRecommendations } from '@/db/schema';
import { eq, and } from 'drizzle-orm';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { sessionId } = await params;

  // Verify ownership
  const sessions = await db
    .select({ id: aceV2Sessions.id })
    .from(aceV2Sessions)
    .where(and(eq(aceV2Sessions.sessionId, sessionId), eq(aceV2Sessions.ownerUserId, userId)))
    .limit(1);

  if (!sessions[0]) return NextResponse.json({ error: 'Session not found' }, { status: 404 });

  const recommendations = await db
    .select()
    .from(reviewRecommendations)
    .where(eq(reviewRecommendations.sessionId, sessionId))
    .orderBy(reviewRecommendations.id);

  const pending = recommendations.filter((r) => r.status === 'pending').length;
  const approved = recommendations.filter((r) => r.status === 'approved').length;
  const rejected = recommendations.filter((r) => r.status === 'rejected').length;

  return NextResponse.json({
    sessionId,
    recommendations,
    stats: { total: recommendations.length, pending, approved, rejected },
  });
}

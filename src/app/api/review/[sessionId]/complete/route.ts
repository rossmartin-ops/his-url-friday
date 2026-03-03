import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import { aceV2Sessions, reviewRecommendations } from '@/db/schema';
import { eq, and } from 'drizzle-orm';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { sessionId } = await params;

  // Verify ownership
  const sessions = await db
    .select()
    .from(aceV2Sessions)
    .where(and(eq(aceV2Sessions.sessionId, sessionId), eq(aceV2Sessions.ownerUserId, userId)))
    .limit(1);

  if (!sessions[0]) return NextResponse.json({ error: 'Session not found' }, { status: 404 });

  const recommendations = await db
    .select()
    .from(reviewRecommendations)
    .where(eq(reviewRecommendations.sessionId, sessionId));

  const pending = recommendations.filter((r) => r.status === 'pending');
  if (pending.length > 0) {
    return NextResponse.json(
      { error: `${pending.length} recommendation(s) still pending review` },
      { status: 409 }
    );
  }

  const approved = recommendations.filter((r) => r.status === 'approved');
  const rejected = recommendations.filter((r) => r.status === 'rejected');

  // Mark pipeline as complete
  await db
    .update(aceV2Sessions)
    .set({ pipelineCompletedAt: new Date() })
    .where(eq(aceV2Sessions.sessionId, sessionId));

  return NextResponse.json({
    sessionId,
    reviewComplete: true,
    stats: {
      total: recommendations.length,
      approved: approved.length,
      rejected: rejected.length,
    },
    approvedRecommendations: approved.map((r) => ({
      recId: r.recId,
      category: r.category,
      issue: r.issue,
      recommendedLanguage: r.recommendedLanguage,
      insertionPoint: r.insertionPoint,
      humanNotes: r.humanNotes,
    })),
  });
}

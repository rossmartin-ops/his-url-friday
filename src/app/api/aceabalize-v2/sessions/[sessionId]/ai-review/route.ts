import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import { aceV2Sessions } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { runAIReview } from '@/lib/aceabalize/phases/ai-review';

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

  try {
    const { recommendations } = await runAIReview(sessionId);
    return NextResponse.json({
      sessionId,
      recommendationsGenerated: recommendations.length,
      message: `${recommendations.length} recommendation(s) ready for human review`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import { aceV2Sessions, reviewRecommendations } from '@/db/schema';
import { eq, and } from 'drizzle-orm';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string; recId: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { sessionId, recId } = await params;

  // Verify ownership
  const sessions = await db
    .select({ id: aceV2Sessions.id })
    .from(aceV2Sessions)
    .where(and(eq(aceV2Sessions.sessionId, sessionId), eq(aceV2Sessions.ownerUserId, userId)))
    .limit(1);

  if (!sessions[0]) return NextResponse.json({ error: 'Session not found' }, { status: 404 });

  let body: { status?: 'pending' | 'approved' | 'rejected'; humanNotes?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const validStatuses = ['pending', 'approved', 'rejected'];
  if (body.status && !validStatuses.includes(body.status)) {
    return NextResponse.json({ error: `Invalid status: ${body.status}` }, { status: 400 });
  }

  await db
    .update(reviewRecommendations)
    .set({
      ...(body.status !== undefined && { status: body.status }),
      ...(body.humanNotes !== undefined && { humanNotes: body.humanNotes }),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(reviewRecommendations.recId, recId),
        eq(reviewRecommendations.sessionId, sessionId)
      )
    );

  return NextResponse.json({ recId, updated: true });
}

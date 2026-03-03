import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import { aceV2Sessions, reviewRecommendations } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

interface IncomingRecommendation {
  category?: string;
  issue?: string;
  recommended_language?: string;
  insertion_point?: string;
  source_urls?: Array<{ ref: string; url: string; description: string; is_placeholder: boolean }>;
}

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { sessionId: string; recommendations: IncomingRecommendation[] };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { sessionId, recommendations } = body;
  if (!sessionId || !Array.isArray(recommendations)) {
    return NextResponse.json({ error: 'sessionId and recommendations[] are required' }, { status: 400 });
  }

  // Verify ownership
  const sessions = await db
    .select({ id: aceV2Sessions.id })
    .from(aceV2Sessions)
    .where(and(eq(aceV2Sessions.sessionId, sessionId), eq(aceV2Sessions.ownerUserId, userId)))
    .limit(1);

  if (!sessions[0]) return NextResponse.json({ error: 'Session not found' }, { status: 404 });

  // Insert recommendations
  if (recommendations.length > 0) {
    await db.insert(reviewRecommendations).values(
      recommendations.map((r) => ({
        recId: uuidv4(),
        sessionId,
        category: r.category ?? null,
        issue: r.issue ?? null,
        recommendedLanguage: r.recommended_language ?? null,
        insertionPoint: r.insertion_point ?? null,
        sourceUrls: r.source_urls ?? [],
        status: 'pending' as const,
        humanNotes: null,
      }))
    );
  }

  return NextResponse.json({ sessionId, seeded: recommendations.length });
}

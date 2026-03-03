import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import { aceV2Sessions, aceV2Jobs } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sessions = await db
    .select()
    .from(aceV2Sessions)
    .where(eq(aceV2Sessions.ownerUserId, userId))
    .orderBy(desc(aceV2Sessions.createdAt))
    .limit(50);

  // Attach latest job status per session
  const enriched = await Promise.all(
    sessions.map(async (session) => {
      const jobs = await db
        .select({
          jobId: aceV2Jobs.jobId,
          phase: aceV2Jobs.phase,
          status: aceV2Jobs.status,
          progress: aceV2Jobs.progress,
          completedAt: aceV2Jobs.completedAt,
        })
        .from(aceV2Jobs)
        .where(eq(aceV2Jobs.sessionId, session.sessionId))
        .orderBy(desc(aceV2Jobs.createdAt));

      return { ...session, jobs };
    })
  );

  return NextResponse.json({ sessions: enriched });
}

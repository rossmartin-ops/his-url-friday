import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import { aceV2Prompts } from '@/db/schema';
import { desc } from 'drizzle-orm';

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const prompts = await db
    .select({
      id: aceV2Prompts.id,
      slug: aceV2Prompts.slug,
      name: aceV2Prompts.name,
      description: aceV2Prompts.description,
      activeVersion: aceV2Prompts.activeVersion,
      updatedAt: aceV2Prompts.updatedAt,
    })
    .from(aceV2Prompts)
    .orderBy(desc(aceV2Prompts.updatedAt));

  return NextResponse.json({ prompts });
}

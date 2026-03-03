import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import { aceV2Prompts, aceV2PromptVersions } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { slug } = await params;

  const prompts = await db
    .select({ id: aceV2Prompts.id })
    .from(aceV2Prompts)
    .where(eq(aceV2Prompts.slug, slug))
    .limit(1);

  if (!prompts[0]) return NextResponse.json({ error: 'Prompt not found' }, { status: 404 });

  const versions = await db
    .select()
    .from(aceV2PromptVersions)
    .where(eq(aceV2PromptVersions.promptId, prompts[0].id))
    .orderBy(desc(aceV2PromptVersions.version));

  return NextResponse.json({ slug, versions });
}

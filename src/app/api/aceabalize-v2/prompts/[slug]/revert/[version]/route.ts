import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import { aceV2Prompts, aceV2PromptVersions } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { bustPromptCache } from '@/lib/aceabalize/prompt-loader';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string; version: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { slug, version } = await params;
  const versionNum = parseInt(version, 10);
  if (isNaN(versionNum)) return NextResponse.json({ error: 'Invalid version' }, { status: 400 });

  const prompts = await db
    .select()
    .from(aceV2Prompts)
    .where(eq(aceV2Prompts.slug, slug))
    .limit(1);

  if (!prompts[0]) return NextResponse.json({ error: 'Prompt not found' }, { status: 404 });

  const versions = await db
    .select()
    .from(aceV2PromptVersions)
    .where(
      and(
        eq(aceV2PromptVersions.promptId, prompts[0].id),
        eq(aceV2PromptVersions.version, versionNum)
      )
    )
    .limit(1);

  if (!versions[0]) return NextResponse.json({ error: 'Version not found' }, { status: 404 });

  await db
    .update(aceV2Prompts)
    .set({
      content: versions[0].content,
      activeVersion: versionNum,
      updatedBy: userId,
      updatedAt: new Date(),
    })
    .where(eq(aceV2Prompts.slug, slug));

  bustPromptCache(slug);

  return NextResponse.json({ slug, revertedToVersion: versionNum });
}

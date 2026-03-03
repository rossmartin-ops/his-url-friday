import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import { aceV2Prompts, aceV2PromptVersions } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { bustPromptCache } from '@/lib/aceabalize/prompt-loader';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { slug } = await params;
  const rows = await db
    .select()
    .from(aceV2Prompts)
    .where(eq(aceV2Prompts.slug, slug))
    .limit(1);

  if (!rows[0]) return NextResponse.json({ error: 'Prompt not found' }, { status: 404 });
  return NextResponse.json({ prompt: rows[0] });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { slug } = await params;

  let body: { content: string; changeNote?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.content) return NextResponse.json({ error: 'content is required' }, { status: 400 });

  // Get current prompt
  const rows = await db
    .select()
    .from(aceV2Prompts)
    .where(eq(aceV2Prompts.slug, slug))
    .limit(1);

  if (!rows[0]) return NextResponse.json({ error: 'Prompt not found' }, { status: 404 });

  const prompt = rows[0];
  const newVersion = (prompt.activeVersion ?? 1) + 1;

  // Archive current version, save new version, update prompt
  await db.insert(aceV2PromptVersions).values({
    promptId: prompt.id,
    version: newVersion,
    content: body.content,
    changeNote: body.changeNote ?? null,
    createdBy: userId,
    isArchived: false,
  });

  await db
    .update(aceV2Prompts)
    .set({
      content: body.content,
      activeVersion: newVersion,
      updatedBy: userId,
      updatedAt: new Date(),
    })
    .where(eq(aceV2Prompts.slug, slug));

  bustPromptCache(slug);

  return NextResponse.json({ slug, version: newVersion });
}

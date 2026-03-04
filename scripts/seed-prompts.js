/**
 * Seed the 4 Aceabalize V2 prompts from jarvis-python into the database.
 * Run with: npm run db:seed-prompts
 */

const { config } = require('dotenv');
const path = require('path');
const fs = require('fs');

// Load env vars
config({ path: path.join(__dirname, '..', '.env.development.local') });
config({ path: path.join(__dirname, '..', '.env.local') });

const { Pool } = require('@neondatabase/serverless');
const { neonConfig } = require('@neondatabase/serverless');
const ws = require('ws');

neonConfig.webSocketConstructor = ws;

const JARVIS_PROMPTS_DIR = path.join(
  __dirname,
  '..',
  '..',
  'jarvis-python',
  'prompts'
);

const PROMPTS = [
  {
    slug: 'notes_to_content',
    name: 'Notes to Content (Process)',
    description: 'Transforms SME notes / Course Building Guide into Aceable-voice educational content',
    file: 'notes_to_content_prompt.txt',
  },
  {
    slug: 'enhance',
    name: 'Tone & Style Enhancement (Enhance)',
    description: 'Applies Aceable patient-instructor voice and conversational tone',
    file: 'tone_style_enhancement_prompt.txt',
  },
  {
    slug: 'polish',
    name: 'Final Polish (Polish)',
    description: 'Removes repetition, fluff, and finalizes grammar and flow',
    file: 'final_polish_prompt.txt',
  },
  {
    slug: 'book_ends',
    name: 'Chapter Book Ends (Book Ends)',
    description: 'Generates chapter intro with learning objectives and summary with key points',
    file: 'chapter_book_ends_prompt.txt',
  },
  {
    slug: 'ai_review',
    name: 'AI Content Review',
    description: 'Reviews aceabalized content for accuracy, regulatory compliance, and improvement opportunities',
    file: 'perplexity_review_prompt.txt',
  },
];

async function main() {
  const pool = new Pool({ connectionString: process.env['DATABASE_URL'] });

  for (const prompt of PROMPTS) {
    const filePath = path.join(JARVIS_PROMPTS_DIR, prompt.file);

    if (!fs.existsSync(filePath)) {
      console.error(`✗ File not found: ${filePath}`);
      process.exit(1);
    }

    const content = fs.readFileSync(filePath, 'utf8');

    await pool.query(
      `INSERT INTO ace_v2_prompts (slug, name, description, content, current_version, active_version, updated_at)
       VALUES ($1, $2, $3, $4, 1, 1, NOW())
       ON CONFLICT (slug) DO UPDATE SET
         content = EXCLUDED.content,
         name = EXCLUDED.name,
         description = EXCLUDED.description,
         current_version = 1,
         updated_at = NOW()`,
      [prompt.slug, prompt.name, prompt.description, content]
    );

    console.log(`✓ Seeded: ${prompt.slug} (${content.length} chars)`);
  }

  console.log('\nAll 5 prompts seeded successfully.');
  await pool.end();
}

main().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});

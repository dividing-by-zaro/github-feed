/**
 * Backfill script to generate groupHash for existing GlobalUpdate records.
 *
 * Run with: npx tsx scripts/backfill-group-hash.ts
 */

import 'dotenv/config';
import { createHash } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

function hashPRGroup(prNumbers: number[]): string {
  const sorted = [...prNumbers].sort((a, b) => a - b).join('-');
  return createHash('sha256').update(sorted).digest('hex');
}

async function main() {
  console.log('Fetching GlobalUpdates without groupHash...');

  const updates = await prisma.globalUpdate.findMany({
    where: { groupHash: null },
    include: { prs: { select: { prNumber: true } } },
  });

  console.log(`Found ${updates.length} updates to backfill`);

  let updated = 0;
  let skipped = 0;

  for (const update of updates) {
    if (update.prs.length === 0) {
      console.log(`  Skipping update "${update.title}" (no PRs linked)`);
      skipped++;
      continue;
    }

    const prNumbers = update.prs.map((pr) => pr.prNumber);
    const groupHash = hashPRGroup(prNumbers);

    // Check if this hash already exists for this repo (would cause unique constraint violation)
    const existing = await prisma.globalUpdate.findUnique({
      where: {
        globalRepoId_groupHash: {
          globalRepoId: update.globalRepoId,
          groupHash,
        },
      },
    });

    if (existing && existing.id !== update.id) {
      console.log(`  Duplicate found for "${update.title}" - marking for review`);
      skipped++;
      continue;
    }

    await prisma.globalUpdate.update({
      where: { id: update.id },
      data: { groupHash },
    });

    console.log(`  Updated "${update.title}" with hash ${groupHash.slice(0, 8)}...`);
    updated++;
  }

  console.log(`\nDone! Updated: ${updated}, Skipped: ${skipped}`);
}

main()
  .catch((e) => {
    console.error('Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });

import '../src/env.js';
import { prisma } from '../src/db.js';

async function cleanupDuplicates() {
  console.log('Finding duplicate GlobalUpdate records...\n');

  // Find all updates grouped by globalRepoId + title
  const allUpdates = await prisma.globalUpdate.findMany({
    select: {
      id: true,
      title: true,
      globalRepoId: true,
      createdAt: true,
      prs: { select: { id: true, prNumber: true } },
      globalRepo: { select: { owner: true, name: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  // Group by repo + title
  const groups = new Map<string, typeof allUpdates>();
  for (const update of allUpdates) {
    const key = `${update.globalRepoId}:${update.title}`;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(update);
  }

  // Find duplicates (groups with more than 1 entry)
  const duplicates: Array<{ keep: typeof allUpdates[0]; remove: typeof allUpdates }> = [];
  for (const [key, updates] of groups) {
    if (updates.length > 1) {
      // Keep the oldest one (first created), remove the rest
      const [keep, ...remove] = updates;
      duplicates.push({ keep, remove });
    }
  }

  if (duplicates.length === 0) {
    console.log('No duplicates found!');
    return;
  }

  console.log(`Found ${duplicates.length} duplicate groups:\n`);

  for (const { keep, remove } of duplicates) {
    const repo = `${keep.globalRepo.owner}/${keep.globalRepo.name}`;
    console.log(`📦 ${repo}: "${keep.title}"`);
    console.log(`   Keeping: ${keep.id} (created ${keep.createdAt.toISOString()})`);
    for (const r of remove) {
      console.log(`   Removing: ${r.id} (created ${r.createdAt.toISOString()})`);
    }
    console.log();
  }

  // Prompt for confirmation
  const removeIds = duplicates.flatMap(d => d.remove.map(r => r.id));
  console.log(`\nTotal updates to remove: ${removeIds.length}`);
  console.log('Run with --execute to actually delete them.\n');

  if (process.argv.includes('--execute')) {
    console.log('Deleting duplicate updates...');

    // First, reassign PRs from duplicate updates to the kept update
    for (const { keep, remove } of duplicates) {
      const removeIds = remove.map(r => r.id);

      // Move PRs from removed updates to kept update
      await prisma.globalPR.updateMany({
        where: { updateId: { in: removeIds } },
        data: { updateId: keep.id },
      });
    }

    // Now delete the duplicate updates
    const result = await prisma.globalUpdate.deleteMany({
      where: { id: { in: removeIds } },
    });

    console.log(`Deleted ${result.count} duplicate updates.`);
  }
}

cleanupDuplicates()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

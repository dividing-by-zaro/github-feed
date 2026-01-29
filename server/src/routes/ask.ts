import { Router, Request, Response } from 'express';
import { prisma } from '../db.js';
import { requireAuth, getUser } from '../auth/middleware.js';
import { AskService } from '../services/askService.js';

const router = Router();

router.use(requireAuth);

function sendSSE(res: Response, event: string, data: unknown) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

router.post('/', async (req: Request, res: Response) => {
  const openaiApiKey = process.env.OPENAI_API_KEY;
  if (!openaiApiKey) {
    res.status(500).json({ error: 'OpenAI API key not configured' });
    return;
  }

  const { question, globalRepoId, timeRange } = req.body as {
    question?: string;
    globalRepoId?: string;
    timeRange?: { start: string; end: string };
  };

  // Validate inputs
  if (!question || question.length < 3 || question.length > 500) {
    res.status(400).json({ error: 'Question must be between 3 and 500 characters' });
    return;
  }
  if (!timeRange?.start || !timeRange?.end) {
    res.status(400).json({ error: 'Time range with start and end dates is required' });
    return;
  }

  // Set up SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const askService = new AskService(openaiApiKey);

  try {
    const user = getUser(req);
    const startDate = new Date(timeRange.start);
    const endDate = new Date(timeRange.end);

    // Get user's subscribed repos
    const userRepos = await prisma.userRepo.findMany({
      where: { userId: user.id },
      include: {
        globalRepo: {
          select: {
            id: true,
            owner: true,
            name: true,
            description: true,
          },
        },
      },
    });

    const allRepos = userRepos.map((ur) => ({
      globalRepoId: ur.globalRepo.id,
      owner: ur.globalRepo.owner,
      name: ur.globalRepo.name,
      description: ur.globalRepo.description,
    }));

    let selectedRepoIds: string[];
    let finalDateRange = { start: timeRange.start, end: timeRange.end };

    if (globalRepoId) {
      // Single repo view — skip Phase 1
      selectedRepoIds = [globalRepoId];
    } else {
      // All Repos view — run Phase 1
      sendSSE(res, 'phase', { phase: 1, message: 'Analyzing your question...' });

      // Fetch lightweight update index for Phase 1
      const lightweightUpdates = await prisma.globalUpdate.findMany({
        where: {
          globalRepoId: { in: allRepos.map((r) => r.globalRepoId) },
          date: { gte: startDate, lte: endDate },
          significance: { not: 'internal' },
        },
        select: {
          globalRepoId: true,
          title: true,
          date: true,
          significance: true,
          globalRepo: { select: { owner: true, name: true } },
        },
        orderBy: { date: 'desc' },
        take: 500,
      });

      const updateIndex = lightweightUpdates.map((u) => ({
        globalRepoId: u.globalRepoId,
        repoName: `${u.globalRepo.owner}/${u.globalRepo.name}`,
        title: u.title,
        date: u.date.toISOString().split('T')[0],
        significance: u.significance,
      }));

      const selection = await askService.selectContext(
        question,
        allRepos,
        updateIndex,
        finalDateRange
      );

      selectedRepoIds = selection.repoIds;
      finalDateRange = selection.dateRange;

      sendSSE(res, 'selection', {
        repoIds: selectedRepoIds,
        dateRange: finalDateRange,
      });
    }

    // Phase 2: Fetch full updates for selected repos
    sendSSE(res, 'phase', { phase: 2, message: 'Generating answer...' });

    const fullUpdates = await prisma.globalUpdate.findMany({
      where: {
        globalRepoId: { in: selectedRepoIds },
        date: { gte: new Date(finalDateRange.start), lte: new Date(finalDateRange.end) },
        significance: { not: 'internal' },
      },
      include: {
        prs: {
          select: { prNumber: true, title: true, url: true },
        },
        globalRepo: {
          select: { owner: true, name: true },
        },
      },
      orderBy: { date: 'desc' },
      take: 200,
    });

    const updateContexts = fullUpdates.map((u) => ({
      id: u.id,
      globalRepoId: u.globalRepoId,
      repoName: `${u.globalRepo.owner}/${u.globalRepo.name}`,
      title: u.title,
      summary: u.summary,
      category: u.category,
      significance: u.significance,
      date: u.date.toISOString().split('T')[0],
      prCount: u.prCount,
      commitCount: u.commitCount,
      prs: u.prs.map((pr) => ({
        prNumber: pr.prNumber,
        title: pr.title,
        url: pr.url,
      })),
    }));

    const selectedRepos = allRepos.filter((r) =>
      selectedRepoIds.includes(r.globalRepoId)
    );

    // Stream the answer
    let fullText = '';
    const stream = askService.streamAnswer(question, selectedRepos, updateContexts);

    for await (const chunk of stream) {
      fullText += chunk;
      sendSSE(res, 'chunk', { text: chunk });
    }

    // Extract citations and send done event
    const citedUpdateIds = askService.extractCitations(fullText);
    sendSSE(res, 'done', { citedUpdateIds });
    res.end();
  } catch (error) {
    console.error('Ask feed error:', error);
    sendSSE(res, 'error', {
      message: error instanceof Error ? error.message : 'An error occurred',
    });
    res.end();
  }
});

export default router;

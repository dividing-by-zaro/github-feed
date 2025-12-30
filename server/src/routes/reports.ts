import { Router, Request, Response } from 'express';
import { prisma } from '../db.js';
import { requireAuth, getUser } from '../auth/middleware.js';
import { ReportGenerator } from '../services/reportGenerator.js';
import type { ReportContent } from '../types.js';

const router = Router();

// All routes require authentication
router.use(requireAuth);

// Max date range: 3 months
const MAX_DATE_RANGE_DAYS = 92;

// Format report for API response
function formatReport(report: {
  id: string;
  title: string;
  globalRepoId: string;
  globalRepo: { owner: string; name: string };
  startDate: Date;
  endDate: Date;
  content: unknown;
  markdown: string | null;
  status: string;
  progress: string | null;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: report.id,
    title: report.title,
    globalRepoId: report.globalRepoId,
    repoOwner: report.globalRepo.owner,
    repoName: report.globalRepo.name,
    startDate: report.startDate.toISOString(),
    endDate: report.endDate.toISOString(),
    content: report.content as ReportContent | null,
    markdown: report.markdown,
    status: report.status,
    progress: report.progress,
    error: report.error,
    createdAt: report.createdAt.toISOString(),
    updatedAt: report.updatedAt.toISOString(),
  };
}

// GET /api/reports - List user's reports
router.get('/', async (req: Request, res: Response) => {
  try {
    const user = getUser(req);

    const reports = await prisma.report.findMany({
      where: { userId: user.id },
      include: { globalRepo: { select: { owner: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });

    res.json(reports.map(formatReport));
  } catch (error) {
    console.error('Error fetching reports:', error);
    res.status(500).json({ error: 'Failed to fetch reports' });
  }
});

// GET /api/reports/:id - Get a specific report
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const user = getUser(req);
    const { id } = req.params;

    const report = await prisma.report.findFirst({
      where: { id, userId: user.id },
      include: { globalRepo: { select: { owner: true, name: true } } },
    });

    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }

    res.json(formatReport(report));
  } catch (error) {
    console.error('Error fetching report:', error);
    res.status(500).json({ error: 'Failed to fetch report' });
  }
});

// POST /api/reports - Create a new report
router.post('/', async (req: Request, res: Response) => {
  try {
    const user = getUser(req);
    const { globalRepoId, startDate, endDate } = req.body;

    // Validate required fields
    if (!globalRepoId || !startDate || !endDate) {
      return res.status(400).json({ error: 'globalRepoId, startDate, and endDate are required' });
    }

    // Parse dates
    const start = new Date(startDate);
    const end = new Date(endDate);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({ error: 'Invalid date format' });
    }

    if (start >= end) {
      return res.status(400).json({ error: 'Start date must be before end date' });
    }

    // Check date range limit
    const daysDiff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    if (daysDiff > MAX_DATE_RANGE_DAYS) {
      return res.status(400).json({ error: `Date range cannot exceed ${MAX_DATE_RANGE_DAYS} days (3 months)` });
    }

    // Verify user has access to this repo (via UserRepo)
    const userRepo = await prisma.userRepo.findFirst({
      where: { userId: user.id, globalRepoId },
      include: { globalRepo: true },
    });

    if (!userRepo) {
      return res.status(403).json({ error: 'You are not subscribed to this repository' });
    }

    // Check for existing generating report for this user
    const existingGenerating = await prisma.report.findFirst({
      where: { userId: user.id, status: 'generating' },
    });

    if (existingGenerating) {
      return res.status(409).json({ error: 'You already have a report being generated. Please wait for it to complete.' });
    }

    // Create report title
    const formatDate = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const title = `${userRepo.globalRepo.owner}/${userRepo.globalRepo.name}: ${formatDate(start)} - ${formatDate(end)}`;

    // Create report record with pending status
    const report = await prisma.report.create({
      data: {
        title,
        globalRepoId,
        userId: user.id,
        startDate: start,
        endDate: end,
        status: 'pending',
      },
      include: { globalRepo: { select: { owner: true, name: true } } },
    });

    // Start generation in background (don't await)
    generateReportInBackground(report.id).catch((err) => {
      console.error(`Background report generation failed for ${report.id}:`, err);
    });

    res.json(formatReport(report));
  } catch (error) {
    console.error('Error creating report:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to create report',
    });
  }
});

// DELETE /api/reports/:id - Delete a report
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const user = getUser(req);
    const { id } = req.params;

    const result = await prisma.report.deleteMany({
      where: { id, userId: user.id },
    });

    if (result.count === 0) {
      return res.status(404).json({ error: 'Report not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting report:', error);
    res.status(500).json({ error: 'Failed to delete report' });
  }
});

// GET /api/reports/:id/markdown - Export report as markdown
router.get('/:id/markdown', async (req: Request, res: Response) => {
  try {
    const user = getUser(req);
    const { id } = req.params;

    const report = await prisma.report.findFirst({
      where: { id, userId: user.id },
      include: { globalRepo: { select: { owner: true, name: true } } },
    });

    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }

    if (report.status !== 'completed') {
      return res.status(400).json({ error: 'Report is not yet completed' });
    }

    // Generate markdown if not cached
    let markdown = report.markdown;
    if (!markdown && report.content) {
      markdown = generateMarkdown(report.content as unknown as ReportContent, report.globalRepo);
      // Cache the markdown
      await prisma.report.update({
        where: { id },
        data: { markdown },
      });
    }

    const filename = `${report.globalRepo.owner}-${report.globalRepo.name}-report-${report.startDate.toISOString().split('T')[0]}.md`;

    res.json({ markdown: markdown || '', filename });
  } catch (error) {
    console.error('Error exporting report:', error);
    res.status(500).json({ error: 'Failed to export report' });
  }
});

// Background report generation
async function generateReportInBackground(reportId: string) {
  const openaiApiKey = process.env.OPENAI_API_KEY;
  const githubToken = process.env.GITHUB_TOKEN;

  if (!openaiApiKey) {
    await prisma.report.update({
      where: { id: reportId },
      data: { status: 'failed', error: 'OpenAI API key not configured' },
    });
    return;
  }

  try {
    // Update status to generating
    await prisma.report.update({
      where: { id: reportId },
      data: { status: 'generating', progress: 'Starting...' },
    });

    // Get report data
    const report = await prisma.report.findUnique({
      where: { id: reportId },
      include: { globalRepo: true },
    });

    if (!report) {
      throw new Error('Report not found');
    }

    // Generate the report content (with GitHub token for fetching missing PRs)
    const generator = new ReportGenerator(openaiApiKey, githubToken || undefined);
    const content = await generator.generateReport(
      report.globalRepoId,
      report.startDate,
      report.endDate,
      report.globalRepo,
      async (progress: string) => {
        await prisma.report.update({
          where: { id: reportId },
          data: { progress },
        });
      }
    );

    // Generate markdown
    const markdown = generateMarkdown(content, report.globalRepo);

    // Update report with content
    await prisma.report.update({
      where: { id: reportId },
      data: {
        status: 'completed',
        content: content as object,
        markdown,
        progress: null,
      },
    });
  } catch (error) {
    console.error(`Report generation failed for ${reportId}:`, error);
    await prisma.report.update({
      where: { id: reportId },
      data: {
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
        progress: null,
      },
    });
  }
}

// Generate markdown from report content
function generateMarkdown(content: ReportContent, repo: { owner: string; name: string }): string {
  const lines: string[] = [];

  lines.push(`# ${repo.owner}/${repo.name} Report`);
  lines.push('');
  lines.push(`**Period:** ${content.metadata.startDate} to ${content.metadata.endDate}`);
  lines.push(`**Generated:** ${content.metadata.generatedAt}`);
  lines.push(`**Updates analyzed:** ${content.metadata.updateCount}`);
  lines.push(`**PRs included:** ${content.metadata.prCount}`);
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## Executive Summary');
  lines.push('');
  lines.push(content.executiveSummary);
  lines.push('');

  const significanceLabels = {
    major: 'Major Features',
    minor: 'Minor Enhancements',
    patch: 'Patch Fixes',
  };

  for (const section of content.sections) {
    if (section.themes.length === 0) continue;

    lines.push('---');
    lines.push('');
    lines.push(`## ${significanceLabels[section.significance]}`);
    lines.push('');

    for (const theme of section.themes) {
      lines.push(`### ${theme.name}`);
      lines.push('');
      lines.push(theme.summary);
      lines.push('');

      if (theme.relatedPRs.length > 0) {
        lines.push('**Related PRs:**');
        for (const pr of theme.relatedPRs) {
          lines.push(`- [#${pr.number}](${pr.url}) ${pr.title}`);
        }
        lines.push('');
      }
    }
  }

  return lines.join('\n');
}

export default router;

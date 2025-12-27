import { Router } from 'express';
import { prisma } from '../db.js';
import { requireAuth, getUser } from '../auth/middleware.js';

const router = Router();

// All routes require authentication
router.use(requireAuth);

// Get user settings
router.get('/settings', async (req, res) => {
  try {
    const user = getUser(req);
    const fullUser = await prisma.user.findUnique({
      where: { id: user.id },
    });

    if (!fullUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      hasOpenaiKey: !!fullUser.openaiApiKey,
      hasGithubToken: !!fullUser.githubToken,
      visibleSignificance: fullUser.visibleSignificance,
      visibleCategories: fullUser.visibleCategories,
    });
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// Update user settings
router.put('/settings', async (req, res) => {
  try {
    const user = getUser(req);
    const { openaiApiKey, githubToken, visibleSignificance, visibleCategories } = req.body;

    const updateData: any = {};

    // Only update API keys if provided (empty string clears them)
    if (openaiApiKey !== undefined) {
      updateData.openaiApiKey = openaiApiKey || null;
    }
    if (githubToken !== undefined) {
      updateData.githubToken = githubToken || null;
    }
    if (visibleSignificance) {
      updateData.visibleSignificance = visibleSignificance;
    }
    if (visibleCategories) {
      updateData.visibleCategories = visibleCategories;
    }

    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: updateData,
    });

    res.json({
      hasOpenaiKey: !!updatedUser.openaiApiKey,
      hasGithubToken: !!updatedUser.githubToken,
      visibleSignificance: updatedUser.visibleSignificance,
      visibleCategories: updatedUser.visibleCategories,
    });
  } catch (error) {
    console.error('Error updating settings:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// Get starred change IDs
router.get('/starred', async (req, res) => {
  try {
    const user = getUser(req);
    const starred = await prisma.starredChange.findMany({
      where: { userId: user.id },
      select: { changeId: true },
    });

    res.json(starred.map((s) => s.changeId));
  } catch (error) {
    console.error('Error fetching starred:', error);
    res.status(500).json({ error: 'Failed to fetch starred changes' });
  }
});

// Star a change
router.post('/starred/:changeId', async (req, res) => {
  try {
    const user = getUser(req);
    const { changeId } = req.params;

    await prisma.starredChange.upsert({
      where: {
        userId_changeId: {
          userId: user.id,
          changeId,
        },
      },
      update: {},
      create: {
        userId: user.id,
        changeId,
      },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error starring change:', error);
    res.status(500).json({ error: 'Failed to star change' });
  }
});

// Unstar a change
router.delete('/starred/:changeId', async (req, res) => {
  try {
    const user = getUser(req);
    const { changeId } = req.params;

    await prisma.starredChange.deleteMany({
      where: {
        userId: user.id,
        changeId,
      },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error unstarring change:', error);
    res.status(500).json({ error: 'Failed to unstar change' });
  }
});

export default router;

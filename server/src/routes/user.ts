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
    const { visibleSignificance, visibleCategories } = req.body;

    const updateData: any = {};

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
      visibleSignificance: updatedUser.visibleSignificance,
      visibleCategories: updatedUser.visibleCategories,
    });
  } catch (error) {
    console.error('Error updating settings:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// Get starred update IDs
router.get('/starred', async (req, res) => {
  try {
    const user = getUser(req);
    const starred = await prisma.starredUpdate.findMany({
      where: { userId: user.id },
      select: { updateId: true },
    });

    res.json(starred.map((s: { updateId: string }) => s.updateId));
  } catch (error) {
    console.error('Error fetching starred:', error);
    res.status(500).json({ error: 'Failed to fetch starred updates' });
  }
});

// Star an update
router.post('/starred/:updateId', async (req, res) => {
  try {
    const user = getUser(req);
    const { updateId } = req.params;

    await prisma.starredUpdate.upsert({
      where: {
        userId_updateId: {
          userId: user.id,
          updateId,
        },
      },
      update: {},
      create: {
        userId: user.id,
        updateId,
      },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error starring update:', error);
    res.status(500).json({ error: 'Failed to star update' });
  }
});

// Unstar an update
router.delete('/starred/:updateId', async (req, res) => {
  try {
    const user = getUser(req);
    const { updateId } = req.params;

    await prisma.starredUpdate.deleteMany({
      where: {
        userId: user.id,
        updateId,
      },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error unstarring update:', error);
    res.status(500).json({ error: 'Failed to unstar update' });
  }
});

// Mark all feed items as seen
router.post('/mark-seen', async (req, res) => {
  try {
    const user = getUser(req);

    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: { lastSeenAt: new Date() },
    });

    res.json({ lastSeenAt: updatedUser.lastSeenAt });
  } catch (error) {
    console.error('Error marking as seen:', error);
    res.status(500).json({ error: 'Failed to mark as seen' });
  }
});

export default router;

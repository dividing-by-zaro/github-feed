import { Router } from 'express';
import passport from '../auth/passport.js';
import { requireAuth, getUser } from '../auth/middleware.js';

const router = Router();

// Frontend URL for redirects
const FRONTEND_URL = process.env.NODE_ENV === 'production' ? '' : 'http://localhost:5173';

// Initiate Google OAuth
router.get(
  '/google',
  passport.authenticate('google', {
    scope: ['profile', 'email'],
  })
);

// Google OAuth callback
router.get(
  '/google/callback',
  passport.authenticate('google', {
    failureRedirect: `${FRONTEND_URL}/?error=auth_failed`,
  }),
  (req, res) => {
    // Successful authentication, redirect to app
    res.redirect(`${FRONTEND_URL}/`);
  }
);

// Get current user
router.get('/me', (req, res) => {
  if (req.isAuthenticated() && req.user) {
    const user = getUser(req);
    // Don't send sensitive keys to client
    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      hasOpenaiKey: !!user.openaiApiKey,
      hasGithubToken: !!user.githubToken,
      visibleSignificance: user.visibleSignificance,
      visibleCategories: user.visibleCategories,
    });
  } else {
    res.status(401).json({ error: 'Not authenticated' });
  }
});

// Logout
router.post('/logout', (req, res) => {
  req.logout((err) => {
    if (err) {
      return res.status(500).json({ error: 'Logout failed' });
    }
    res.json({ success: true });
  });
});

export default router;

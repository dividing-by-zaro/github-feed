import { Request, Response, NextFunction } from 'express';
import { User } from '@prisma/client';

// Extend Express Request to include user
declare global {
  namespace Express {
    interface User extends Omit<import('@prisma/client').User, 'openaiApiKey' | 'githubToken'> {
      openaiApiKey?: string | null;
      githubToken?: string | null;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (req.isAuthenticated() && req.user) {
    return next();
  }
  res.status(401).json({ error: 'Unauthorized' });
}

// Helper to get typed user from request
export function getUser(req: Request): Express.User {
  if (!req.user) {
    throw new Error('User not found in request');
  }
  return req.user;
}

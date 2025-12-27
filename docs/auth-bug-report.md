# Authentication Bug Report

**Date:** 2025-12-26
**Status:** Partially Fixed / In Progress

## Symptom

When loading the app or clicking "Login with Google", the user sees:

```
Failed to fetch user: SyntaxError: JSON.parse: unexpected character at line 1 column 1 of the JSON data
```

## Root Cause

The Vite dev server proxy is not forwarding `/auth/*` requests to the backend. Instead, it returns the SPA's `index.html` (HTML) with a 200 status. When the frontend tries to parse this as JSON, it fails.

**Evidence:**
```javascript
// In browser console at http://localhost:5173
fetch('/auth/me', { credentials: 'include' }).then(r => r.text()).then(console.log)
// Returns: <!DOCTYPE html>... (the index.html)
```

```bash
# Direct backend request works fine
curl http://localhost:3001/auth/me
# Returns: {"error":"Not authenticated"}
```

## Issues Fixed During Investigation

### 1. Prisma 7 Configuration (Fixed)

**Error:**
```
PrismaClientConstructorValidationError: Using engine type "client" requires either "adapter" or "accelerateUrl"
```

**Solution:** Prisma 7 requires the adapter pattern for database connections:

```typescript
// server/src/db.ts
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });
```

**Packages added:**
- `@prisma/adapter-pg`
- `pg`
- `@types/pg`

### 2. Missing Environment Variables (Fixed)

**Error:**
```
TypeError: OAuth2Strategy requires a clientID option
```

**Cause:** Server was looking for `.env` in `server/` but it was in root directory.

**Solution:** Copy `.env` to `server/.env`:
```bash
cp .env server/.env
```

### 3. ES Module Import Hoisting (Fixed)

**Problem:** `dotenv.config()` was called after imports, but ES modules hoist imports before any code runs. Passport.js tried to read `process.env.GOOGLE_CLIENT_ID` before dotenv loaded.

**Solution:** Wrap passport initialization in a function called after dotenv:

```typescript
// server/src/auth/passport.ts
export function initializePassport() {
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID!,
    // ...
  }));
}

// server/src/index.ts
dotenv.config();
import { initializePassport } from './auth/passport.js';
// ... later
initializePassport();
```

### 4. OAuth Callback Redirect (Fixed)

**Problem:** After Google OAuth, the callback redirected to `http://localhost:3001/` (backend) instead of `http://localhost:5173/` (frontend).

**Solution:**
```typescript
// server/src/routes/auth.ts
const FRONTEND_URL = process.env.NODE_ENV === 'production' ? '' : 'http://localhost:5173';

router.get('/google/callback',
  passport.authenticate('google', {
    failureRedirect: `${FRONTEND_URL}/?error=auth_failed`,
  }),
  (req, res) => {
    res.redirect(`${FRONTEND_URL}/`);
  }
);
```

## Outstanding Issue: Vite Proxy Not Working

### Current State

The Vite config appears correct but the proxy doesn't forward requests:

```typescript
// client/vite.config.ts
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
      },
      '/auth': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
      },
    },
  },
});
```

### Attempted Fixes

1. Cleared Vite cache: `rm -rf client/node_modules/.vite`
2. Added `secure: false` to proxy config
3. Restarted both servers multiple times

### Possible Next Steps

1. **Check for config conflicts** - Verify no other config is overriding vite.config.ts
2. **Add proxy debug logging** - Use `configure` option to log proxy requests
3. **Check Vite version** - May be a bug in Vite 5.4.21
4. **Try alternative approach** - Use full URLs in development (`http://localhost:3001/auth/me`)
5. **Verify proxy with /api routes** - Check if `/api` proxy works, isolate if it's `/auth` specific

### Workaround

For now, users can access the backend directly at `http://localhost:3001` in development, though this breaks the normal development flow.

## Files Modified

- `server/src/db.ts` - Prisma 7 adapter setup
- `server/src/auth/passport.ts` - Lazy initialization
- `server/src/index.ts` - Call initializePassport after dotenv
- `server/src/routes/auth.ts` - Frontend URL redirect
- `server/prisma/schema.prisma` - Removed deprecated `url` field
- `client/vite.config.ts` - Added `secure: false` to proxy

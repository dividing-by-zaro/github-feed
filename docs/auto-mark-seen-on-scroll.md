# Auto-Mark FeedGroups as Seen on Scroll + Unread Count Display

This document outlines the implementation plan for automatically marking FeedGroups as seen when they scroll into view, plus adding an unread count display.

## Overview

**Goal**: As users scroll through the feed, items that enter the viewport should automatically be marked as "seen", removing the "New" badge. Additionally, display the count of unread items in the UI.

---

## Current Implementation Analysis

### How FeedGroups and "new" badges work

| Location | Description |
|----------|-------------|
| `client/src/components/FeedGroup.tsx:13` | `isNew?: boolean` prop in `FeedGroupProps` interface |
| `client/src/components/FeedGroup.tsx:36` | Applies `is-new` CSS class when `isNew` is true |
| `client/src/components/FeedGroup.tsx:55` | Renders `<span className="new-badge">New</span>` when `isNew` is true |
| `client/src/components/Feed.tsx:23-26` | `isNew()` function compares item date to `lastSeenAt` |
| `client/src/components/Feed.tsx:113` | Passes `isNew={isNew(item.date)}` to each `FeedGroupComponent` |
| `client/src/components/Feed.css:93-103` | `.new-badge` styling (blue pill, 10px uppercase) |
| `client/src/components/Feed.css:105-107` | `.is-new` styling (blue box-shadow highlight) |

**Key insight**: The "new" determination is purely date-based—any item with a date after `lastSeenAt` is considered new.

### The lastSeenAt tracking mechanism

| Location | Description |
|----------|-------------|
| `server/prisma/schema.prisma:21` | `lastSeenAt DateTime?` field on User model |
| `server/src/routes/user.ts:126-140` | `POST /api/user/mark-seen` sets `lastSeenAt = new Date()` |
| `client/src/api.ts:72-76` | `markAsSeen()` function calls the endpoint |
| `client/src/components/App.tsx:190-197` | `handleMarkAsSeen()` calls API then `refetchUser()` to update local state |
| `client/src/context/AuthContext.tsx:11` | `lastSeenAt: string | null` on User interface |
| `client/src/components/App.tsx:363` | Passes `user.lastSeenAt` down to Feed component |

**Current behavior**: "Mark all as read" button sets `lastSeenAt` to current time, marking ALL items as read in one action.

### Current scroll/viewport behavior

**Finding**: There is NO scroll tracking currently implemented.

| Location | Description |
|----------|-------------|
| `client/src/components/Feed.tsx:47-48` | Renders a simple `<div className="feed">` container |
| `client/src/components/Feed.tsx:49-116` | Maps over items with no scroll/intersection logic |
| `client/src/components/FeedGroup.tsx` | No scroll event handlers or IntersectionObserver |

The feed is a plain scrollable container with no viewport awareness.

---

## Unread Count Display

### Current unread detection logic

| Location | Description |
|----------|-------------|
| `client/src/components/App.tsx:199-207` | `hasNewItems` computed boolean (true if ANY new items exist) |
| `client/src/components/App.tsx:300-304` | Conditionally renders "Mark all as read" button when `hasNewItems` |

### Potential display locations

| Location | Suggestion |
|----------|------------|
| `client/src/components/App.tsx:298` | Header area—add count badge next to "GitHub Feed" title |
| `client/src/components/Sidebar.tsx:28-33` | "All Repos" nav button—add badge showing unread count |
| `client/src/components/App.tsx:301` | Modify "Mark all as read" button to include count |

### Implementation

Change `hasNewItems` to `newItemCount`:

```typescript
// App.tsx - replace hasNewItems with count
const newItemCount = useMemo(() => {
  if (!user?.lastSeenAt) return feedGroups.length + releases.length;
  const lastSeen = new Date(user.lastSeenAt);
  return (
    feedGroups.filter((g) => new Date(g.date) > lastSeen).length +
    releases.filter((r) => new Date(r.date) > lastSeen).length
  );
}, [feedGroups, releases, user?.lastSeenAt]);
```

Display in header:

```tsx
{newItemCount > 0 && (
  <button onClick={handleMarkAsSeen} className="mark-read-btn">
    Mark all as read ({newItemCount})
  </button>
)}
```

---

## API Changes

### Option A: Update lastSeenAt with specific timestamp (recommended)

Modify existing endpoint to accept an optional date:

| Location | Change |
|----------|--------|
| `server/src/routes/user.ts:126-140` | Accept `{ seenUntil?: string }` body parameter |
| `client/src/api.ts:72-76` | Update `markAsSeen(date?: string)` signature |

```typescript
// server/src/routes/user.ts - modify to accept seenUntil
router.post('/mark-seen', async (req, res) => {
  const { seenUntil } = req.body; // optional ISO date string
  const updatedUser = await prisma.user.update({
    where: { id: user.id },
    data: { lastSeenAt: seenUntil ? new Date(seenUntil) : new Date() },
  });
  // ...
});
```

### Option B: Per-item seen tracking (more complex)

Would require a new database table:

```prisma
model SeenFeedGroup {
  id          String   @id @default(cuid())
  feedGroupId String
  userId      String
  user        User     @relation(...)
  @@unique([userId, feedGroupId])
}
```

**Recommendation**: Option A is simpler and maintains the current behavior pattern.

---

## Auto-Mark on Scroll Implementation

### Client-side changes needed

| File | Changes |
|------|---------|
| `client/src/components/Feed.tsx` | Add IntersectionObserver to track visible items |
| `client/src/components/FeedGroup.tsx` | Add `ref` and `data-date` attribute for tracking |
| `client/src/components/App.tsx` | Add `onItemSeen` callback, debounced API update |
| `client/src/api.ts` | Update `markAsSeen()` to accept optional date |

### Proposed data flow

1. **FeedGroup** gets a `ref` and reports its date via `data-date` attribute
2. **Feed** uses IntersectionObserver to detect when items enter viewport
3. **Feed** calls `onItemSeen(date)` callback for each visible "new" item
4. **App** debounces these calls and updates `lastSeenAt` to max visible date
5. Server accepts the specific timestamp to update `lastSeenAt`

### IntersectionObserver implementation in Feed.tsx

```typescript
interface FeedProps {
  // ... existing props
  onItemSeen?: (date: string) => void;  // NEW
}

// In Feed component:
const observerRef = useRef<IntersectionObserver | null>(null);

useEffect(() => {
  observerRef.current = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        const date = entry.target.getAttribute('data-date');
        if (date && isNew(date)) {
          onItemSeen?.(date);
        }
      }
    });
  }, { threshold: 0.5 });

  // Observe all feed items...
}, []);
```

---

## Files to Modify

| File | Purpose |
|------|---------|
| `server/src/routes/user.ts:126-140` | Accept optional `seenUntil` parameter |
| `client/src/api.ts:72-76` | Update `markAsSeen()` signature |
| `client/src/components/Feed.tsx` | Add IntersectionObserver, `onItemSeen` callback |
| `client/src/components/FeedGroup.tsx` | Add `ref` forwarding, `data-date` attribute |
| `client/src/components/App.tsx:199-207` | Change `hasNewItems` to `newItemCount` |
| `client/src/components/App.tsx:300-304` | Display count in button |
| `client/src/components/Sidebar.tsx` | (Optional) Add unread badge |

---

## Notes

- Users can still star items they want to revisit
- The "Mark all as read" button remains for bulk marking
- Debouncing the scroll-based updates prevents excessive API calls
- IntersectionObserver is well-supported in modern browsers

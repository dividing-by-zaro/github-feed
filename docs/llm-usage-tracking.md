# LLM Usage Tracking

Track per-user LLM API calls to show users their usage and calculate costs.

## Current State

The codebase makes OpenAI API calls without capturing usage metrics. All data needed for tracking is available but currently ignored.

## LLM Call Locations

| Method | File | Lines | Purpose |
|--------|------|-------|---------|
| `classifyPR()` | `server/src/services/classifier.ts` | 82-96 | Classifies a single PR |
| `summarizeRelease()` | `server/src/services/classifier.ts` | 158-172 | Summarizes a release |

Both use **gpt-4o-mini** with `temperature: 0.3` and `max_tokens: 500`.

## Triggers (User Attribution Points)

| Trigger | Route | File:Lines | User Available? |
|---------|-------|------------|-----------------|
| Add new repo | `POST /api/repos` | `repos.ts:248-373` | Yes - `getUser(req)` at line 250 |
| Load feed (stale repos) | `GET /api/repos/feed/all` | `repos.ts:598-691` | Yes - `getUser(req)` at line 601 |
| Load older updates | `POST /api/repos/:id/fetch-recent` | `repos.ts:490-595` | Yes - `getUser(req)` at line 493 |

User context (`user.id`) is available at every point where LLM calls are triggered.

## Missing Data (Currently Ignored)

The OpenAI response includes a `usage` field that's completely discarded:

```typescript
// classifier.ts:82-96 - current code
const response = await this.openai.chat.completions.create({...});
const content = response.choices[0]?.message?.content;  // Only content is extracted
// response.usage is discarded!
```

The `response.usage` object contains:

```typescript
{
  prompt_tokens: number,      // Tokens in the input
  completion_tokens: number,  // Tokens in the output
  total_tokens: number        // Sum of both
}
```

## Cost Calculation

**gpt-4o-mini pricing** (as of late 2024):
- Input: **$0.15 per 1M tokens** ($0.00000015/token)
- Output: **$0.60 per 1M tokens** ($0.0000006/token)

Formula:
```
cost = (prompt_tokens × 0.00000015) + (completion_tokens × 0.0000006)
```

## Implementation Plan

### 1. New Database Table

Add to `schema.prisma`:

```prisma
model LLMUsage {
  id               String   @id @default(cuid())
  userId           String
  user             User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  model            String   // e.g., "gpt-4o-mini"
  operation        String   // "classify_pr" | "summarize_release"
  promptTokens     Int
  completionTokens Int
  totalTokens      Int
  costUsd          Float    // Calculated cost

  // Context
  globalRepoId     String?
  globalRepo       GlobalRepo? @relation(fields: [globalRepoId], references: [id], onDelete: SetNull)
  prNumber         Int?
  releaseTag       String?

  createdAt        DateTime @default(now())

  @@index([userId])
  @@index([createdAt])
}
```

Update `User` model to add relation:

```prisma
model User {
  // ... existing fields
  llmUsage       LLMUsage[]
}
```

Update `GlobalRepo` model to add relation:

```prisma
model GlobalRepo {
  // ... existing fields
  llmUsage      LLMUsage[]
}
```

### 2. Modify ClassifierService

Option A: Return usage with result

```typescript
interface ClassificationResult {
  classification: ClassifiedChange | null;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  } | null;
}

async classifyPR(pr: PRData, repoInfo: RepoInfo): Promise<ClassificationResult> {
  // ... existing code ...
  const response = await this.openai.chat.completions.create({...});

  return {
    classification: parsedResult,
    usage: response.usage ? {
      promptTokens: response.usage.prompt_tokens,
      completionTokens: response.usage.completion_tokens,
      totalTokens: response.usage.total_tokens,
    } : null
  };
}
```

Option B: Accept a usage callback

```typescript
type UsageCallback = (usage: { promptTokens: number; completionTokens: number; model: string; operation: string }) => void;

constructor(apiKey: string, onUsage?: UsageCallback) {
  this.openai = new OpenAI({ apiKey });
  this.onUsage = onUsage;
}
```

### 3. Record at Route Level

In route handlers, capture usage and associate with user:

```typescript
router.post('/', async (req: Request, res: Response) => {
  const user = getUser(req);

  const classifier = new ClassifierService(openaiApiKey, async (usage) => {
    await prisma.lLMUsage.create({
      data: {
        userId: user.id,
        model: 'gpt-4o-mini',
        operation: usage.operation,
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        totalTokens: usage.promptTokens + usage.completionTokens,
        costUsd: calculateCost(usage.promptTokens, usage.completionTokens),
        globalRepoId: globalRepo.id,
      }
    });
  });

  // ... rest of handler
});
```

### 4. API Endpoints for Usage Display

```typescript
// Get user's usage summary
GET /api/user/usage
Response: {
  totalCalls: number,
  totalTokens: number,
  totalCostUsd: number,
  byOperation: {
    classify_pr: { calls: number, tokens: number, cost: number },
    summarize_release: { calls: number, tokens: number, cost: number }
  },
  last30Days: { date: string, tokens: number, cost: number }[]
}

// Get detailed usage history
GET /api/user/usage/history?limit=50&offset=0
Response: LLMUsage[]
```

### 5. Frontend Components

- Usage summary card on user profile page
- Usage chart showing cost over time
- Per-repo breakdown of LLM usage

## Edge Cases

| Scenario | Consideration |
|----------|---------------|
| **Shared indexing** | When repo is fresh, no LLM calls are made. User A adds repo → LLM cost. User B adds same repo → zero cost (cached). |
| **Stale refresh** | First user to load feed after 1 hour pays for refresh. Other users benefit for free. |
| **Attribution fairness** | Current model is "first-come-pays" where cached data benefits later users. |

## Alternatives Considered

1. **Amortize cost across subscribers** - Track which users benefit from cached data and split costs. Complex to implement.

2. **Pre-paid token pools** - Users buy tokens upfront. Simpler billing but requires payment integration.

3. **Rate limiting only** - Just limit calls per user without tracking costs. Simpler but less transparent.

## Dependencies

- Requires user profile page (planned feature) for displaying usage
- May tie into Stripe integration (planned feature) for paid plans

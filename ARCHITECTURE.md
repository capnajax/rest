# Architecture

## Metadata-Driven Design

This Filament application uses metadata to control middleware behavior.

### Metadata Interface

See `src/meta/index.ts` for your metadata interface definition.

### How It Works

1. Define default metadata in `src/meta/defaults.ts`
2. Override per-endpoint in route definitions
3. Middleware inspects `req.endpointMeta` to decide behavior

Example:

```typescript
// src/routes/users.ts
app.get('/users', 
  { requiresAuth: true, rateLimit: 50 },
  async (req, res) => {
    res.json({ users: [] });
  }
);

// src/middleware/auth.ts
app.use(async (req, res, next) => {
  if (req.endpointMeta.requiresAuth) {
    // Perform authentication
  }
  await next();
});
```

## Request Lifecycle

1. Incoming request
2. Route matching → `req.endpointMeta` populated
3. Middleware chain executes
4. Route handler executes
5. Response transformers (success)
6. Error handlers (if error)
7. Finalizers (always)
8. Response sent

## Adding Routes

1. Create route file in `src/routes/`
2. Export a mount function
3. Import and call in `src/routes/index.ts`

## Adding Middleware

1. Create middleware file in `src/middleware/`
2. Middleware should check `req.endpointMeta` for configuration
3. Export and register in `src/index.ts`

## Database Integration

Example with Prisma:

```typescript
// src/db/index.ts
import { PrismaClient } from '@prisma/client';
export const db = new PrismaClient();

// src/routes/users.ts
import { db } from '../db';

app.get('/users', PUBLIC, async (req, res) => {
  const users = await db.user.findMany();
  res.json({ users });
});
```

## Testing

Tests use Node's native test runner with test-battery for assertions.

Example:

```typescript
import { describe, it } from 'node:test';
import { expect } from 'test-battery';

describe('Users API', () => {
  it('should list users', async () => {
    // Test implementation
  });
});
```

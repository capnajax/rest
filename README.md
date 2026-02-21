# rest

A Filament API application.

## Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Server running at http://localhost:3000
```

## Available Scripts

- `npm run dev` - Start with hot reload
- `npm test` - Run tests
- `npm run build` - Build for production
- `npm start` - Run production build
- `npm run lint` - Lint code
- `npm run format` - Format code
- `npm run docker:build` - Build Docker image
- `npm run docker:up` - Run with Docker Compose

## Project Structure

```text
rest/
├── src/
│   ├── meta/           # Metadata interface and defaults
│   ├── middleware/     # Middleware functions
│   ├── routes/         # Route definitions
│   ├── handlers/       # Post-request handlers
│   ├── config/         # Application configuration
│   └── index.ts        # Entry point
├── tests/
│   ├── integration/    # Integration tests
│   └── unit/          # Unit tests
├── Dockerfile
├── docker-compose.yml
└── package.json
```

## Endpoints

- `GET /health` - Health check

## Authentication

This project includes JWT and OAuth middleware. See `src/middleware/` for implementation.

Configure in `.env`:

```bash
JWT_SECRET=your-secret-here
REDIS_URL=redis://localhost:6379
```

## API Documentation

OpenAPI documentation available at: [http://localhost:3000/docs](http://localhost:3000/docs)

## Observability

This project includes OpenTelemetry tracing and Prometheus metrics.

Metrics endpoint: [http://localhost:3000/metrics](http://localhost:3000/metrics)

## Database Integration

Filament doesn't include a database ORM by design. Choose what works for you:

### Recommended Options

**Prisma** (TypeScript-first, great DX)

```bash
npm install prisma @prisma/client
npx prisma init
```

**Drizzle** (Lightweight, SQL-like)

```bash
npm install drizzle-orm
```

See [ARCHITECTURE.md](./ARCHITECTURE.md) for integration examples.

## Development

1. Copy `.env.example` to `.env` and configure
2. Run `npm run dev`
3. Make changes - server auto-reloads

## Production

```bash
npm run build
npm start
```

Or with Docker:

```bash
docker build -t rest .
docker run -p 3000:3000 rest
```

## Testing

```bash
npm test
```

## License

ISC

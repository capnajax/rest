# Build stage
FROM node:24-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source
COPY . .

# Build
RUN npm run build

# Runtime stage
FROM node:24-alpine

# Install curl for healthcheck
RUN apk add --no-cache curl

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

USER nodejs

WORKDIR /app

# Copy package files
COPY --chown=nodejs:nodejs package*.json ./

# Install production dependencies only
RUN npm install --omit=dev

# Copy built files
COPY --from=builder /app/dist ./dist

EXPOSE 1661

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -sf http://localhost:3000/health || exit 1

CMD ["node", "--enable-source-maps", "dist/index.js"]

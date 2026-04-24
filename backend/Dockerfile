# Backend Dockerfile - Production multi-stage build
FROM node:18-alpine AS builder

LABEL stage=builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install ALL dependencies (needed for TypeScript build)
RUN npm ci

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Production stage
FROM node:18-alpine

# Security: use existing node user in alpine image
RUN apk add --no-cache tzdata curl

# Set timezone
ENV TZ=Asia/Shanghai

WORKDIR /app

# Copy production deps and build artifacts
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

# Create non-root user (node already exists in node:18-alpine)
RUN addgroup -g 1001 -S appgroup && \
    adduser -S appuser -u 1001 -G appgroup && \
    chown -R appuser:appgroup /app

USER appuser

# Expose port
EXPOSE 4000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:4000/health || exit 1

# Environment
ENV NODE_ENV=production
ENV PORT=4000

# Start
CMD ["node", "dist/app.js"]

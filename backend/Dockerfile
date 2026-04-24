# ===== Backend Dockerfile - Optimized Multi-Stage Build =====
# Stage 1: Build dependencies and compile TypeScript
FROM node:20-alpine AS builder

LABEL stage=builder

WORKDIR /app

# Copy package files for layer caching
COPY package*.json ./

# Install ALL dependencies (devDependencies needed for TypeScript build)
RUN npm ci --no-audit --no-fund

# Copy source code (including shared module)
COPY . .

# Build TypeScript
RUN npm run build

# Stage 2: Production runtime
FROM node:20-alpine

# Install runtime system dependencies
RUN apk add --no-cache tzdata curl

# Set timezone
ENV TZ=Asia/Shanghai

WORKDIR /app

# Copy production dependencies
COPY package*.json ./
COPY --from=builder /app/dist ./dist

# Install ONLY production dependencies (smaller final image)
RUN npm ci --omit=dev --no-audit --no-fund && \
    npm cache clean --force 2>/dev/null || true

# Create non-root user
RUN addgroup -g 1001 -S appgroup && \
    adduser -S appuser -u 1001 -G appgroup && \
    chown -R appuser:appgroup /app && \
    chmod -R 755 /app

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

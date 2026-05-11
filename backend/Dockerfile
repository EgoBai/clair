# ===== Backend Dockerfile - tsx 直接运行 TypeScript =====
FROM node:20-alpine

# Install runtime dependencies
RUN apk add --no-cache tzdata curl

# Set timezone
ENV TZ=Asia/Shanghai

WORKDIR /app

# Copy all source
COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund
RUN npm install tsx --no-save

COPY . .

# Create non-root user
RUN addgroup -g 1001 -S appgroup && \
    adduser -S appuser -u 1001 -G appgroup && \
    chown -R appuser:appgroup /app && \
    chmod -R 755 /app

USER appuser

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:4000/health || exit 1

ENV NODE_ENV=production
ENV PORT=4000

CMD ["npx", "tsx", "src/index.ts"]

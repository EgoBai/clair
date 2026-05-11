FROM node:20-alpine

RUN apk add --no-cache tzdata curl
ENV TZ=Asia/Shanghai

WORKDIR /app

# Copy and install ALL deps
COPY package*.json ./
RUN npm ci --no-audit --no-fund

COPY . .

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

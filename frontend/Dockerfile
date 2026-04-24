# ===== Frontend Dockerfile - Optimized Multi-Stage Build =====
# Stage 1: Build dependencies and compile
FROM node:20-alpine AS builder

LABEL stage=builder

WORKDIR /app

# Copy package files first for better layer caching
COPY package*.json ./

# Install ALL dependencies (includes devDependencies for TypeScript build)
RUN npm ci --no-audit --no-fund

# Copy source code
COPY . .

# Build the application (TypeScript + Vite)
RUN npm run build

# Stage 2: Production Nginx server
FROM nginx:1.25-alpine

# Security: remove default nginx config and unnecessary packages
RUN rm -rf /etc/nginx/conf.d/default.conf && \
    apk del --purge apk-tools 2>/dev/null || true

# Create non-root user if nginx user doesn't exist
RUN addgroup -g 1001 -S appgroup && \
    adduser -S appuser -u 1001 -G appgroup && \
    chown -R appuser:appgroup /usr/share/nginx/html 2>/dev/null || true

# Copy nginx configuration
COPY nginx.conf /etc/nginx/nginx.conf

# Copy build artifacts from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Set proper permissions
RUN chown -R appuser:appgroup /usr/share/nginx/html && \
    chmod -R 755 /usr/share/nginx/html

USER appuser

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/ || exit 1

# Start nginx
CMD ["nginx", "-g", "daemon off;"]

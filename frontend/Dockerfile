# Frontend Dockerfile - Production multi-stage build
FROM node:18-alpine AS builder

LABEL stage=builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build the app
RUN npm run build

# Production stage with nginx
FROM nginx:alpine

# Security: remove default nginx config
RUN rm -rf /etc/nginx/conf.d/default.conf

# Copy nginx config
COPY nginx.conf /etc/nginx/nginx.conf

# Copy build artifacts
COPY --from=builder /app/dist /usr/share/nginx/html

# Create non-root user (nginx user already exists in nginx:alpine)
RUN chown -R nginx:nginx /usr/share/nginx/html

USER nginx

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/ || exit 1

# Start nginx
CMD ["nginx", "-g", "daemon off;"]

# Multi-stage Docker build for AF-TMS

# Stage 1: Build frontend
FROM node:18-alpine AS frontend-builder

WORKDIR /app/frontend

# Copy frontend package files
COPY frontend/package*.json ./
RUN npm ci --only=production

# Copy frontend source and build
COPY frontend/ ./
RUN npm run build

# Stage 2: Build backend and final image
FROM node:18-alpine AS backend

WORKDIR /app

# Install system dependencies
RUN apk add --no-cache \
    postgresql-client \
    curl \
    && rm -rf /var/cache/apk/*

# Copy backend package files
COPY package*.json ./
RUN npm ci --only=production

# Copy backend source
COPY backend/ ./backend/
COPY server.js ./
COPY env.example ./.env.example

# Copy built frontend from previous stage
COPY --from=frontend-builder /app/frontend/build ./frontend/build

# Create logs directory
RUN mkdir -p logs

# Create non-root user
RUN addgroup -g 1001 -S af-tms && \
    adduser -S af-tms -u 1001 -G af-tms

# Change ownership
RUN chown -R af-tms:af-tms /app

# Switch to non-root user
USER af-tms

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:${PORT:-5000}/api/health || exit 1

# Expose port
EXPOSE 5000

# Start command
CMD ["npm", "start"]

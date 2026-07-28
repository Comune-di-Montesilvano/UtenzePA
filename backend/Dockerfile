# Multi-stage Dockerfile for NestJS applications
# This Dockerfile uses a conservative caching strategy to prevent stale dependencies
# while still benefiting from Docker's layer caching for faster builds.
#
# Stages:
#   - base: Base image with Node.js
#   - deps: Install production dependencies only
#   - build: Build the TypeScript application
#   - production: Final production image (minimal size)
#   - development: Development image with hot-reload support

ARG NODE_VERSION=24.8.0
ARG NPM_VERSION=11.6.2

# Limite memoria per Node.js (utile per macchine con poca RAM)

################################################################################
# Use node image for base image for all stages.
FROM node:${NODE_VERSION}-alpine AS base


# Update npm to match host version for consistency
# This prevents package-lock.json discrepancies between dev and Docker
RUN npm install -g npm@${NPM_VERSION}

# Set working directory for all build stages.
WORKDIR /usr/src/app


################################################################################
# Create a stage for installing ALL dependencies (for building).
FROM base AS deps

# Copy only package files first for better layer caching
COPY --chown=node:node package*.json ./

# Install ALL dependencies (needed for building)
# Using npm install instead of npm ci to handle lock file sync issues
# Docker's layer caching still provides fast builds when dependencies don't change
# Skip scripts to avoid Husky installation in Docker (not needed in container)
RUN npm install --ignore-scripts

################################################################################
# Create a stage for building the application.
FROM base AS build

# Copy dependencies from deps stage (includes devDependencies)
COPY --chown=node:node --from=deps /usr/src/app/node_modules ./node_modules

# Copy source files
COPY --chown=node:node package*.json ./
COPY --chown=node:node tsconfig*.json ./
COPY --chown=node:node nest-cli.json ./
COPY --chown=node:node src ./src

# Build the application
RUN npm run build

################################################################################
# Create a stage for production dependencies only
FROM base AS prod-deps

# Copy package files
COPY --chown=node:node package*.json ./

# Install ONLY production dependencies
# Install normalmente, il prepare script fallirà ma npm continuerà
RUN npm install --omit=dev || true && \
    npm cache clean --force && \
    rm -rf node_modules/.cache && \
    find node_modules -name '*.md' -delete && \
    find node_modules -name '*.ts' -not -name '*.d.ts' -delete && \
    find node_modules -name '*.map' -delete

################################################################################
# Production stage - use regular Node alpine instead of distroless
# to ensure bcrypt native bindings work correctly
FROM node:${NODE_VERSION}-alpine AS production

# Build metadata arguments (set during build time)
ARG BUILD_DATE
ARG VCS_REF


# Labels for image metadata (helps identify build version)
LABEL org.opencontainers.image.created="${BUILD_DATE}" \
      org.opencontainers.image.revision="${VCS_REF}" \
      org.opencontainers.image.title="NestJS Application" \
      org.opencontainers.image.description="Production-ready NestJS application"

# Use production node environment by default.
ENV NODE_ENV=production \
    BUILD_DATE=${BUILD_DATE} \
    VCS_REF=${VCS_REF}

# Create a non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S nestjs -u 1001 -G nodejs

# Set working directory
WORKDIR /usr/src/app

# Copy package.json for runtime metadata
COPY --chown=nestjs:nodejs package.json .

# Copy ONLY production dependencies from prod-deps stage
COPY --chown=nestjs:nodejs --from=prod-deps /usr/src/app/node_modules ./node_modules

# Copy the built application from the build stage
COPY --chown=nestjs:nodejs --from=build /usr/src/app/dist ./dist

# Copy data folder for database import
COPY --chown=nestjs:nodejs data ./data

# Switch to non-root user
USER nestjs

# Expose the port that the application listens on.
EXPOSE 3000

# Run the application
CMD ["node", "dist/main.js"]

################################################################################
# DEVELOPMENT STAGE
FROM node:${NODE_VERSION}-alpine AS development

# Create a non-root user for running the application
RUN addgroup -g 1001 -S nodejs && adduser -S nestjs -u 1001 -G nodejs

WORKDIR /usr/src/app

# Copy package files first for better caching
COPY --chown=nestjs:nodejs package*.json ./

# Install all dependencies (including dev)
# Using npm install to handle lock file sync issues in development
RUN npm install

# Copy source files
COPY --chown=nestjs:nodejs . .

# Install curl for healthcheck
RUN apk add --no-cache curl

# Switch to non-root user
USER nestjs

# Healthcheck for development stage
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 CMD curl -f http://localhost:3000/api/v1/health/liveness || exit 1

CMD ["npm", "run", "start:dev"]

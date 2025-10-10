# Single-stage build for apps/web (Astro application)
FROM ubuntu:22.04

# Install Node.js 22 and other dependencies
RUN apt-get update && \
    apt-get install -y curl && \
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && \
    apt-get install -y nodejs && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Install pnpm globally
RUN corepack enable pnpm

# Set working directory
WORKDIR /app

# Accept NPM token as build argument (optional)
ARG NPM_TASKFORCESH_TOKEN
ENV NPM_TASKFORCESH_TOKEN=${NPM_TASKFORCESH_TOKEN}

# Accept PUBLIC environment variables as build arguments
ARG PUBLIC_BACKEND_URL
ARG PUBLIC_SYNC_ENGINE_URL
ENV PUBLIC_BACKEND_URL=${PUBLIC_BACKEND_URL}
ENV PUBLIC_SYNC_ENGINE_URL=${PUBLIC_SYNC_ENGINE_URL}

# Copy workspace files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY tsconfig.base.json tsconfig.json ./

# Copy all source code
COPY . .

# Make start script executable
RUN chmod +x ./apps/web/start.sh

# Install dependencies
RUN pnpm install --frozen-lockfile

# Build the web application
RUN NODE_OPTIONS=--max-old-space-size=4096 pnpm run --filter @workspace/web build

# Install vector
RUN bash -c "$(curl -L https://setup.vector.dev)" && \
    apt-get install -y vector && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Create directories for vector logs
RUN mkdir -p ./vector/data ./vector/logs

# Expose port
EXPOSE 8080

# Run database migrations and start the application
CMD ["sh", "-c", "pnpm drizzle-kit migrate && bash ./apps/web/start.sh"]

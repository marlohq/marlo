# Marlo

An AI-powered email client that helps you manage your inbox intelligently.

## Contributing

Want to contribute? Check out our [Contributing Guide](CONTRIBUTING.md) for setup instructions and development workflows.

## Deployment

This project supports production deployment using Docker and Docker Compose.

### Prerequisites

- Docker and Docker Compose installed on your deployment server
- Environment variables configured (see [Environment Configuration](#environment-configuration) below)

### Production Deployment

1. **Build and start all services:**

```shell
docker-compose -f docker-compose.prod.yml up --build -d
```

2. **View logs:**

```shell
docker-compose -f docker-compose.prod.yml logs -f
```

3. **Stop all services:**

```shell
docker-compose -f docker-compose.prod.yml down
```

### Service Architecture

The production deployment includes:

- **postgres**: PostgreSQL 16 database with persistent storage
- **redis**: Redis cache with persistent storage
- **web**: Main Astro application (port 3000)
- **sync**: WebSocket synchronization service (port 3001)
- **mail-ingester**: Email processing service (port 3002)

All services include health checks and proper dependency management. The web service will automatically run database migrations on startup.

### Environment Configuration

Each service requires different environment variables. The following breakdown shows what each service needs:

#### Web Service (`apps/web`)

**OAuth and Authentication:**

- `OAUTH_ENCRYPTION_KEY` - Encryption key for OAuth tokens
- `AUTH_SECRET` - Secret for authentication sessions
- `SYNC_AUTH_SECRET` - Secret for sync service authentication

**Google Services:**

- `GOOGLE_CLIENT_ID` - Google OAuth client ID
- `GOOGLE_CLIENT_SECRET` - Google OAuth client secret
- `GOOGLE_GMAIL_TOPIC` - Google Pub/Sub topic for Gmail notifications
- `GOOGLE_GENERATIVE_AI_API_KEY` - Google Generative AI API key

**Stripe Payment Processing:**

- `STRIPE_SECRET_KEY` - Stripe API secret key (optional, Stripe features disabled if omitted)
- `STRIPE_SIGNING_SECRET` - Stripe webhook signing secret (required if Stripe enabled)
- `STRIPE_DEFAULT_PRICE_ID` - Default Stripe price ID for subscriptions (required if Stripe enabled)

**Storage (S3):**

- `BUCKET_NAME` - S3 bucket name
- `AWS_ACCESS_KEY_ID` - AWS access key for S3 bucket access
- `AWS_SECRET_ACCESS_KEY` - AWS secret key for S3 bucket access

**Monitoring and Logging:**

- `SENTRY_DSN` - Sentry DSN for server-side error tracking (optional, disables if omitted)
- `SENTRY_CLIENT_DSN` - Sentry DSN for client-side error tracking (optional, disables if omitted)
- `AXIOM_TOKEN_WEB` - Axiom token for web service logging
- `AXIOM_DATASET` - Axiom dataset name (optional, defaults to `marlo-web`)

**Desktop App:**

- `GH_FETCH_RELEASE_TOKEN` - GitHub token for fetching desktop app releases (optional)

**Service URLs:**

- `PUBLIC_BACKEND_URL` - Backend URL (e.g., https://marlo.example.com)
- `PUBLIC_SYNC_ENGINE_URL` - Sync engine WebSocket URL (e.g., wss://marlo-sync.example.com)

**Build Configuration:**

- `NPM_TASKFORCESH_TOKEN` - NPM token for BullMQ Pro access (optional)

#### Sync Service (`apps/sync`)

- `SYNC_AUTH_SECRET` - Secret for authenticating with sync service
- `DIRECT_DATABASE_URL` - Direct PostgreSQL connection string for listening to notifications
- `SENTRY_DSN` - Sentry DSN for error tracking (optional, disables if omitted)
- `AXIOM_TOKEN_SYNC` - Axiom token for sync service logging
- `AXIOM_DATASET` - Axiom dataset name (optional, defaults to `marlo-sync`)
- `NPM_TASKFORCESH_TOKEN` - NPM token for BullMQ Pro access (optional)

#### Mail Ingester Service (`apps/mail-ingester`)

- `BULL_BOARD_USERNAME` - Username for Bull Board dashboard authentication (optional)
- `BULL_BOARD_PASSWORD` - Password for Bull Board dashboard authentication (optional)
- `GOOGLE_SERVICE_ACCOUNT` - Google service account credentials JSON
- `OAUTH_ENCRYPTION_KEY` - Encryption key for OAuth tokens
- `SENTRY_DSN` - Sentry DSN for error tracking (optional, disables if omitted)
- `BUCKET_NAME` - S3 bucket name
- `AWS_ACCESS_KEY_ID` - AWS access key for S3 bucket access
- `AWS_SECRET_ACCESS_KEY` - AWS secret key for S3 bucket access
- `AXIOM_TOKEN_INGEST` - Axiom token for mail ingester logging
- `AXIOM_DATASET` - Axiom dataset name (optional, defaults to `marlo-ingest`)
- `NPM_TASKFORCESH_TOKEN` - NPM token for BullMQ Pro access (optional)

#### Infrastructure (All Services)

- `DATABASE_URL` - PostgreSQL connection string
- `REDIS_URL` - Redis connection string
- `AXIOM_ENABLED` - Enable Vector logging for Axiom (set to "true" to enable, defaults to false)

### Managing Environment Variables

For production deployments, configure these environment variables through your deployment platform or use a secrets management tool.

For local development, see the [Contributing Guide](CONTRIBUTING.md) for setup instructions.

## Google Cloud Setup

Marlo requires a Google Cloud project to access Gmail and Google Contacts APIs. Follow these steps to configure your project:

### 1. Create a Google Cloud Project

If you don't already have one, create a new project in the [Google Cloud Console](https://console.cloud.google.com/).

### 2. Enable Required APIs

Enable the following APIs in your project:

- Gmail API
- Cloud Pub/Sub API
- Google OAuth2 API

### 3. Create OAuth 2.0 Credentials

1. Navigate to **APIs & Services > Credentials** in the Google Cloud Console
2. Click **Create Credentials > OAuth client ID**
3. Choose **Web application** as the application type
4. Configure the OAuth consent screen if prompted
5. Add authorized redirect URIs (e.g., `https://yourdomain.com/auth/google/callback`)
6. Save and copy your **Client ID** and **Client Secret**

Set these values as environment variables:

- `GOOGLE_CLIENT_ID` - Your OAuth client ID
- `GOOGLE_CLIENT_SECRET` - Your OAuth client secret

### 4. Configure OAuth Scopes

When users authenticate, Marlo requests the following OAuth scopes:

- `openid` - OpenID Connect authentication
- `profile` - Basic profile information
- `email` - User's email address
- `https://www.googleapis.com/auth/gmail.readonly` - Read Gmail messages
- `https://www.googleapis.com/auth/gmail.modify` - Modify Gmail messages (labels, etc.)
- `https://www.googleapis.com/auth/gmail.compose` - Create draft messages
- `https://www.googleapis.com/auth/gmail.send` - Send emails
- `https://www.googleapis.com/auth/pubsub` - Subscribe to Gmail push notifications
- `https://www.googleapis.com/auth/contacts.readonly` - Read contacts

These scopes are configured automatically by Marlo, but you should be aware of them when setting up your OAuth consent screen.

### 5. Create a Service Account

Marlo uses a service account email to verify webhook authenticity:

1. Navigate to **APIs & Services > Credentials**
2. Click **Create Credentials > Service account**
3. Name your service account (e.g., `marlo-ingest`) and create it
4. Grant it appropriate permissions (if needed for your organization)
5. Copy the service account email (format: `name@project-id.iam.gserviceaccount.com`)

Set the service account email as the `GOOGLE_SERVICE_ACCOUNT` environment variable.

### 6. Create a Pub/Sub Topic

Marlo uses Google Cloud Pub/Sub to receive real-time Gmail notifications:

1. Navigate to **Pub/Sub > Topics** in the Google Cloud Console
2. Click **Create Topic**
3. Name your topic (e.g., `gmail-notifications`)
4. Note the full topic name (format: `projects/YOUR_PROJECT_ID/topics/TOPIC_NAME`)
5. Grant Gmail API permission to publish to this topic by adding `gmail-api-push@system.gserviceaccount.com` as a principal with the **Pub/Sub Publisher** role

Set the full topic name as the `GOOGLE_GMAIL_TOPIC` environment variable.

### 7. Get a Generative AI API Key

Marlo uses Google's Generative AI for AI-powered features:

1. Visit the [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Create a new API key
3. Copy the API key

Set this as the `GOOGLE_GENERATIVE_AI_API_KEY` environment variable.

## License

See [LICENSE.md](LICENSE.md).

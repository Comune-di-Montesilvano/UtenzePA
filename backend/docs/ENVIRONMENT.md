# Environment Variables Documentation

This NestJS Template uses a **two-tier configuration system**:
1. **`.env` file**: Infrastructure and Docker configuration
2. **`src/config/*.yml` files**: Application secrets and business configuration

## Configuration Architecture

### Tier 1: Environment Variables (.env)
- Docker port mappings
- Sentry monitoring configuration
- Deployment metadata
- Infrastructure settings

### Tier 2: YAML Configuration (src/config/*.yml)
- Database connections
- JWT secrets
- API keys
- Business logic configuration
- Feature flags

## Table of Contents
- [Environment Variables (.env)](#environment-variables-env)
- [YAML Configuration](#yaml-configuration)
- [Environment-Specific Configurations](#environment-specific-configurations)
- [Security Best Practices](#security-best-practices)

## Environment Variables (.env)

These variables control Docker and infrastructure configuration.

### Core Variables

| Variable | Description | Default | Example |
|----------|-------------|---------|---------|
| `NODE_ENV` | Application environment | `development` | `development`, `staging`, `production` |
| `PORT` | Server port | `3000` | `3000`, `8080` |
| `PROJECT_NAME` | Project identifier for monitoring | - | `nestjs-template` |
| `TYPE` | Application type for Sentry | - | `api`, `worker`, `cron` |
| `VERSION` | Application version | `1.0.0` | `1.2.3` |

### Database

#### MongoDB (if using MongoDB)
| Variable | Description | Default | Example |
|----------|-------------|---------|---------|
| `MONGO_URI` | MongoDB connection string | - | `mongodb://localhost:27017/mydb` |

#### PostgreSQL (if using PostgreSQL)
| Variable | Description | Default | Example |
|----------|-------------|---------|---------|
| `DB_HOST` | Database host | `localhost` | `db.example.com` |
| `DB_PORT` | Database port | `5432` | `5432` |
| `DB_USER` | Database user | - | `postgres` |
| `DB_PASSWORD` | Database password | - | `secretpassword` |
| `DB_NAME` | Database name | - | `nestjs_db` |

### Security

| Variable | Description | Default | Example |
|----------|-------------|---------|---------|
| `DOCKER_MONGO_PORT` | MongoDB Docker port | `27017` | `27017` |
| `DOCKER_API_PORT` | API Docker port | `3000` | `3000` |
| `SENTRY_DNS` | Sentry DSN | - | `https://key@sentry.io/project` |

## YAML Configuration

Application secrets and business configuration are managed in `src/config/*.yml` files.

### Configuration Files

| File | Purpose | Environment |
|------|---------|-------------|
| `default.yml` | Base configuration | Development |
| `production.yml` | Production overrides | Production |
| `staging.yml` | Staging overrides | Staging |

### Key Configuration Sections

#### Authentication (auth)
| Configuration | Description | Example |
|--------------|-------------|---------|

These variables enhance functionality but are not required for basic operation.

### Monitoring & Logging

| Variable | Description | Default | Example |
|----------|-------------|---------|---------|
| `SENTRY_DNS` | Sentry DSN for error tracking | - | `https://key@sentry.io/project` |
| `LOG_LEVEL` | Logging verbosity | `info` | `error`, `warn`, `info`, `debug` |

### Email Service

| Variable | Description | Default | Example |
|----------|-------------|---------|---------|
| `MAIL_HOST` | SMTP server host | - | `smtp.gmail.com` |
| `MAIL_PORT` | SMTP server port | `587` | `587`, `465` |
| `MAIL_USER` | SMTP username | - | `user@example.com` |
| `MAIL_PASSWORD` | SMTP password | - | App-specific password |
| `MAIL_FROM` | Default sender | - | `"NoReply" <noreply@example.com>` |

### Redis (for Bull Queues)

| Variable | Description | Default | Example |
|----------|-------------|---------|---------|
| `REDIS_HOST` | Redis server host | `localhost` | `redis.example.com` |
| `REDIS_PORT` | Redis server port | `6379` | `6379` |
| `REDIS_PASSWORD` | Redis password | - | `redispassword` |

### AWS Services

| Variable | Description | Default | Example |
|----------|-------------|---------|---------|
| `AWS_REGION` | AWS region | `eu-west-1` | `us-east-1` |
| `AWS_ACCESS_KEY_ID` | AWS access key | - | `AKIA...` |
| `AWS_SECRET_ACCESS_KEY` | AWS secret | - | Secret key |
| `S3_BUCKET_NAME` | S3 bucket name | - | `my-bucket` |

### Elasticsearch

| Variable | Description | Default | Example |
|----------|-------------|---------|---------|
| `ELASTIC_NODE` | Elasticsearch URL | `http://localhost:9200` | `https://elastic.example.com` |
| `ELASTIC_USERNAME` | Elasticsearch username | - | `elastic` |
| `ELASTIC_PASSWORD` | Elasticsearch password | - | Password |

### Feature Flags

| Variable | Description | Default | Example |
|----------|-------------|---------|---------|
| `ENABLE_SWAGGER` | Enable Swagger docs | `true` | `true`, `false` |
| `ENABLE_CORS` | Enable CORS | `true` | `true`, `false` |
| `ENABLE_RATE_LIMITING` | Enable rate limiting | `true` | `true`, `false` |
| `ENABLE_CACHE` | Enable caching | `true` | `true`, `false` |

### Rate Limiting

| Variable | Description | Default | Example |
|----------|-------------|---------|---------|
| `THROTTLE_TTL` | Time window in seconds | `60` | `60` |
| `THROTTLE_LIMIT` | Max requests per TTL | `10` | `10`, `100` |

### Performance

| Variable | Description | Default | Example |
|----------|-------------|---------|---------|
| `NODE_OPTIONS` | Node.js runtime options | - | `--max-old-space-size=4096` |
| `CACHE_TTL` | Cache time-to-live (seconds) | `300` | `300`, `3600` |
| `CACHE_MAX_ITEMS` | Max cached items | `100` | `100`, `1000` |

### Deployment Information

| Variable | Description | Default | Example |
|----------|-------------|---------|---------|
| `DEPLOYMENT_METHOD` | How app was deployed | `manual` | `ci`, `manual`, `k8s` |
| `DEPLOYED_BY` | Who deployed the app | `developer` | `jenkins`, `github-actions` |
| `IMAGE_NAME` | Docker image name | - | `nestjs-app` |
| `TAG` | Docker image tag | `latest` | `v1.0.0`, `latest` |

## Environment-Specific Configurations

### Development Environment
```bash
NODE_ENV=development
DEBUG=true
LOG_LEVEL=debug
ENABLE_SWAGGER=true
```

### Staging Environment
```bash
NODE_ENV=staging
DEBUG=false
LOG_LEVEL=info
ENABLE_SWAGGER=true
```

### Production Environment
```bash
NODE_ENV=production
DEBUG=false
LOG_LEVEL=warn
ENABLE_SWAGGER=false
```

## Configuration Files

The application supports different configuration files based on the environment:

- `src/config/default.yml` - Default configuration
- `src/config/production.yml` - Production overrides
- `src/config/staging.yml` - Staging overrides

## Security Best Practices

### 1. Never Commit Secrets
- Never commit `.env` files containing real secrets
- Use `.env.example` as a template
- Add `.env` to `.gitignore`

### 2. Use Strong Secrets
```bash
# Generate a secure JWT secret
openssl rand -base64 32

# Generate a secure random password
openssl rand -base64 24
```

### 3. Rotate Credentials Regularly
- Change passwords and API keys periodically
- Use different credentials for each environment
- Implement secret rotation in production

### 4. Use Secret Management Services
For production, consider using:
- AWS Secrets Manager
- HashiCorp Vault
- Azure Key Vault
- Google Secret Manager
- Kubernetes Secrets

### 5. Principle of Least Privilege
- Use read-only database utilizerGrants where possible
- Limit AWS IAM permissions
- Restrict API keys to specific operations

## Docker Environment Variables

When using Docker, you can pass environment variables through:

1. **Docker Compose** (docker-compose.yml):
```yaml
services:
  api:
    environment:
      - NODE_ENV=production
      - PORT=3000
```

2. **Docker Run**:
```bash
docker run -e NODE_ENV=production -e PORT=3000 myapp
```

3. **ENV File**:
```bash
docker run --env-file .env myapp
```

## Validation

The application validates required environment variables on startup. Missing required variables will prevent the application from starting.

## Troubleshooting

### Common Issues

1. **Application won't start**
   - Check all required variables are set
   - Verify database connection strings
   - Check for typos in variable names

2. **Authentication failures**
   - Verify JWT_SECRET is set and consistent
   - Check JWT_EXPIRES_IN format

3. **Email not sending**
   - Verify SMTP credentials
   - Check firewall rules for SMTP ports
   - Use app-specific passwords for Gmail

4. **Database connection errors**
   - Verify connection string format
   - Check network connectivity
   - Ensure database server is running

## Support

For issues or questions about environment configuration, please refer to the main README or create an issue in the repository.

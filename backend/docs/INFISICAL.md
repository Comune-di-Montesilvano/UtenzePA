# Infisical Integration Guide

This document provides comprehensive instructions for setting up and using Infisical as a secrets management solution in this NestJS project.

## Table of Contents

1. [Overview](#overview)
2. [Why Infisical?](#why-infisical)
3. [Prerequisites](#prerequisites)
4. [Initial Setup](#initial-setup)
5. [Configuration](#configuration)
6. [Usage](#usage)
7. [Docker Integration](#docker-integration)
8. [Migration from .env Files](#migration-from-env-files)
9. [Best Practices](#best-practices)
10. [Troubleshooting](#troubleshooting)

## Overview

Infisical is a secrets management platform that allows you to securely store, manage, and sync environment variables and secrets across your team and infrastructure. This project uses the `@infisical/sdk` to fetch secrets at runtime instead of relying on `.env` files.

## Why Infisical?

- **Centralized Secret Management**: All secrets are stored in one secure location
- **Team Collaboration**: Share secrets securely with your team
- **Environment-specific Secrets**: Easily manage secrets for dev, staging, and production
- **Audit Logging**: Track who accessed or modified secrets
- **No More .env Files**: Eliminate the risk of committing secrets to version control
- **Secret Rotation**: Easily rotate secrets without code changes

## Prerequisites

1. **Infisical Account**: Sign up at [https://app.infisical.com](https://app.infisical.com) or use a self-hosted instance
2. **Node.js**: Version 24.x or higher
3. **npm**: Version 11.x or higher

## Initial Setup

### Step 1: Create an Infisical Project

1. Log in to your Infisical dashboard
2. Create a new project (or use an existing one)
3. Note your **Project ID** (you'll need this later)

### Step 2: Create a Machine Identity

Machine Identities are used for programmatic access to Infisical secrets.

1. Go to **Project Settings** → **Machine Identities**
2. Click **Create Machine Identity**
3. Give it a name (e.g., "NestJS Template - Development")
4. Select the appropriate environment(s) (development, staging, production)
5. Set permissions (read access is sufficient)
6. Save the **Client ID** and **Client Secret** (you won't see them again!)

### Step 3: Configure Your Project

1. Copy the example Infisical configuration file:
   ```bash
   cp .env.infisical.example .env.infisical
   ```

2. Edit `.env.infisical` with your credentials:
   ```env
   INFISICAL_CLIENT_ID=your-client-id-here
   INFISICAL_CLIENT_SECRET=your-client-secret-here
   INFISICAL_PROJECT_ID=your-project-id-here
   INFISICAL_ENVIRONMENT=development
   INFISICAL_SITE_URL=https://app.infisical.com
   NODE_ENV=development
   ```

3. (Optional) Copy and configure `.infisical.json`:
   ```bash
   cp .infisical.json.example .infisical.json
   ```

### Step 4: Add Secrets to Infisical

Go to your Infisical project dashboard and add all the secrets your application needs. These should match the keys previously in your `.env` file:

**Example secrets to add:**
- `PORT`
- `MONGO_URI`
- `REDIS_HOST`
- `REDIS_PORT`
- `SENTRY_DNS`
- `LOG_LEVEL`
- etc.

## How It Works

### Initialization Process

Il servizio Infisical utilizza un meccanismo di **eager loading** per garantire che i segreti siano disponibili prima dell'avvio dell'applicazione:

1. **Constructor Initialization**: L'inizializzazione parte immediatamente nel constructor del servizio
2. **Promise-based Loading**: Una Promise (`initPromise`) traccia lo stato del caricamento
3. **OnModuleInit Hook**: NestJS attende il completamento tramite `onModuleInit()`
4. **Synchronous Access**: Dopo l'inizializzazione, i segreti sono accessibili in modo sincrono

### Authentication Method

Il servizio utilizza **Universal Auth** (Machine Identity) di Infisical:

```typescript
const client = await sdk.auth().universalAuth.login({
  clientId: process.env.INFISICAL_CLIENT_ID,
  clientSecret: process.env.INFISICAL_CLIENT_SECRET,
});
```

Questo metodo è ideale per:
- Applicazioni server-side
- Container Docker
- CI/CD pipelines
- Servizi automatizzati

## Configuration

### Environment Variables Required

The following environment variables are **required** for Infisical to work:

| Variable | Description | Example |
|----------|-------------|---------|
| `INFISICAL_CLIENT_ID` | Machine Identity Client ID | `abc123...` |
| `INFISICAL_CLIENT_SECRET` | Machine Identity Client Secret | `xyz789...` |
| `INFISICAL_PROJECT_ID` | Your Infisical Project ID | `project_id_here` |
| `INFISICAL_ENVIRONMENT` | Environment to fetch secrets from | `development`, `staging`, `production` |
| `INFISICAL_SITE_URL` | Infisical instance URL | `https://app.infisical.com` (default) |
| `NODE_ENV` | Node environment | `development`, `production` |

### Self-Hosted Infisical

If you're using a self-hosted Infisical instance, update the `INFISICAL_SITE_URL`:

```env
INFISICAL_SITE_URL=https://infisical.your-domain.com
```

## Usage

### Using InfisicalConfigService in Your Code

The `InfisicalConfigService` is available globally throughout your application.

#### Basic Usage

```typescript
import { Injectable } from '@nestjs/common';
import { InfisicalConfigService } from 'src/core/infisical';

@Injectable()
export class MyService {
  constructor(private readonly configService: InfisicalConfigService) {}

  someMethod() {
    // Get a configuration value
    const port = this.configService.get<number>('PORT');
    
    // Get with default value
    const logLevel = this.configService.get<string>('LOG_LEVEL', 'info');
    
    // Get required value (throws error if not found)
    const mongoUri = this.configService.getOrThrow<string>('MONGO_URI');
  }
}
```

#### Advanced Usage

```typescript
// Get all secrets
const allSecrets = this.configService.getAll();

// Check if Infisical is properly initialized
const isInfisicalEnabled = this.configService.isInfisicalEnabled();

// Get boolean values (automatically parsed)
const isEnabled = this.configService.get<boolean>('FEATURE_ENABLED'); // "true" → true

// Get number values (automatically parsed)
const timeout = this.configService.get<number>('TIMEOUT'); // "5000" → 5000

// Get JSON values (automatically parsed)
const config = this.configService.get<object>('COMPLEX_CONFIG'); // JSON string → object
```

#### Using in Async Factories

Per moduli che richiedono configurazione asincrona, usa `waitForInit()`:

```typescript
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { InfisicalConfigService } from 'src/core/infisical';

@Module({
  imports: [
    MongooseModule.forRootAsync({
      inject: [InfisicalConfigService],
      useFactory: async (configService: InfisicalConfigService) => {
        // Attendi che Infisical completi il caricamento
        await configService.waitForInit();
        
        return {
          uri: configService.getOrThrow<string>('MONGODB_URI'),
          // altre opzioni...
        };
      },
    }),
  ],
})
export class DatabaseModule {}
```

**Quando usare `waitForInit()`:**
- ✅ In async factory functions (`useFactory`)
- ✅ Prima di accedere a segreti critici durante il bootstrap
- ✅ In servizi che si inizializzano prima di `onModuleInit`
- ❌ **NON necessario** nell'uso normale dei servizi (già sincronizzato)

### Fallback Mechanism

The `InfisicalConfigService` has a built-in fallback mechanism:

1. **First Priority**: Secrets from Infisical
2. **Second Priority**: Environment variables from `process.env`
3. **Third Priority**: Default value (if provided)

This means:
- If Infisical credentials are not provided, it falls back to environment variables
- You can gradually migrate from `.env` files to Infisical
- Local development can still use `.env` files if needed

### Automatic Type Parsing

Il servizio converte automaticamente i valori stringa in tipi appropriati:

| Input String | Output Type | Example |
|--------------|-------------|----------|
| `"true"` / `"false"` | `boolean` | `"true"` → `true` |
| `"42"` / `"3.14"` | `number` | `"5000"` → `5000` |
| `"{...}"` / `"[...]"` | `object` / `array` | `'{"key":"val"}'` → `{key: "val"}` |
| Altri | `string` | `"hello"` → `"hello"` |

```typescript
// Nessuna conversione manuale necessaria
const port = configService.get<number>('PORT'); // Returns number, not string
const enabled = configService.get<boolean>('FEATURE_ENABLED'); // Returns boolean
const config = configService.get<object>('JSON_CONFIG'); // Returns parsed object
```

## Docker Integration

### Docker Compose Configuration

Update your `docker-compose.yml` to pass Infisical credentials:

```yaml
services:
  api:
    container_name: montesilvano-be-apis
    build:
      dockerfile: ./Dockerfile
      context: .
      target: development
    environment:
      - INFISICAL_CLIENT_ID=${INFISICAL_CLIENT_ID}
      - INFISICAL_CLIENT_SECRET=${INFISICAL_CLIENT_SECRET}
      - INFISICAL_PROJECT_ID=${INFISICAL_PROJECT_ID}
      - INFISICAL_ENVIRONMENT=${INFISICAL_ENVIRONMENT:-development}
      - INFISICAL_SITE_URL=${INFISICAL_SITE_URL:-https://app.infisical.com}
      - NODE_ENV=${NODE_ENV:-development}
    volumes:
      - .:/usr/src/app
    ports:
      - '${DOCKER_API_PORT:-3000}:3000'
    networks:
      - montesilvano-be-apis-network
    restart: always
    depends_on:
      - mongodb
```

### Running with Docker

```bash
# Load environment variables and start
docker compose --env-file .env.infisical up -d

# Or export variables manually
export $(cat .env.infisical | grep -v '^#' | xargs)
docker compose up -d
```

## Migration from .env Files

### Step-by-Step Migration Process

1. **Backup your current `.env` file**
   ```bash
   cp .env .env.backup
   ```

2. **Add all secrets to Infisical**
   - Go to your Infisical dashboard
   - Add each key-value pair from your `.env` file
   - Use the appropriate environment (dev, staging, prod)

3. **Set up Infisical credentials**
   - Create `.env.infisical` with only Infisical credentials
   - Remove the old `.env` file (or rename it)

4. **Test the integration**
   ```bash
   npm run start:dev
   ```

5. **Verify all secrets are loaded**
   - Check the console logs for "Successfully loaded X secrets from Infisical"
   - Test your application functionality

### Gradual Migration

You can migrate gradually by:

1. Keeping `.env` file with non-sensitive configuration
2. Moving sensitive secrets to Infisical first
3. The fallback mechanism ensures everything still works
4. Eventually remove `.env` completely

## Best Practices

### 1. Secret Organization

- Use consistent naming conventions (e.g., `UPPERCASE_WITH_UNDERSCORES`)
- Group related secrets with prefixes (e.g., `DB_HOST`, `DB_PORT`, `DB_USER`)
- Add descriptions in Infisical for each secret

### 2. Environment Separation

- Use separate Machine Identities for each environment
- Never share production credentials with development
- Use appropriate permission levels (read-only when possible)

### 3. Security

- **NEVER** commit `.env.infisical` or `.infisical.json` to version control
- Rotate Machine Identity credentials regularly
- Use different credentials for CI/CD pipelines
- Enable audit logging in Infisical

### 4. Team Collaboration

- Document all required secrets in this file
- Use Infisical's team features to share access
- Set up different access levels for different team members

### 5. Local Development

For local development, you have two options:

**Option A: Use Infisical (Recommended)**
- Create a development Machine Identity
- Use `.env.infisical` with development credentials

**Option B: Use .env file (Fallback)**
- The service will fall back to `.env` if Infisical credentials are not found
- Useful for quick local testing

## Troubleshooting

### Issue: "Failed to initialize Infisical client"

**Possible causes:**
- Invalid credentials (Client ID or Client Secret)
- Incorrect Project ID
- Network connectivity issues
- Infisical service is down

**Solution:**
1. Verify your credentials in `.env.infisical`
2. Check Infisical dashboard to ensure Machine Identity is active
3. Test connectivity: `curl https://app.infisical.com`
4. Check application logs for detailed error messages

### Issue: "Configuration key 'X' is required but not found"

**Possible causes:**
- Secret not added to Infisical
- Wrong environment selected
- Typo in secret key name

**Solution:**
1. Go to Infisical dashboard
2. Verify the secret exists in the correct environment
3. Check for typos in key names (they are case-sensitive)
4. Ensure Machine Identity has read access to that secret

### Issue: "Infisical credentials not found. Falling back to environment variables"

**This is a warning, not an error:**
- The application is working but using `.env` instead of Infisical
- If this is intentional (local development), you can ignore it
- If you want to use Infisical, set up `.env.infisical`

### Issue: Secrets not updating

**Possible causes:**
- Application needs restart to fetch new secrets
- Caching issues

**Solution:**
1. Restart your application
2. Secrets are fetched on application startup, not in real-time
3. Consider implementing a secrets refresh mechanism if needed

**Note**: I segreti sono caricati solo all'avvio dell'applicazione. Per aggiornamenti in tempo reale, considera:
- Restart automatici con nodemon/pm2
- Implementazione di un meccanismo di refresh periodico
- Use of webhooks da Infisical (feature futura)

### Issue: "Module initialization timeout"

**Possible causes:**
- Infisical API lenta o non raggiungibile
- Network issues
- Credenziali errate che causano retry

**Solution:**
1. Verifica la connettività di rete
2. Controlla i log per errori specifici
3. Verifica che `INFISICAL_SITE_URL` sia corretto
4. Testa la connessione manualmente:
   ```bash
   curl -v https://app.infisical.com
   ```

### Debugging

If you need to debug the Infisical integration:

1. Check the application logs for Infisical-related messages
2. Verify the credentials in `.env.infisical`
3. Test the connection to Infisical:
   ```bash
   curl https://app.infisical.com
   ```
4. Enable verbose logging in the InfisicalConfigService if needed

### Getting Help

- Check Infisical documentation: [https://infisical.com/docs](https://infisical.com/docs)
- Join Infisical Slack community
- Open an issue on the project repository

## Performance Considerations

### Startup Time

- **Eager Loading**: I segreti vengono caricati durante il bootstrap dell'applicazione
- **Impatto**: Aggiunge ~500ms-2s al tempo di startup (dipende da network e numero di segreti)
- **Benefit**: Nessun overhead durante runtime, accesso sincrono ai segreti

### Memory Usage

- I segreti sono memorizzati in una `Map` in memoria
- Footprint minimo: ~1KB per 10 segreti tipici
- No external storage o database necessari

### Best Practices per Performance

1. **Usa `waitForInit()` solo quando necessario**
   ```typescript
   // ❌ NON necessario
   constructor(private config: InfisicalConfigService) {
     this.config.waitForInit(); // Già sincronizzato da NestJS
   }
   
   // ✅ Necessario solo in async factories
   useFactory: async (config: InfisicalConfigService) => {
     await config.waitForInit();
     return { uri: config.get('DB_URI') };
   }
   ```

2. **Cache valori frequentemente acceduti**
   ```typescript
   export class MyService {
     private readonly apiUrl: string;
     
     constructor(private config: InfisicalConfigService) {
       // Cache una volta invece di chiamare .get() ripetutamente
       this.apiUrl = this.config.getOrThrow<string>('API_URL');
     }
   }
   ```

3. **Usa environment variabili per config non-sensibili**
   - Infisical per: API keys, passwords, tokens
   - Environment vars per: port, log level, feature flags non-sensibili

## Integration Examples

### MongoDB Connection

```typescript
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { InfisicalConfigService } from 'src/core/infisical';

@Module({
  imports: [
    MongooseModule.forRootAsync({
      inject: [InfisicalConfigService],
      useFactory: async (config: InfisicalConfigService) => {
        await config.waitForInit();
        return {
          uri: config.getOrThrow<string>('MONGODB_URI'),
        };
      },
    }),
  ],
})
export class DatabaseModule {}
```

### Redis Connection

```typescript
import { Module } from '@nestjs/common';
import { RedisModule } from '@nestjs-modules/ioredis';
import { InfisicalConfigService } from 'src/core/infisical';

@Module({
  imports: [
    RedisModule.forRootAsync({
      inject: [InfisicalConfigService],
      useFactory: async (config: InfisicalConfigService) => {
        await config.waitForInit();
        return {
          type: 'single',
          options: {
            host: config.get<string>('REDIS_HOST', 'localhost'),
            port: config.get<number>('REDIS_PORT', 6379),
            password: config.get<string>('REDIS_PASSWORD'),
          },
        };
      },
    }),
  ],
})
export class RedisModule {}
```

### JWT Configuration

```typescript
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { InfisicalConfigService } from 'src/core/infisical';

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [InfisicalConfigService],
      useFactory: async (config: InfisicalConfigService) => {
        await config.waitForInit();
        return {
          secret: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
          signOptions: {
            expiresIn: config.get<string>('JWT_ACCESS_EXPIRATION', '15m'),
          },
        };
      },
    }),
  ],
})
export class AuthModule {}
```

## API Reference

### InfisicalConfigService Methods

#### `get<T>(key: string, defaultValue?: T): T`

Retrieves a configuration value.

**Parameters:**
- `key`: The configuration key to retrieve
- `defaultValue`: Optional default value if key not found

**Returns:** The value cast to type T, or defaultValue, or undefined

**Example:**
```typescript
const port = config.get<number>('PORT', 3000);
```

---

#### `getOrThrow<T>(key: string): T`

Retrieves a required configuration value. Throws if not found.

**Parameters:**
- `key`: The configuration key to retrieve

**Returns:** The value cast to type T

**Throws:** Error if key is not found

**Example:**
```typescript
const apiKey = config.getOrThrow<string>('API_KEY');
```

---

#### `getAll(): Record<string, string>`

Retrieves all configuration values as an object.

**Returns:** Object containing all secrets from Infisical and environment variables

**Example:**
```typescript
const allConfig = config.getAll();
console.log(Object.keys(allConfig));
```

---

#### `isInfisicalEnabled(): boolean`

Checks if Infisical is properly initialized.

**Returns:** `true` if Infisical client is initialized, `false` otherwise

**Example:**
```typescript
if (config.isInfisicalEnabled()) {
  console.log('Using Infisical for secrets');
} else {
  console.log('Using environment variables');
}
```

---

#### `async waitForInit(): Promise<void>`

Waits for Infisical initialization to complete. Use in async factories.

**Returns:** Promise that resolves when initialization is complete

**Example:**
```typescript
useFactory: async (config: InfisicalConfigService) => {
  await config.waitForInit();
  return { uri: config.get('DB_URI') };
}
```

## Additional Resources

- [Infisical Official Documentation](https://infisical.com/docs)
- [Infisical SDK Documentation](https://infisical.com/docs/sdks/overview)
- [Infisical Universal Auth](https://infisical.com/docs/documentation/platform/identities/universal-auth)
- [NestJS Configuration Best Practices](https://docs.nestjs.com/techniques/configuration)
- [NestJS Async Configuration](https://docs.nestjs.com/techniques/configuration#async-configuration)

## FAQ

### Q: Posso usare Infisical in development e .env in production?

**A:** Sì, ma è sconsigliato. Il fallback mechanism permette questa configurazione, ma per produzione è fortemente raccomandato usare Infisical per maggiore sicurezza.

### Q: Come ruoto i segreti senza downtime?

**A:** 
1. Aggiorna il segreto in Infisical
2. Esegui un rolling restart dell'applicazione
3. I nuovi processi caricheranno il segreto aggiornato

### Q: Infisical supporta il caricamento dinamico dei segreti?

**A:** No, i segreti sono caricati solo all'avvio. Per aggiornamenti runtime, implementa un meccanismo di refresh custom o usa restart automatici.

### Q: Posso usare path diversi da "/" per i segreti?

**A:** Attualmente il servizio usa solo il path `/`. Per supportare path multipli, modifica il metodo `listSecrets()` in `infisical-config.service.ts`.

### Q: Come gestisco segreti diversi per environment (dev/staging/prod)?

**A:** Usa la variabile `INFISICAL_ENVIRONMENT` per specificare l'environment:
```bash
# Development
INFISICAL_ENVIRONMENT=development

# Staging  
INFISICAL_ENVIRONMENT=staging

# Production
INFISICAL_ENVIRONMENT=production
```

Ogni environment in Infisical ha un set separato di segreti.

---

**Last Updated**: January 2025
**Maintained by**: Development Team

# Rate Limiting Documentation

## Overview

This application implements rate limiting using a custom Redis-based `RateLimiterGuard`. Rate limiting helps protect your API from abuse by limiting the number of requests a client can make within a specified time window.

## Architecture

### Components

1. **RateLimiterGuard**: Custom guard that uses Redis for distributed rate limiting
2. **@RateLimit() Decorator**: Applies rate limiting configuration to specific endpoints
3. **Redis Backend**: Stores request counters with automatic expiration

### Key Features

- ✅ **Redis-based**: Distributed rate limiting across multiple instances
- ✅ **Per-endpoint configuration**: Different limits for different routes
- ✅ **UtilizerGrant/IP tracking**: Limits per authenticated user or IP address
- ✅ **Automatic expiration**: Redis TTL handles window cleanup
- ✅ **Detailed error responses**: Returns retry-after information

## How It Works

### Request Flow

```
Incoming Request to Protected Endpoint
      ↓
RateLimiterGuard.canActivate()
      ↓
Check @RateLimit() metadata
      ↓
  ┌────────────────┐
  │ Has metadata?  │
  └────────────────┘
      ↓     ↓
     NO    YES
      ↓     ↓
   Allow   Generate Redis key: 
           route:path:userId/IP
      ↓
Increment counter in Redis
      ↓
Set expiration (first request)
      ↓
  ┌──────────────┐
  │ Under Limit? │
  └──────────────┘
      ↓     ↓
     YES    NO → 429 Too Many Requests
      ↓           (with retryAfter)
Allow Request
```

### Implementation Details

**File**: `src/core/security/guards/rate-limiter.guard.ts`

```typescript
export interface RateLimitOptions {
  max: number;        // Maximum requests
  windowMs: number;   // Time window in milliseconds
  message?: string;   // Custom error message
}
```

The guard:
1. Reads `@RateLimit()` metadata from the route handler
2. Generates a unique Redis key combining route path and user ID/IP
3. Increments the counter in Redis
4. Sets expiration on first request
5. Rejects requests exceeding the limit with 429 status

## Usage

### Applying Rate Limiting to a Controller

```typescript
import { Controller, Post, UseGuards } from '@nestjs/common';
import { RateLimiterGuard } from '@core/security/guards/rate-limiter.guard';
import { RateLimit } from '@core/security/decorators/rate-limit.decorator';

@Controller('auth')
@UseGuards(RateLimiterGuard)  // Apply guard to entire controller
export class AuthController {
  
  @Post('login')
  @RateLimit({ max: 5, windowMs: 900000 })  // 5 requests per 15 minutes
  async login(@Body() dto: LoginDto) {
    // ...
  }
  
  @Post('register')
  @RateLimit({ max: 3, windowMs: 3600000 })  // 3 requests per hour
  async register(@Body() dto: RegisterDto) {
    // ...
  }
  
  @Post('refresh')
  @RateLimit({ max: 10, windowMs: 60000 })  // 10 requests per minute
  async refresh(@Body() dto: RefreshTokenDto) {
    // ...
  }
}
```

### Rate Limiting Without Guard Metadata

If a route has the `RateLimiterGuard` applied but no `@RateLimit()` decorator, the request is **allowed** (no rate limiting applied).

### Custom Error Messages

```typescript
@RateLimit({ 
  max: 5, 
  windowMs: 900000,
  message: 'Troppi tentativi di login. Riprova più tardi.' 
})
```

## Redis Configuration

Ensure Redis is configured in your environment:

```env
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0
```

The rate limiter uses the Redis client injected via `REDIS_CLIENT` token (configured in `RedisModule`).

## Error Response

When a client exceeds the rate limit, they receive a `429 Too Many Requests` response:

```json
{
  "statusCode": 429,
  "message": "Troppe richieste",
  "retryAfter": 847  // seconds until rate limit resets
}
```

## Best Practices

1. **Critical Endpoints Only**: 
   - Apply rate limiting to authentication endpoints (login, register, password reset)
   - Apply to public APIs vulnerable to abuse
   - Skip for internal/admin endpoints if not needed

2. **Monitoring**: 
   - Log rate limit violations
   - Monitor Redis memory usage
   - Track patterns of abuse
   - Alert on unusual spikes

3. **Progressive Limits**: 
   ```typescript
   // Strict for registration
   @RateLimit({ max: 3, windowMs: 3600000 })  // 3/hour
   
   // Moderate for login
   @RateLimit({ max: 5, windowMs: 900000 })   // 5/15min
   
   // Lenient for token refresh
   @RateLimit({ max: 10, windowMs: 60000 })   // 10/min
   ```

4. **Redis Persistence**: 
   - Use Redis persistence (AOF/RDB) for production
   - Consider Redis Cluster for high availability
   - Monitor Redis connection health

5. **UtilizerGrant Experience**:
   - Return clear error messages
   - Include `retryAfter` in responses
   - Document rate limits in API docs

## Example Configurations

### Aggressive Protection (Auth Endpoints)

```typescript
@RateLimit({ max: 3, windowMs: 3600000 })  // 3 requests per hour
```

### Moderate Protection (API Endpoints)

```typescript
@RateLimit({ max: 100, windowMs: 60000 })  // 100 requests per minute
```

### Lenient Protection (Internal APIs)

```typescript
@RateLimit({ max: 1000, windowMs: 60000 })  // 1000 requests per minute
```

## Testing

Test rate limiting with curl:

```bash
# Make multiple requests quickly
for i in {1..10}; do
  curl -X POST http://localhost:3000/api/v1/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"test@example.com","password":"test"}'
  echo "Request $i"
done
```

Expected: First 5 requests succeed, subsequent requests return 429.

## Migration from @nestjs/throttler

This template previously used `@nestjs/throttler` with `ConditionalThrottlerGuard`. It has been replaced with a Redis-based custom implementation for:
- Better distributed support
- More flexible per-endpoint configuration
- Redis persistence and monitoring
- Clearer codebase (no global guard confusion)

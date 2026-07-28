# Audit System

## 📋 Overview

The Audit System provides comprehensive logging of security-relevant actions throughout the application. All authentication events, user activities, and security-critical operations are automatically tracked and stored for compliance, security analysis, and troubleshooting.

## Features

- ✅ **Automatic logging** of all security-related events
- ✅ **UtilizerGrant tracking** with optional anonymous actions
- ✅ **IP address and UtilizerGrant-Agent** logging for forensics
- ✅ **Custom metadata** support for additional context
- ✅ **Automatic data retention** (90-day TTL by default)
- ✅ **Indexed queries** for fast searching and reporting
- ✅ **Non-blocking** - failures don't affect main operations
- ✅ **MongoDB storage** with automatic cleanup

## Architecture

```
┌─────────────────┐
│  Any Service    │
│  (Auth, UtilizerGrant,   │
│   etc.)         │
└────────┬────────┘
         │
         │ log(action, userId, ip, userAgent, metadata)
         ▼
┌─────────────────┐
│  AuditService   │
│  - Validates    │
│  - Enriches     │
│  - Stores       │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  MongoDB        │
│  audit_logs     │
│  collection     │
└─────────────────┘
```

## Schema

```typescript
{
  _id: ObjectId,
  userId: ObjectId | null,      // UtilizerGrant who performed the action
  action: AuditAction,           // Enum: REGISTER, LOGIN, etc.
  ipAddress: string,             // IP address of the request
  userAgent: string,             // UtilizerGrant-Agent header
  metadata: Object,              // Additional context data
  createdAt: Date,               // Auto-generated
  updatedAt: Date                // Auto-generated
}
```

### Indexes

- `userId` + `createdAt` (compound) - Fast user-specific queries
- `action` - Filter by action type
- `createdAt` - Chronological queries
- `createdAt` (TTL) - Automatic deletion after 90 days

## Available Actions

All audit actions are defined in the `AuditAction` enum:

| Action | Description | Typical Metadata |
|--------|-------------|------------------|
| **REGISTER** | New user registration | `{ email }` |
| **LOGIN** | Login attempt (any outcome) | - |
| **LOGIN_SUCCESS** | Successful login without 2FA | - |
| **LOGIN_2FA_REQUIRED** | 2FA challenge issued | - |
| **LOGIN_2FA_SUCCESS** | Successful 2FA verification | - |
| **FAILED_LOGIN** | Failed login attempt | `{ failedAttempts, reason }` |
| **FAILED_2FA** | Failed 2FA verification | `{ attempts }` |
| **LOGIN_ATTEMPT_LOCKED** | Login attempt on locked account | `{ lockedUntil }` |
| **LOGOUT** | UtilizerGrant logout | `{ deviceId }` |
| **LOGOUT_ALL_DEVICES** | Logout from all devices | `{ deviceCount }` |
| **PASSWORD_RESET_REQUEST** | Password reset requested | `{ email }` |
| **PASSWORD_RESET_SUCCESS** | Password reset completed | - |
| **PASSWORD_CHANGE** | Password changed by user | - |
| **EMAIL_VERIFIED** | Email address verified | `{ email }` |
| **TWO_FACTOR_ENABLED** | 2FA enabled for account | - |
| **TWO_FACTOR_DISABLED** | 2FA disabled for account | - |
| **BACKUP_CODES_GENERATED** | Backup codes regenerated | `{ codeCount }` |
| **BACKUP_CODE_USED** | Backup code used for 2FA | `{ remainingCodes }` |

## Usage

### Basic Logging

```typescript
import { AuditService } from '@/core/audit/audit.service';
import { AuditAction } from '@/core/audit/enums/audit.enums';

@Injectable()
export class AuthService {
  constructor(private readonly auditService: AuditService) {}

  async login(email: string, password: string, ip: string, userAgent: string) {
    // ... login logic
    
    await this.auditService.log(
      AuditAction.LOGIN_SUCCESS,
      user._id,
      ip,
      userAgent
    );
  }
}
```

### With Custom Metadata

```typescript
// Track failed login with additional context
await this.auditService.log(
  AuditAction.FAILED_LOGIN,
  user._id,
  ipAddress,
  userAgent,
  {
    failedAttempts: user.failedLoginAttempts + 1,
    reason: 'invalid_password',
    email: user.email,
  }
);
```

### Anonymous Actions

For actions before user authentication:

```typescript
// Registration (user doesn't exist yet)
await this.auditService.log(
  AuditAction.REGISTER,
  null,  // No userId yet
  ipAddress,
  userAgent,
  { email: newUser.email }
);
```

### String or ObjectId

The service accepts both string and ObjectId for userId:

```typescript
// Both are valid
await this.auditService.log(
  AuditAction.LOGIN_SUCCESS,
  '507f1f77bcf86cd799439011',  // string
  ip,
  userAgent
);

await this.auditService.log(
  AuditAction.LOGIN_SUCCESS,
  new Types.ObjectId('507f1f77bcf86cd799439011'),  // ObjectId
  ip,
  userAgent
);
```

## Examples by Use Case

### 1. UtilizerGrant Registration

```typescript
async register(email: string, password: string, ip: string, userAgent: string) {
  const user = await this.usersService.create(email, hashedPassword);
  
  await this.auditService.log(
    AuditAction.REGISTER,
    user._id,
    ip,
    userAgent,
    { email }
  );
  
  return user;
}
```

### 2. Login with 2FA

```typescript
async login(email: string, password: string, ip: string, userAgent: string) {
  const user = await this.validateCredentials(email, password);
  
  if (user.twoFactorEnabled) {
    await this.auditService.log(
      AuditAction.LOGIN_2FA_REQUIRED,
      user._id,
      ip,
      userAgent
    );
    
    return { requiresTwoFactor: true };
  }
  
  await this.auditService.log(
    AuditAction.LOGIN_SUCCESS,
    user._id,
    ip,
    userAgent
  );
  
  return { accessToken, refreshToken };
}
```

### 3. Account Lockout

```typescript
async handleFailedLogin(user: UtilizerGrant, ip: string, userAgent: string) {
  await this.usersService.incrementFailedAttempts(user._id);
  
  const updatedUser = await this.usersService.findById(user._id);
  
  if (updatedUser.failedLoginAttempts >= MAX_ATTEMPTS) {
    const lockUntil = new Date(Date.now() + LOCK_DURATION);
    await this.usersService.lockAccount(user._id, lockUntil);
    
    await this.auditService.log(
      AuditAction.LOGIN_ATTEMPT_LOCKED,
      user._id,
      ip,
      userAgent,
      { 
        failedAttempts: updatedUser.failedLoginAttempts,
        lockedUntil: lockUntil.toISOString()
      }
    );
  }
  
  await this.auditService.log(
    AuditAction.FAILED_LOGIN,
    user._id,
    ip,
    userAgent,
    { 
      failedAttempts: updatedUser.failedLoginAttempts 
    }
  );
}
```

### 4. Password Reset Flow

```typescript
async requestPasswordReset(email: string, ip: string, userAgent: string) {
  const user = await this.usersService.findByEmail(email);
  
  if (user) {
    const token = await this.generateResetToken(user._id);
    await this.emailService.sendPasswordResetEmail(email, token);
    
    await this.auditService.log(
      AuditAction.PASSWORD_RESET_REQUEST,
      user._id,
      ip,
      userAgent,
      { email }
    );
  }
  
  // Always return success (security)
  return { success: true };
}

async resetPassword(token: string, newPassword: string, ip: string, userAgent: string) {
  const user = await this.validateResetToken(token);
  await this.usersService.updatePassword(user._id, newPassword);
  
  await this.auditService.log(
    AuditAction.PASSWORD_RESET_SUCCESS,
    user._id,
    ip,
    userAgent
  );
  
  return { success: true };
}
```

### 5. 2FA Management

```typescript
async enable2FA(userId: string, ip: string, userAgent: string) {
  const { qrCode, secret, backupCodes } = await this.generate2FASetup(userId);
  
  await this.auditService.log(
    AuditAction.TWO_FACTOR_ENABLED,
    userId,
    ip,
    userAgent
  );
  
  await this.auditService.log(
    AuditAction.BACKUP_CODES_GENERATED,
    userId,
    ip,
    userAgent,
    { codeCount: backupCodes.length }
  );
  
  return { qrCode, secret, backupCodes };
}

async verify2FAWithBackupCode(userId: string, code: string, ip: string, userAgent: string) {
  const isValid = await this.backupCodesService.verifyBackupCode(userId, code);
  
  if (isValid) {
    const remaining = await this.backupCodesService.getRemainingCount(userId);
    
    await this.auditService.log(
      AuditAction.BACKUP_CODE_USED,
      userId,
      ip,
      userAgent,
      { remainingCodes: remaining }
    );
    
    return { success: true };
  }
  
  throw new UnauthorizedException('Invalid backup code');
}
```

## Querying Audit Logs

### Find UtilizerGrant Activity

```typescript
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AuditLog, AuditLogDocument } from '@/core/audit/schemas/audit-log.schema';

@Injectable()
export class AuditQueryService {
  constructor(
    @InjectModel(AuditLog.name) 
    private auditLogModel: Model<AuditLogDocument>
  ) {}

  // Get all actions by a specific user
  async getUserActivity(userId: string, limit = 100) {
    return this.auditLogModel
      .find({ userId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .exec();
  }

  // Get failed login attempts
  async getFailedLogins(startDate: Date, endDate: Date) {
    return this.auditLogModel
      .find({
        action: AuditAction.FAILED_LOGIN,
        createdAt: { $gte: startDate, $lte: endDate }
      })
      .sort({ createdAt: -1 })
      .exec();
  }

  // Detect suspicious activity
  async getSuspiciousActivity(userId: string, hours = 24) {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    
    return this.auditLogModel
      .find({
        userId,
        action: { 
          $in: [
            AuditAction.FAILED_LOGIN, 
            AuditAction.FAILED_2FA,
            AuditAction.LOGIN_ATTEMPT_LOCKED
          ]
        },
        createdAt: { $gte: since }
      })
      .sort({ createdAt: -1 })
      .exec();
  }

  // Get recent activity for security dashboard
  async getRecentActivity(limit = 50) {
    return this.auditLogModel
      .find()
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('userId', 'email')
      .exec();
  }
}
```

### Aggregation Examples

```typescript
// Count actions by type
async getActionStatistics(startDate: Date, endDate: Date) {
  return this.auditLogModel.aggregate([
    {
      $match: {
        createdAt: { $gte: startDate, $lte: endDate }
      }
    },
    {
      $group: {
        _id: '$action',
        count: { $sum: 1 }
      }
    },
    {
      $sort: { count: -1 }
    }
  ]);
}

// Get most active utilizerGrants
async getMostActiveUsers(limit = 10) {
  return this.auditLogModel.aggregate([
    {
      $match: {
        userId: { $ne: null }
      }
    },
    {
      $group: {
        _id: '$userId',
        actionCount: { $sum: 1 },
        lastActivity: { $max: '$createdAt' }
      }
    },
    {
      $sort: { actionCount: -1 }
    },
    {
      $limit: limit
    }
  ]);
}

// Detect brute force attempts
async detectBruteForce(timeWindowMinutes = 15, threshold = 5) {
  const since = new Date(Date.now() - timeWindowMinutes * 60 * 1000);
  
  return this.auditLogModel.aggregate([
    {
      $match: {
        action: AuditAction.FAILED_LOGIN,
        createdAt: { $gte: since }
      }
    },
    {
      $group: {
        _id: { ipAddress: '$ipAddress', userId: '$userId' },
        attempts: { $sum: 1 },
        lastAttempt: { $max: '$createdAt' }
      }
    },
    {
      $match: {
        attempts: { $gte: threshold }
      }
    },
    {
      $sort: { attempts: -1 }
    }
  ]);
}
```

## Best Practices

### 1. Always Log Security-Critical Actions

```typescript
// ✅ Good
await this.auditService.log(
  AuditAction.PASSWORD_CHANGE,
  userId,
  ip,
  userAgent
);

// ❌ Bad - missing audit log
await this.usersService.updatePassword(userId, newPassword);
```

### 2. Include Relevant Metadata

```typescript
// ✅ Good - includes context
await this.auditService.log(
  AuditAction.FAILED_LOGIN,
  user._id,
  ip,
  userAgent,
  { 
    failedAttempts: 3,
    reason: 'invalid_password' 
  }
);

// ❌ Bad - missing useful context
await this.auditService.log(
  AuditAction.FAILED_LOGIN,
  user._id,
  ip,
  userAgent
);
```

### 3. Don't Store Sensitive Data

```typescript
// ✅ Good
await this.auditService.log(
  AuditAction.PASSWORD_CHANGE,
  userId,
  ip,
  userAgent,
  { changedAt: new Date().toISOString() }
);

// ❌ Bad - NEVER store passwords
await this.auditService.log(
  AuditAction.PASSWORD_CHANGE,
  userId,
  ip,
  userAgent,
  { oldPassword: '...', newPassword: '...' }  // NEVER DO THIS
);
```

### 4. Handle Failures Gracefully

The AuditService is designed to never throw errors:

```typescript
// No try-catch needed
await this.auditService.log(action, userId, ip, userAgent);
// If logging fails, it's logged but doesn't affect the main flow
```

### 5. Use Consistent Action Names

```typescript
// ✅ Good - use the enum
await this.auditService.log(
  AuditAction.LOGIN_SUCCESS,
  userId,
  ip,
  userAgent
);

// ❌ Bad - magic strings
await this.auditService.log(
  'USER_LOGIN' as any,  // Don't do this
  userId,
  ip,
  userAgent
);
```

## Configuration

### Data Retention

By default, audit logs are kept for 90 days. To change this, modify the TTL index:

```typescript
// In audit-log.schema.ts
// Change from 90 days (7776000 seconds)
AuditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7776000 });

// To 180 days (15552000 seconds)
AuditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 15552000 });

// To 30 days (2592000 seconds)
AuditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 2592000 });
```

After changing, you need to drop and recreate the index:

```bash
# In MongoDB shell
db.audit_logs.dropIndex("createdAt_1")
# Restart your app to recreate with new TTL
```

### Adding Custom Actions

To add new audit actions:

1. **Add to enum** (`audit.enums.ts`):

```typescript
export enum AuditAction {
  // ... existing actions
  PROFILE_UPDATED = 'PROFILE_UPDATED',
  EMAIL_CHANGED = 'EMAIL_CHANGED',
  ACCOUNT_DELETED = 'ACCOUNT_DELETED',
}
```

2. **Use in your service**:

```typescript
await this.auditService.log(
  AuditAction.PROFILE_UPDATED,
  userId,
  ip,
  userAgent,
  { fields: ['firstName', 'lastName'] }
);
```

## Security Considerations

1. **PII Protection**: Be careful not to log sensitive personal information in metadata
2. **IP Anonymization**: Consider anonymizing IP addresses for GDPR compliance
3. **Access Control**: Restrict access to audit logs to administrators only
4. **Tamper Protection**: Audit logs should be read-only in production
5. **Regular Review**: Set up alerts for suspicious patterns

## Monitoring & Alerts

### Example Alert Queries

```typescript
// Alert: Multiple failed logins from same IP
async checkMultipleFailedLogins(threshold = 5, minutes = 10) {
  const since = new Date(Date.now() - minutes * 60 * 1000);
  
  const results = await this.auditLogModel.aggregate([
    {
      $match: {
        action: AuditAction.FAILED_LOGIN,
        createdAt: { $gte: since }
      }
    },
    {
      $group: {
        _id: '$ipAddress',
        count: { $sum: 1 }
      }
    },
    {
      $match: { count: { $gte: threshold } }
    }
  ]);
  
  if (results.length > 0) {
    // Trigger alert
    this.alertService.sendAlert('Multiple failed logins detected', results);
  }
}

// Alert: Account accessed from new location
async checkNewLocation(userId: string, currentIp: string) {
  const previousLogins = await this.auditLogModel
    .find({
      userId,
      action: AuditAction.LOGIN_SUCCESS,
      ipAddress: { $ne: currentIp }
    })
    .sort({ createdAt: -1 })
    .limit(10)
    .exec();
  
  if (previousLogins.length > 0) {
    // This is a new IP for this user
    await this.notificationService.sendEmail(
      user.email,
      'New Login Location Detected',
      `Your account was accessed from a new location: ${currentIp}`
    );
  }
}
```

## Compliance

The audit system helps with:

- **GDPR**: Data retention policies, user activity tracking
- **SOC 2**: Security monitoring and incident response
- **HIPAA**: Access logging and monitoring
- **PCI DSS**: Authentication and authorization tracking

## Troubleshooting

### Audit Logs Not Appearing

1. Check MongoDB connection
2. Verify AuditModule is imported
3. Check for errors in application logs
4. Ensure TTL hasn't expired the logs

### High Storage Usage

1. Review retention period (default 90 days)
2. Check for excessive metadata
3. Consider archiving old logs to cold storage
4. Implement log rotation if needed

### Query Performance

1. Ensure indexes are created
2. Use covered queries when possible
3. Add compound indexes for common query patterns
4. Consider read replicas for reporting

## Resources

- [MongoDB TTL Indexes](https://docs.mongodb.com/manual/core/index-ttl/)
- [Mongoose Schema Indexes](https://mongoosejs.com/docs/guide.html#indexes)
- [OWASP Logging Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html)

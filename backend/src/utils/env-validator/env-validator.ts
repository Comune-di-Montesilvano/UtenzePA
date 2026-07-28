import { Logger } from '@nestjs/common';

export interface EnvironmentVariable {
  name: string;
  required: boolean;
  defaultValue?: string;
  validator?: (value: string) => boolean;
  description?: string;
}

export class EnvValidator {
  private static readonly logger = new Logger('EnvValidator');

  /**
   * Core required environment variables for Docker and Sentry
   * Application secrets are managed in src/config/*.yml files
   */
  private static readonly REQUIRED_VARIABLES: EnvironmentVariable[] = [
    {
      name: 'NODE_ENV',
      required: true,
      defaultValue: 'development',
      validator: (value) => ['development', 'staging', 'production', 'test'].includes(value),
      description: 'Application environment (determines which config/*.yml to load)',
    },
    {
      name: 'PROJECT_NAME',
      required: true,
      defaultValue: 'nestjs-template',
      description: 'Project name for Sentry monitoring',
    },
    {
      name: 'TYPE',
      required: true,
      defaultValue: 'api',
      description: 'Application type for Sentry (api, worker, cron)',
    },
  ];

  /**
   * Optional Docker and infrastructure variables
   */
  private static readonly OPTIONAL_VARIABLES: EnvironmentVariable[] = [
    {
      name: 'DOCKER_MONGO_PORT',
      required: false,
      defaultValue: '27017',
      validator: (value) => !isNaN(parseInt(value)) && parseInt(value) > 0,
      description: 'Docker MongoDB port mapping',
    },
    {
      name: 'DOCKER_API_PORT',
      required: false,
      defaultValue: '3000',
      validator: (value) => !isNaN(parseInt(value)) && parseInt(value) > 0,
      description: 'Docker API port mapping',
    },
    {
      name: 'SENTRY_DNS',
      required: false,
      description: 'Sentry DSN for error tracking',
    },
    {
      name: 'VERSION',
      required: false,
      defaultValue: '1.0.0',
      description: 'Application version for Sentry',
    },
    {
      name: 'IMAGE_NAME',
      required: false,
      description: 'Docker image name',
    },
    {
      name: 'TAG',
      required: false,
      defaultValue: 'latest',
      description: 'Docker image tag',
    },
    {
      name: 'DEPLOYMENT_METHOD',
      required: false,
      defaultValue: 'manual',
      description: 'Deployment method for Sentry context',
    },
    {
      name: 'DEPLOYED_BY',
      required: false,
      defaultValue: 'developer',
      description: 'Who deployed the application',
    },
    {
      name: 'AWS_REGION',
      required: false,
      defaultValue: 'eu-west-1',
      description: 'AWS region for Sentry context',
    },
  ];

  /**
   * Validate all environment variables
   */
  static validate(): void {
    this.logger.log('Validating environment variables...');

    const errors: string[] = [];
    const warnings: string[] = [];

    // Check required variables
    for (const variable of this.REQUIRED_VARIABLES) {
      const value = process.env[variable.name] || variable.defaultValue;

      if (!value && variable.required) {
        errors.push(
          `Missing required environment variable: ${variable.name} - ${variable.description}`,
        );
      } else if (variable.validator && value && !variable.validator(value)) {
        errors.push(`Invalid value for ${variable.name}: "${value}" - ${variable.description}`);
      }

      // Set default value if not present
      if (!process.env[variable.name] && variable.defaultValue) {
        process.env[variable.name] = variable.defaultValue;
        this.logger.debug(`Set default value for ${variable.name}: ${variable.defaultValue}`);
      }
    }

    // Check optional variables
    for (const variable of this.OPTIONAL_VARIABLES) {
      const value = process.env[variable.name] || variable.defaultValue;

      if (!value && !variable.required) {
        warnings.push(
          `Missing optional environment variable: ${variable.name} - ${variable.description}`,
        );
      } else if (variable.validator && value && !variable.validator(value)) {
        warnings.push(`Invalid value for ${variable.name}: "${value}" - ${variable.description}`);
      }

      // Set default value if not present
      if (!process.env[variable.name] && variable.defaultValue) {
        process.env[variable.name] = variable.defaultValue;
        this.logger.debug(`Set default value for ${variable.name}: ${variable.defaultValue}`);
      }
    }

    // Log warnings
    warnings.forEach((warning) => this.logger.warn(warning));

    // Handle errors
    if (errors.length > 0) {
      errors.forEach((error) => this.logger.error(error));
      throw new Error(
        `Environment validation failed with ${errors.length} error(s). Please check your .env file.`,
      );
    }

    this.logger.log('Environment variables validated successfully');
  }

  /**
   * Get environment variable with type safety
   */
  static get<T = string>(key: string, defaultValue?: T): T {
    const value = process.env[key];

    if (value === undefined) {
      if (defaultValue !== undefined) {
        return defaultValue;
      }
      throw new Error(
        `Environment variable ${key} is not defined and no default value was provided`,
      );
    }

    // Type conversion
    if (typeof defaultValue === 'number') {
      return parseInt(value) as unknown as T;
    }

    if (typeof defaultValue === 'boolean') {
      return (value === 'true' || value === '1') as unknown as T;
    }

    return value as unknown as T;
  }

  /**
   * Check if environment is production
   */
  static isProduction(): boolean {
    return process.env.NODE_ENV === 'production';
  }

  /**
   * Check if environment is development
   */
  static isDevelopment(): boolean {
    return process.env.NODE_ENV === 'development';
  }

  /**
   * Check if environment is staging
   */
  static isStaging(): boolean {
    return process.env.NODE_ENV === 'staging';
  }

  /**
   * Check if environment is test
   */
  static isTest(): boolean {
    return process.env.NODE_ENV === 'test';
  }

  /**
   * Get all environment variables (for debugging)
   */
  static getAll(): Record<string, string | undefined> {
    if (this.isProduction()) {
      this.logger.warn('Getting all environment variables in production is not recommended');
    }

    return { ...process.env };
  }

  /**
   * Mask sensitive values for logging
   */
  static maskSensitiveValue(value: string): string {
    if (!value || value.length < 4) {
      return '***';
    }

    const visibleChars = Math.min(4, Math.floor(value.length / 4));
    return value.substring(0, visibleChars) + '*'.repeat(value.length - visibleChars);
  }

  /**
   * Log current environment configuration (with masked sensitive values)
   */
  static logConfiguration(): void {
    const sensitiveKeys = ['PASSWORD', 'SECRET', 'KEY', 'TOKEN', 'CREDENTIAL', 'PRIVATE'];

    this.logger.log('=== Environment Configuration ===');
    this.logger.log(`Environment: ${process.env.NODE_ENV}`);
    this.logger.log(`Project: ${process.env.PROJECT_NAME}`);
    this.logger.log(`Type: ${process.env.TYPE}`);
    this.logger.log(`Port: ${process.env.PORT || 3000}`);

    // Log other variables with masking
    const allVars = [...this.REQUIRED_VARIABLES, ...this.OPTIONAL_VARIABLES];

    for (const variable of allVars) {
      const value = process.env[variable.name];
      if (value) {
        const isSensitive = sensitiveKeys.some((key) => variable.name.includes(key));
        const displayValue = isSensitive ? this.maskSensitiveValue(value) : value;
        this.logger.log(`${variable.name}: ${displayValue}`);
      }
    }

    this.logger.log('================================');
  }
}

import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { InfisicalSDK } from '@infisical/sdk';

@Injectable()
export class InfisicalConfigService implements OnModuleInit {
  private readonly logger = new Logger(InfisicalConfigService.name);
  private client: InfisicalSDK;
  private secrets: Map<string, string> = new Map();
  private isInitialized = false;
  private initPromise: Promise<void>;

  constructor() {
    // Start initialization immediately in constructor (eager loading)
    this.initPromise = this.initialize();
  }

  async onModuleInit() {
    // Wait for initialization to complete
    await this.initPromise;
  }

  private async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    const clientId = process.env.INFISICAL_CLIENT_ID;
    const clientSecret = process.env.INFISICAL_CLIENT_SECRET;
    const projectId = process.env.INFISICAL_PROJECT_ID;
    const environment = process.env.INFISICAL_ENVIRONMENT || process.env.NODE_ENV || 'development';
    const siteUrl = process.env.INFISICAL_SITE_URL || 'https://app.infisical.com';

    if (!clientId || !clientSecret) {
      this.logger.warn('Infisical credentials not found. Falling back to environment variables.');
      this.isInitialized = true;
      return;
    }

    if (!projectId) {
      this.logger.error('INFISICAL_PROJECT_ID is required when using Infisical');
      this.logger.warn('Application will continue using environment variables as fallback');
      this.isInitialized = true;
      return;
    }

    this.logger.log(`Initializing Infisical SDK for environment: ${environment}`);

    try {
      // Create SDK instance
      const sdk = new InfisicalSDK({
        siteUrl,
      });
      // Authenticate using Universal Auth (Machine Identity)
      this.client = await sdk.auth().universalAuth.login({
        clientId,
        clientSecret,
      });

      // List all secrets from the project
      const secretsResponse = await this.client.secrets().listSecrets({
        projectId,
        environment,
        secretPath: '/',
      });

      if (secretsResponse && secretsResponse.secrets) {
        secretsResponse.secrets.forEach((secret) => {
          this.secrets.set(secret.secretKey, secret.secretValue);
        });
        this.logger.log(`Successfully loaded ${this.secrets.size} secrets from Infisical`);
        // Debug: log secret keys (not values)
        const secretKeys = Array.from(this.secrets.keys()).join(', ');
        this.logger.debug(`Loaded secret keys: ${secretKeys}`);
      }

      this.isInitialized = true;
    } catch (error) {
      this.logger.error('Failed to fetch secrets from Infisical', error);
      this.logger.warn('Falling back to environment variables');
      // Don't throw - allow fallback to process.env
      this.isInitialized = true;
    }
  }

  /**
   * Get a configuration value from Infisical or fall back to environment variable
   * This method is synchronous and will return env vars if Infisical hasn't loaded yet
   * @param key The configuration key
   * @param defaultValue Optional default value if key is not found
   */
  get<T = unknown>(key: string, defaultValue?: T): T {
    // First, try to get from Infisical secrets (if loaded)
    if (this.isInitialized && this.secrets.has(key)) {
      return this.parseValue(this.secrets.get(key)) as T;
    }

    // Fall back to process.env (always available)
    if (process.env[key] !== undefined) {
      return this.parseValue(process.env[key]) as T;
    }

    // Return default value if provided
    if (defaultValue !== undefined) {
      return defaultValue;
    }

    return undefined as T;
  }

  /**
   * Get a required configuration value, throw error if not found
   * @param key The configuration key
   */
  getOrThrow<T = unknown>(key: string): T {
    const value = this.get<T>(key);
    if (value === undefined) {
      throw new Error(`Configuration key "${key}" is required but not found`);
    }
    return value;
  }

  /**
   * Get all secrets as an object
   */
  getAll(): Record<string, string> {
    const allSecrets: Record<string, string> = {};

    // Add Infisical secrets
    this.secrets.forEach((value, key) => {
      allSecrets[key] = value;
    });

    // Add process.env (Infisical secrets take precedence)
    Object.keys(process.env).forEach((key) => {
      if (!allSecrets[key] && process.env[key] !== undefined) {
        allSecrets[key] = process.env[key];
      }
    });

    return allSecrets;
  }

  /**
   * Check if Infisical is properly initialized
   */
  isInfisicalEnabled(): boolean {
    return this.isInitialized && this.client !== undefined;
  }

  /**
   * Wait for Infisical initialization to complete
   * Factories should call this to ensure secrets are loaded
   */
  async waitForInit(): Promise<void> {
    await this.initPromise;
  }

  /**
   * Parse string values to appropriate types
   */
  private parseValue(value: string | undefined): unknown {
    if (value === undefined || value === null) {
      return undefined;
    }

    const stringValue = String(value);

    // Try to parse as boolean
    if (stringValue.toLowerCase() === 'true') return true;
    if (stringValue.toLowerCase() === 'false') return false;

    // Try to parse as number
    if (!isNaN(Number(stringValue)) && stringValue.trim() !== '') {
      return Number(stringValue);
    }

    // Try to parse as JSON (for arrays and objects)
    if (
      (stringValue.startsWith('{') && stringValue.endsWith('}')) ||
      (stringValue.startsWith('[') && stringValue.endsWith(']'))
    ) {
      try {
        return JSON.parse(stringValue);
      } catch {
        return stringValue;
      }
    }

    return stringValue;
  }
}

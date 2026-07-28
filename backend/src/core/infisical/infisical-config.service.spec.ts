import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { InfisicalConfigService } from './infisical-config.service';
import { InfisicalSDK } from '@infisical/sdk';

// Mock InfisicalSDK
jest.mock('@infisical/sdk');

describe('InfisicalConfigService', () => {
  let service: InfisicalConfigService;
  let mockClient: any;
  let mockAuth: any;
  let mockSecrets: any;

  // Store original env
  const originalEnv = process.env;

  beforeEach(async () => {
    // Reset env
    process.env = { ...originalEnv };
    delete process.env.INFISICAL_CLIENT_ID;
    delete process.env.INFISICAL_CLIENT_SECRET;
    delete process.env.INFISICAL_PROJECT_ID;
    delete process.env.INFISICAL_ENVIRONMENT;
    delete process.env.INFISICAL_SITE_URL;

    // Spy on logger to suppress output during tests (before service creation)
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();

    // Create mocks
    mockSecrets = {
      listSecrets: jest.fn(),
    };

    mockClient = {
      secrets: jest.fn().mockReturnValue(mockSecrets),
    };

    mockAuth = {
      universalAuth: {
        login: jest.fn().mockResolvedValue(mockClient),
      },
    };

    // Mock InfisicalSDK constructor
    (InfisicalSDK as jest.Mock).mockImplementation(() => ({
      auth: () => mockAuth,
    }));

    const module: TestingModule = await Test.createTestingModule({
      providers: [InfisicalConfigService],
    }).compile();

    service = module.get<InfisicalConfigService>(InfisicalConfigService);
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.clearAllMocks();
  });

  describe('onModuleInit - Initialization', () => {
    it('should initialize successfully with valid credentials', async () => {
      // Set env before creating service
      process.env.INFISICAL_CLIENT_ID = 'test-client-id';
      process.env.INFISICAL_CLIENT_SECRET = 'test-client-secret';
      process.env.INFISICAL_PROJECT_ID = 'test-project-id';
      process.env.NODE_ENV = 'development';

      mockSecrets.listSecrets.mockResolvedValue({
        secrets: [
          { secretKey: 'API_KEY', secretValue: 'test-api-key' },
          { secretKey: 'DATABASE_URL', secretValue: 'postgresql://localhost:5432' },
        ],
      });

      // Create new service instance with env vars set
      const module: TestingModule = await Test.createTestingModule({
        providers: [InfisicalConfigService],
      }).compile();
      const testService = module.get<InfisicalConfigService>(InfisicalConfigService);

      // Wait for initialization
      await testService.onModuleInit();

      expect(mockAuth.universalAuth.login).toHaveBeenCalledWith({
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
      });

      expect(mockSecrets.listSecrets).toHaveBeenCalledWith({
        projectId: 'test-project-id',
        environment: 'development',
        secretPath: '/',
      });

      expect(testService.get('API_KEY')).toBe('test-api-key');
      expect(testService.get('DATABASE_URL')).toBe('postgresql://localhost:5432');
    });

    it('should not re-initialize if already initialized', async () => {
      process.env.INFISICAL_CLIENT_ID = 'test-client-id';
      process.env.INFISICAL_CLIENT_SECRET = 'test-client-secret';
      process.env.INFISICAL_PROJECT_ID = 'test-project-id';

      mockSecrets.listSecrets.mockResolvedValue({ secrets: [] });

      // First initialization
      await service.onModuleInit();
      const firstCallCount = mockAuth.universalAuth.login.mock.calls.length;

      // Try to initialize again
      await service.onModuleInit();
      const secondCallCount = mockAuth.universalAuth.login.mock.calls.length;

      // Should not call login again
      expect(secondCallCount).toBe(firstCallCount);
    });

    it('should use custom environment when INFISICAL_ENVIRONMENT is set', async () => {
      process.env.INFISICAL_CLIENT_ID = 'test-client-id';
      process.env.INFISICAL_CLIENT_SECRET = 'test-client-secret';
      process.env.INFISICAL_PROJECT_ID = 'test-project-id';
      process.env.INFISICAL_ENVIRONMENT = 'production';

      mockSecrets.listSecrets.mockResolvedValue({ secrets: [] });

      const module: TestingModule = await Test.createTestingModule({
        providers: [InfisicalConfigService],
      }).compile();
      const testService = module.get<InfisicalConfigService>(InfisicalConfigService);
      await testService.onModuleInit();

      expect(mockSecrets.listSecrets).toHaveBeenCalledWith({
        projectId: 'test-project-id',
        environment: 'production',
        secretPath: '/',
      });
    });

    it('should use custom site URL when INFISICAL_SITE_URL is set', async () => {
      process.env.INFISICAL_CLIENT_ID = 'test-client-id';
      process.env.INFISICAL_CLIENT_SECRET = 'test-client-secret';
      process.env.INFISICAL_PROJECT_ID = 'test-project-id';
      process.env.INFISICAL_SITE_URL = 'https://custom.infisical.com';

      mockSecrets.listSecrets.mockResolvedValue({ secrets: [] });

      const module: TestingModule = await Test.createTestingModule({
        providers: [InfisicalConfigService],
      }).compile();
      const testService = module.get<InfisicalConfigService>(InfisicalConfigService);
      await testService.onModuleInit();

      expect(InfisicalSDK).toHaveBeenCalledWith({
        siteUrl: 'https://custom.infisical.com',
      });
    });

    it('should fall back to environment variables when credentials are missing', async () => {
      await service.onModuleInit();

      expect(mockAuth.universalAuth.login).not.toHaveBeenCalled();
      expect(Logger.prototype.warn).toHaveBeenCalledWith(
        'Infisical credentials not found. Falling back to environment variables.',
      );
    });

    it('should handle missing PROJECT_ID gracefully', async () => {
      process.env.INFISICAL_CLIENT_ID = 'test-client-id';
      process.env.INFISICAL_CLIENT_SECRET = 'test-client-secret';
      // No PROJECT_ID set

      const module: TestingModule = await Test.createTestingModule({
        providers: [InfisicalConfigService],
      }).compile();
      const testService = module.get<InfisicalConfigService>(InfisicalConfigService);

      // Service should handle error internally
      await testService.onModuleInit();

      // Should log error and fall back to env vars
      expect(Logger.prototype.error).toHaveBeenCalledWith(
        'INFISICAL_PROJECT_ID is required when using Infisical',
      );
      expect(Logger.prototype.warn).toHaveBeenCalledWith(
        'Application will continue using environment variables as fallback',
      );
    });

    it('should handle authentication failure gracefully', async () => {
      process.env.INFISICAL_CLIENT_ID = 'test-client-id';
      process.env.INFISICAL_CLIENT_SECRET = 'test-client-secret';
      process.env.INFISICAL_PROJECT_ID = 'test-project-id';

      // Mock the SDK to throw error during auth
      const mockSdk = {
        auth: () => ({
          universalAuth: {
            login: jest.fn().mockRejectedValue(new Error('Authentication failed')),
          },
        }),
      };
      (InfisicalSDK as jest.Mock).mockImplementation(() => mockSdk);

      // Create a new service instance to use the failing mock
      const module: TestingModule = await Test.createTestingModule({
        providers: [InfisicalConfigService],
      }).compile();
      const failingService = module.get<InfisicalConfigService>(InfisicalConfigService);

      await failingService.onModuleInit();

      // The error is caught in the inner try-catch block, so it logs "Failed to fetch secrets"
      expect(Logger.prototype.error).toHaveBeenCalledWith(
        'Failed to fetch secrets from Infisical',
        expect.any(Error),
      );
      expect(Logger.prototype.warn).toHaveBeenCalledWith('Falling back to environment variables');
    });

    it('should handle secret fetching failure gracefully', async () => {
      process.env.INFISICAL_CLIENT_ID = 'test-client-id';
      process.env.INFISICAL_CLIENT_SECRET = 'test-client-secret';
      process.env.INFISICAL_PROJECT_ID = 'test-project-id';

      // Create fresh mocks that fail
      const failingMockSecrets = {
        listSecrets: jest.fn().mockRejectedValue(new Error('Failed to fetch secrets')),
      };

      const failingMockClient = {
        secrets: jest.fn().mockReturnValue(failingMockSecrets),
      };

      const failingMockAuth = {
        universalAuth: {
          login: jest.fn().mockResolvedValue(failingMockClient),
        },
      };

      // Mock InfisicalSDK constructor for this test
      (InfisicalSDK as jest.Mock).mockImplementation(() => ({
        auth: () => failingMockAuth,
      }));

      // Create a new service instance with the failing mock
      const module: TestingModule = await Test.createTestingModule({
        providers: [InfisicalConfigService],
      }).compile();
      const failingService = module.get<InfisicalConfigService>(InfisicalConfigService);

      await failingService.onModuleInit();

      expect(Logger.prototype.error).toHaveBeenCalledWith(
        'Failed to fetch secrets from Infisical',
        expect.any(Error),
      );
      expect(Logger.prototype.warn).toHaveBeenCalledWith('Falling back to environment variables');
    });
  });

  describe('get()', () => {
    let testService: InfisicalConfigService;

    beforeEach(async () => {
      process.env.INFISICAL_CLIENT_ID = 'test-client-id';
      process.env.INFISICAL_CLIENT_SECRET = 'test-client-secret';
      process.env.INFISICAL_PROJECT_ID = 'test-project-id';

      mockSecrets.listSecrets.mockResolvedValue({
        secrets: [
          { secretKey: 'INFISICAL_SECRET', secretValue: 'from-infisical' },
          { secretKey: 'BOOLEAN_VALUE', secretValue: 'true' },
          { secretKey: 'NUMBER_VALUE', secretValue: '42' },
          { secretKey: 'JSON_OBJECT', secretValue: '{"key":"value"}' },
          { secretKey: 'JSON_ARRAY', secretValue: '[1,2,3]' },
        ],
      });

      const module: TestingModule = await Test.createTestingModule({
        providers: [InfisicalConfigService],
      }).compile();
      testService = module.get<InfisicalConfigService>(InfisicalConfigService);
      await testService.onModuleInit();
    });

    it('should return value from Infisical secrets', () => {
      expect(testService.get('INFISICAL_SECRET')).toBe('from-infisical');
    });

    it('should fall back to process.env when key is not in Infisical', () => {
      process.env.ENV_ONLY_SECRET = 'from-env';
      expect(testService.get('ENV_ONLY_SECRET')).toBe('from-env');
    });

    it('should prefer Infisical secrets over process.env', () => {
      process.env.INFISICAL_SECRET = 'from-env';
      expect(testService.get('INFISICAL_SECRET')).toBe('from-infisical');
    });

    it('should return default value when key is not found', () => {
      expect(testService.get('NON_EXISTENT_KEY', 'default-value')).toBe('default-value');
    });

    it('should return undefined when key is not found and no default provided', () => {
      expect(testService.get('NON_EXISTENT_KEY')).toBeUndefined();
    });

    it('should parse boolean values correctly', () => {
      expect(testService.get('BOOLEAN_VALUE')).toBe(true);
    });

    it('should parse number values correctly', () => {
      expect(testService.get('NUMBER_VALUE')).toBe(42);
    });

    it('should parse JSON objects correctly', () => {
      expect(testService.get('JSON_OBJECT')).toEqual({ key: 'value' });
    });

    it('should parse JSON arrays correctly', () => {
      expect(testService.get('JSON_ARRAY')).toEqual([1, 2, 3]);
    });

    it('should return string value when JSON parsing fails', () => {
      process.env.INVALID_JSON = '{invalid json}';
      expect(testService.get('INVALID_JSON')).toBe('{invalid json}');
    });
  });

  describe('getOrThrow()', () => {
    let testService: InfisicalConfigService;

    beforeEach(async () => {
      process.env.INFISICAL_CLIENT_ID = 'test-client-id';
      process.env.INFISICAL_CLIENT_SECRET = 'test-client-secret';
      process.env.INFISICAL_PROJECT_ID = 'test-project-id';

      mockSecrets.listSecrets.mockResolvedValue({
        secrets: [{ secretKey: 'REQUIRED_SECRET', secretValue: 'required-value' }],
      });

      const module: TestingModule = await Test.createTestingModule({
        providers: [InfisicalConfigService],
      }).compile();
      testService = module.get<InfisicalConfigService>(InfisicalConfigService);
      await testService.onModuleInit();
    });

    it('should return value when key exists', () => {
      expect(testService.getOrThrow('REQUIRED_SECRET')).toBe('required-value');
    });

    it('should throw error when key does not exist', () => {
      expect(() => testService.getOrThrow('NON_EXISTENT_KEY')).toThrow(
        'Configuration key "NON_EXISTENT_KEY" is required but not found',
      );
    });
  });

  describe('getAll()', () => {
    let testService: InfisicalConfigService;

    beforeEach(async () => {
      process.env.INFISICAL_CLIENT_ID = 'test-client-id';
      process.env.INFISICAL_CLIENT_SECRET = 'test-client-secret';
      process.env.INFISICAL_PROJECT_ID = 'test-project-id';
      process.env.ENV_VAR = 'env-value';

      mockSecrets.listSecrets.mockResolvedValue({
        secrets: [
          { secretKey: 'INFISICAL_VAR', secretValue: 'infisical-value' },
          { secretKey: 'SHARED_VAR', secretValue: 'from-infisical' },
        ],
      });

      const module: TestingModule = await Test.createTestingModule({
        providers: [InfisicalConfigService],
      }).compile();
      testService = module.get<InfisicalConfigService>(InfisicalConfigService);
      await testService.onModuleInit();
    });

    it('should return all secrets from both Infisical and process.env', () => {
      const allSecrets = testService.getAll();

      expect(allSecrets['INFISICAL_VAR']).toBe('infisical-value');
      expect(allSecrets['ENV_VAR']).toBe('env-value');
    });

    it('should prefer Infisical secrets over process.env in getAll()', () => {
      process.env.SHARED_VAR = 'from-env';
      const allSecrets = testService.getAll();

      expect(allSecrets['SHARED_VAR']).toBe('from-infisical');
    });
  });

  describe('isInfisicalEnabled()', () => {
    it('should return true when Infisical is properly initialized', async () => {
      process.env.INFISICAL_CLIENT_ID = 'test-client-id';
      process.env.INFISICAL_CLIENT_SECRET = 'test-client-secret';
      process.env.INFISICAL_PROJECT_ID = 'test-project-id';

      mockSecrets.listSecrets.mockResolvedValue({ secrets: [] });

      const module: TestingModule = await Test.createTestingModule({
        providers: [InfisicalConfigService],
      }).compile();
      const testService = module.get<InfisicalConfigService>(InfisicalConfigService);
      await testService.onModuleInit();

      expect(testService.isInfisicalEnabled()).toBe(true);
    });

    it('should return false when Infisical credentials are not provided', async () => {
      await service.onModuleInit();

      expect(service.isInfisicalEnabled()).toBe(false);
    });

    it('should return false when Infisical initialization fails', async () => {
      process.env.INFISICAL_CLIENT_ID = 'test-client-id';
      process.env.INFISICAL_CLIENT_SECRET = 'test-client-secret';
      process.env.INFISICAL_PROJECT_ID = 'test-project-id';

      mockAuth.universalAuth.login.mockRejectedValue(new Error('Auth failed'));

      await service.onModuleInit();

      expect(service.isInfisicalEnabled()).toBe(false);
    });
  });

  describe('parseValue() - value parsing', () => {
    beforeEach(async () => {
      // Skip Infisical initialization for these tests
      await service.onModuleInit();
    });

    it('should parse "true" string as boolean true', () => {
      process.env.BOOL_TRUE = 'true';
      expect(service.get('BOOL_TRUE')).toBe(true);
    });

    it('should parse "false" string as boolean false', () => {
      process.env.BOOL_FALSE = 'false';
      expect(service.get('BOOL_FALSE')).toBe(false);
    });

    it('should parse "TRUE" as boolean (case insensitive)', () => {
      process.env.BOOL_UPPER = 'TRUE';
      expect(service.get('BOOL_UPPER')).toBe(true);
    });

    it('should parse numeric strings as numbers', () => {
      process.env.NUMBER = '123';
      expect(service.get('NUMBER')).toBe(123);
    });

    it('should parse decimal numbers', () => {
      process.env.DECIMAL = '123.45';
      expect(service.get('DECIMAL')).toBe(123.45);
    });

    it('should parse negative numbers', () => {
      process.env.NEGATIVE = '-42';
      expect(service.get('NEGATIVE')).toBe(-42);
    });

    it('should not parse empty string as number', () => {
      process.env.EMPTY = '';
      expect(service.get('EMPTY')).toBe('');
    });

    it('should parse JSON objects', () => {
      process.env.JSON_OBJ = '{"name":"test","value":123}';
      expect(service.get('JSON_OBJ')).toEqual({ name: 'test', value: 123 });
    });

    it('should parse JSON arrays', () => {
      process.env.JSON_ARR = '["a","b","c"]';
      expect(service.get('JSON_ARR')).toEqual(['a', 'b', 'c']);
    });

    it('should return string for invalid JSON', () => {
      process.env.INVALID = '{not valid json}';
      expect(service.get('INVALID')).toBe('{not valid json}');
    });

    it('should handle undefined values', () => {
      expect(service.get('UNDEFINED_KEY')).toBeUndefined();
    });

    it('should handle null values', () => {
      process.env.NULL_VALUE = null as any;
      expect(service.get('NULL_VALUE')).toBeUndefined();
    });

    it('should return plain strings for non-special values', () => {
      process.env.PLAIN_STRING = 'hello world';
      expect(service.get('PLAIN_STRING')).toBe('hello world');
    });

    it('should handle whitespace strings', () => {
      process.env.WHITESPACE = '   ';
      expect(service.get('WHITESPACE')).toBe('   ');
    });

    it('should handle string with only zeros', () => {
      process.env.ZERO_STRING = '0';
      expect(service.get('ZERO_STRING')).toBe(0);
    });
  });
});

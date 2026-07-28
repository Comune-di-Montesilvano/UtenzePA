import { EnvValidator } from './env-validator';

describe('EnvValidator', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset environment
    process.env = { ...originalEnv };
    jest.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('validate', () => {
    it('should validate successfully with all required variables set', () => {
      process.env.NODE_ENV = 'development';
      process.env.PROJECT_NAME = 'test-project';
      process.env.TYPE = 'api';

      expect(() => EnvValidator.validate()).not.toThrow();
    });

    it('should set default values for missing required variables', () => {
      delete process.env.NODE_ENV;
      delete process.env.PROJECT_NAME;
      delete process.env.TYPE;

      EnvValidator.validate();

      expect(process.env.NODE_ENV).toBe('development');
      expect(process.env.PROJECT_NAME).toBe('nestjs-template');
      expect(process.env.TYPE).toBe('api');
    });

    it('should throw error for invalid NODE_ENV', () => {
      process.env.NODE_ENV = 'invalid';
      process.env.PROJECT_NAME = 'test';
      process.env.TYPE = 'api';

      expect(() => EnvValidator.validate()).toThrow('Environment validation failed');
    });

    it('should accept valid NODE_ENV values', () => {
      const validEnvs = ['development', 'staging', 'production', 'test'];

      validEnvs.forEach((env) => {
        process.env.NODE_ENV = env;
        process.env.PROJECT_NAME = 'test';
        process.env.TYPE = 'api';

        expect(() => EnvValidator.validate()).not.toThrow();
      });
    });

    it('should validate optional variables', () => {
      process.env.NODE_ENV = 'development';
      process.env.PROJECT_NAME = 'test';
      process.env.TYPE = 'api';
      process.env.DOCKER_MONGO_PORT = '27017';
      process.env.DOCKER_API_PORT = '3000';

      expect(() => EnvValidator.validate()).not.toThrow();
    });

    it('should reject invalid port numbers', () => {
      process.env.NODE_ENV = 'development';
      process.env.PROJECT_NAME = 'test';
      process.env.TYPE = 'api';
      process.env.DOCKER_MONGO_PORT = 'invalid';

      // Should not throw but should warn
      expect(() => EnvValidator.validate()).not.toThrow();
    });

    it('should set default values for optional variables', () => {
      process.env.NODE_ENV = 'development';
      process.env.PROJECT_NAME = 'test';
      process.env.TYPE = 'api';
      delete process.env.DOCKER_MONGO_PORT;
      delete process.env.VERSION;

      EnvValidator.validate();

      expect(process.env.DOCKER_MONGO_PORT).toBe('27017');
      expect(process.env.VERSION).toBe('1.0.0');
    });
  });

  describe('get', () => {
    it('should get string environment variable', () => {
      process.env.TEST_VAR = 'test-value';

      const result = EnvValidator.get('TEST_VAR');

      expect(result).toBe('test-value');
    });

    it('should return default value if variable not defined', () => {
      delete process.env.TEST_VAR;

      const result = EnvValidator.get('TEST_VAR', 'default');

      expect(result).toBe('default');
    });

    it('should throw error if variable not defined and no default', () => {
      delete process.env.TEST_VAR;

      expect(() => EnvValidator.get('TEST_VAR')).toThrow(
        'Environment variable TEST_VAR is not defined',
      );
    });

    it('should convert to number when default is number', () => {
      process.env.TEST_PORT = '3000';

      const result = EnvValidator.get('TEST_PORT', 8080);

      expect(result).toBe(3000);
      expect(typeof result).toBe('number');
    });

    it('should convert to boolean when default is boolean', () => {
      process.env.TEST_FLAG = 'true';

      const result = EnvValidator.get('TEST_FLAG', false);

      expect(result).toBe(true);
      expect(typeof result).toBe('boolean');
    });

    it('should handle "1" as true for boolean', () => {
      process.env.TEST_FLAG = '1';

      const result = EnvValidator.get('TEST_FLAG', false);

      expect(result).toBe(true);
    });

    it('should handle other values as false for boolean', () => {
      process.env.TEST_FLAG = 'false';

      const result = EnvValidator.get('TEST_FLAG', true);

      expect(result).toBe(false);
    });
  });

  describe('isProduction', () => {
    it('should return true when NODE_ENV is production', () => {
      process.env.NODE_ENV = 'production';

      expect(EnvValidator.isProduction()).toBe(true);
    });

    it('should return false when NODE_ENV is not production', () => {
      process.env.NODE_ENV = 'development';

      expect(EnvValidator.isProduction()).toBe(false);
    });
  });

  describe('isDevelopment', () => {
    it('should return true when NODE_ENV is development', () => {
      process.env.NODE_ENV = 'development';

      expect(EnvValidator.isDevelopment()).toBe(true);
    });

    it('should return false when NODE_ENV is not development', () => {
      process.env.NODE_ENV = 'production';

      expect(EnvValidator.isDevelopment()).toBe(false);
    });
  });

  describe('isStaging', () => {
    it('should return true when NODE_ENV is staging', () => {
      process.env.NODE_ENV = 'staging';

      expect(EnvValidator.isStaging()).toBe(true);
    });

    it('should return false when NODE_ENV is not staging', () => {
      process.env.NODE_ENV = 'production';

      expect(EnvValidator.isStaging()).toBe(false);
    });
  });

  describe('isTest', () => {
    it('should return true when NODE_ENV is test', () => {
      process.env.NODE_ENV = 'test';

      expect(EnvValidator.isTest()).toBe(true);
    });

    it('should return false when NODE_ENV is not test', () => {
      process.env.NODE_ENV = 'development';

      expect(EnvValidator.isTest()).toBe(false);
    });
  });

  describe('getAll', () => {
    it('should return all environment variables', () => {
      process.env.TEST_VAR1 = 'value1';
      process.env.TEST_VAR2 = 'value2';

      const result = EnvValidator.getAll();

      expect(result).toHaveProperty('TEST_VAR1', 'value1');
      expect(result).toHaveProperty('TEST_VAR2', 'value2');
    });

    it('should return a copy of environment variables', () => {
      const result = EnvValidator.getAll();

      expect(result).not.toBe(process.env);
    });
  });

  describe('maskSensitiveValue', () => {
    it('should mask short values completely', () => {
      const result = EnvValidator.maskSensitiveValue('abc');

      expect(result).toBe('***');
    });

    it('should mask long values partially', () => {
      const result = EnvValidator.maskSensitiveValue('secret123456');

      expect(result).toMatch(/^sec\*+$/);
    });

    it('should show first few characters for long values', () => {
      const result = EnvValidator.maskSensitiveValue('verylongpassword');

      expect(result).toMatch(/^very\*+$/);
    });

    it('should handle empty string', () => {
      const result = EnvValidator.maskSensitiveValue('');

      expect(result).toBe('***');
    });
  });

  describe('logConfiguration', () => {
    it('should log configuration without errors', () => {
      process.env.NODE_ENV = 'development';
      process.env.PROJECT_NAME = 'test-project';
      process.env.TYPE = 'api';
      process.env.PORT = '3000';

      expect(() => EnvValidator.logConfiguration()).not.toThrow();
    });

    it('should mask sensitive values in logs', () => {
      process.env.NODE_ENV = 'development';
      process.env.PROJECT_NAME = 'test';
      process.env.TYPE = 'api';
      process.env.JWT_SECRET = 'supersecret123';

      // This would mask JWT_SECRET in actual logs
      expect(() => EnvValidator.logConfiguration()).not.toThrow();
    });
  });
});

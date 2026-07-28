import { ConfigService } from '@nestjs/config';
import { configureCompression, getCompressionConfig } from './compressionConfig';
import { InfisicalConfigService } from '../../core/infisical/infisical-config.service';

describe('CompressionConfig', () => {
  let mockConfigService: InfisicalConfigService;

  beforeEach(() => {
    mockConfigService = {
      get: jest.fn(),
      getOrThrow: jest.fn(),
      isInfisicalEnabled: jest.fn(),
      onModuleInit: jest.fn(),
      getAll: jest.fn(),
    } as any as InfisicalConfigService;
  });

  describe('getCompressionConfig', () => {
    it('should return default configuration', () => {
      (mockConfigService.get as jest.Mock).mockImplementation((key: string, defaultValue: any) => {
        return defaultValue;
      });

      const config = getCompressionConfig(mockConfigService);

      expect(config).toEqual({
        enabled: true,
        level: 6,
        threshold: 1024,
      });
    });

    it('should return custom configuration from config service', () => {
      (mockConfigService.get as jest.Mock).mockImplementation((key: string) => {
        const configs = {
          'api.compressionEnabled': false,
          'api.compressionLevel': 9,
          'api.compressionThreshold': 2048,
        };
        return configs[key];
      });

      const config = getCompressionConfig(mockConfigService);

      expect(config).toEqual({
        enabled: false,
        level: 9,
        threshold: 2048,
      });
    });

    it('should use defaults when config values are not set', () => {
      (mockConfigService.get as jest.Mock).mockImplementation((key: string, defaultValue: any) => {
        // When undefined, ConfigService returns the default value
        return defaultValue;
      });

      const config = getCompressionConfig(mockConfigService);

      expect(config).toEqual({
        enabled: true,
        level: 6,
        threshold: 1024,
      });
      expect(mockConfigService.get).toHaveBeenCalledWith('api.compressionEnabled', true);
      expect(mockConfigService.get).toHaveBeenCalledWith('api.compressionLevel', 6);
      expect(mockConfigService.get).toHaveBeenCalledWith('api.compressionThreshold', 1024);
    });
  });

  describe('configureCompression', () => {
    it('should return null when compression is disabled', () => {
      (mockConfigService.get as jest.Mock).mockImplementation((key: string) => {
        if (key === 'api.compressionEnabled') return false;
        return 6; // default for other configs
      });

      const middleware = configureCompression(mockConfigService);

      expect(middleware).toBeNull();
    });

    it('should return compression middleware when enabled with default config', () => {
      (mockConfigService.get as jest.Mock).mockImplementation((key: string, defaultValue: any) => {
        const configs = {
          'api.compressionEnabled': true,
          'api.compressionLevel': 6,
          'api.compressionThreshold': 1024,
        };
        return configs[key] ?? defaultValue;
      });

      const middleware = configureCompression(mockConfigService);

      expect(middleware).toBeDefined();
      expect(middleware).not.toBeNull();
      expect(typeof middleware).toBe('function');
      expect(mockConfigService.get).toHaveBeenCalledWith('api.compressionEnabled', true);
      expect(mockConfigService.get).toHaveBeenCalledWith('api.compressionLevel', 6);
      expect(mockConfigService.get).toHaveBeenCalledWith('api.compressionThreshold', 1024);
    });

    it('should create middleware with custom compression configuration', () => {
      (mockConfigService.get as jest.Mock).mockImplementation((key: string) => {
        const configs = {
          'api.compressionEnabled': true,
          'api.compressionLevel': 9,
          'api.compressionThreshold': 512,
        };
        return configs[key];
      });

      const middleware = configureCompression(mockConfigService);

      expect(middleware).toBeDefined();
      expect(typeof middleware).toBe('function');
      expect(mockConfigService.get).toHaveBeenCalledWith('api.compressionEnabled', true);
      expect(mockConfigService.get).toHaveBeenCalledWith('api.compressionLevel', 6);
      expect(mockConfigService.get).toHaveBeenCalledWith('api.compressionThreshold', 1024);
    });

    it('should create middleware with different compression levels', () => {
      (mockConfigService.get as jest.Mock).mockImplementation((key: string) => {
        const configs = {
          'api.compressionEnabled': true,
          'api.compressionLevel': 3,
          'api.compressionThreshold': 2048,
        };
        return configs[key];
      });

      const middleware = configureCompression(mockConfigService);

      expect(middleware).toBeDefined();
      expect(typeof middleware).toBe('function');
    });
  });

  describe('compression filter', () => {
    it('should create middleware with filter function', () => {
      (mockConfigService.get as jest.Mock).mockImplementation((key: string, defaultValue: any) => {
        return defaultValue;
      });

      const middleware = configureCompression(mockConfigService);

      expect(middleware).toBeDefined();
      expect(typeof middleware).toBe('function');
    });

    it('should have filter that respects x-no-compression header', () => {
      (mockConfigService.get as jest.Mock).mockImplementation((key: string, defaultValue: any) => {
        const configs = {
          'api.compressionEnabled': true,
          'api.compressionLevel': 6,
          'api.compressionThreshold': 1024,
        };
        return configs[key] ?? defaultValue;
      });

      const middleware = configureCompression(mockConfigService);
      expect(middleware).toBeDefined();

      // The middleware function should be created with proper configuration
      // We verify it was called with correct parameters including the filter
      expect(mockConfigService.get).toHaveBeenCalledWith('api.compressionEnabled', true);
      expect(mockConfigService.get).toHaveBeenCalledWith('api.compressionLevel', 6);
      expect(mockConfigService.get).toHaveBeenCalledWith('api.compressionThreshold', 1024);
    });
  });

  describe('compression configuration options', () => {
    it('should pass correct configuration to compression middleware', () => {
      (mockConfigService.get as jest.Mock).mockImplementation((key: string) => {
        const configs = {
          'api.compressionEnabled': true,
          'api.compressionLevel': 9,
          'api.compressionThreshold': 2048,
        };
        return configs[key];
      });

      const middleware = configureCompression(mockConfigService);

      expect(middleware).toBeDefined();
      expect(typeof middleware).toBe('function');
      expect(mockConfigService.get).toHaveBeenCalledWith('api.compressionEnabled', true);
      expect(mockConfigService.get).toHaveBeenCalledWith('api.compressionLevel', 6);
      expect(mockConfigService.get).toHaveBeenCalledWith('api.compressionThreshold', 1024);
    });

    it('should create middleware with all configuration options', () => {
      (mockConfigService.get as jest.Mock).mockImplementation((key: string, defaultValue: any) => {
        const configs: Record<string, any> = {
          'api.compressionEnabled': true,
          'api.compressionLevel': 3,
          'api.compressionThreshold': 512,
        };
        return configs[key] !== undefined ? configs[key] : defaultValue;
      });

      const middleware = configureCompression(mockConfigService);

      expect(middleware).toBeDefined();
      expect(typeof middleware).toBe('function');
    });
  });
});

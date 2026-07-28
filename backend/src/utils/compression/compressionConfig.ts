import { InfisicalConfigService } from '@core/infisical/infisical-config.service';
import * as compression from 'compression';

/**
 * Configuration options for HTTP compression middleware
 */
export interface CompressionConfig {
  enabled: boolean;
  level: number;
  threshold: number;
}

/**
 * Generates compression middleware configuration based on application config
 *
 * @param infisicalConfig - InfisicalConfigService instance
 * @returns Compression middleware or null if disabled
 */
export const configureCompression = (infisicalConfig: InfisicalConfigService) => {
  const config = getCompressionConfig(infisicalConfig);

  if (!config.enabled) {
    console.info('Compression disabled');
    return null;
  }

  return compression({
    level: config.level,
    threshold: config.threshold,
    // Only compress responses with these MIME types
    filter: (req, res) => {
      // Allow clients to opt-out of compression
      if (req.headers['x-no-compression']) {
        return false;
      }
      // Use default compression filter
      return compression.filter(req, res);
    },
  });
};

/**
 * Retrieves compression configuration from ConfigService
 *
 * @param infisicalConfig - InfisicalConfigService instance
 * @returns CompressionConfig object with enabled, level, and threshold
 */
export const getCompressionConfig = (
  infisicalConfig: InfisicalConfigService,
): CompressionConfig => {
  return {
    enabled: infisicalConfig.get<boolean>('api.compressionEnabled', true),
    level: infisicalConfig.get<number>('api.compressionLevel', 6),
    threshold: infisicalConfig.get<number>('api.compressionThreshold', 1024),
  };
};

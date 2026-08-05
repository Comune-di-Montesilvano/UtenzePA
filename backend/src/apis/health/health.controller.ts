import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Public } from '@common/decorators/public.decorator';
import { HealthService } from './health.service';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private healthService: HealthService) {}

  /**
   * Simple health check - returns if system is up
   */
  @Get()
  @Public()
  @ApiOperation({ summary: 'Health check - returns if system is up' })
  @ApiResponse({ status: 200, description: 'System is healthy' })
  check() {
    return this.healthService.check();
  }

  /**
   * Liveness probe for Kubernetes
   */
  @Get('liveness')
  @Public()
  @ApiOperation({ summary: 'Liveness probe for Kubernetes' })
  @ApiResponse({ status: 200, description: 'Application is alive' })
  liveness() {
    return { status: 'ok' };
  }

  /**
   * Readiness probe for Kubernetes
   */
  @Get('readiness')
  @Public()
  @ApiOperation({ summary: 'Readiness probe for Kubernetes' })
  @ApiResponse({ status: 200, description: 'Application is ready' })
  @ApiResponse({ status: 503, description: 'Application is not ready (es. database irraggiungibile)' })
  async readiness() {
    const result = await this.healthService.isReady();
    if (result.status !== 'ready') {
      throw new ServiceUnavailableException(result);
    }
    return result;
  }
}

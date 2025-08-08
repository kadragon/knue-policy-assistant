import { Request, Response } from 'express';
import { getServices } from '../services';
import { HealthCheckResponse } from '../types';
import { DateUtils } from '../utils';

export class HealthController {
  private startTime: number;

  constructor() {
    this.startTime = Date.now();
  }

  // Health check endpoint
  async healthCheck(_req: Request, res: Response): Promise<void> {
    try {
      const services = getServices();
      const healthStatus = await services.healthCheck();

      const response: HealthCheckResponse = {
        status: healthStatus.overall ? 'healthy' : 'unhealthy',
        services: {
          firestore: healthStatus.firestore ? 'connected' : 'disconnected',
          qdrant: healthStatus.qdrant ? 'connected' : 'disconnected',
          openai: healthStatus.openai ? 'connected' : 'disconnected'
        },
        version: process.env['npm_package_version'] || '1.0.0',
        uptime: Date.now() - this.startTime,
        timestamp: DateUtils.formatTimestamp()
      };

      const statusCode = response.status === 'healthy' ? 200 : 503;
      res.status(statusCode).json(response);
    } catch (error) {
      console.error('Health check error:', error);
      
      const response: HealthCheckResponse = {
        status: 'unhealthy',
        services: {
          firestore: 'error',
          qdrant: 'error',
          openai: 'error'
        },
        version: process.env['npm_package_version'] || '1.0.0',
        uptime: Date.now() - this.startTime,
        timestamp: DateUtils.formatTimestamp()
      };

      res.status(503).json(response);
    }
  }
}
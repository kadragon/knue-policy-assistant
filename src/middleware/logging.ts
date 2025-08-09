import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { createLogger } from '../services/logger';

const logger = createLogger('http');

// Extend Express Request to include correlation ID
declare global {
  namespace Express {
    interface Request {
      correlationId: string;
      startTime: number;
      userId?: string;
      chatId?: string;
    }
  }
}

/**
 * Correlation ID middleware
 * Adds a unique correlation ID to each request for tracking across services
 */
export function correlationIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Get correlation ID from header or generate new one
  req.correlationId = req.headers['x-correlation-id'] as string || uuidv4();
  req.startTime = Date.now();
  
  // Add correlation ID to response headers
  res.setHeader('x-correlation-id', req.correlationId);
  
  next();
}

/**
 * Request logging middleware
 * Logs all HTTP requests with structured logging
 */
export function requestLoggingMiddleware(req: Request, res: Response, next: NextFunction): void {
  const { method, path, correlationId, startTime } = req;
  
  // Extract user context if available
  if (req.body && req.body.message && req.body.message.chat) {
    req.chatId = req.body.message.chat.id?.toString();
    req.userId = req.body.message.from?.id?.toString();
  }
  
  // Log request start
  logger.info('http-request-start', `${method} ${path} started`, {
    correlationId,
    method,
    path,
    userId: req.userId,
    chatId: req.chatId,
    userAgent: req.headers['user-agent'],
    contentLength: req.headers['content-length'],
    ip: req.ip || req.connection.remoteAddress
  });
  
  // Override response.json to capture response data
  const originalJson = res.json.bind(res);
  res.json = function(data: any) {
    const duration = Date.now() - startTime;
    const { statusCode } = res;
    
    // Log request completion
    logger.logRequest(
      'http-request-complete',
      method,
      path,
      statusCode,
      duration,
      correlationId,
      req.userId,
      {
        chatId: req.chatId,
        responseSize: JSON.stringify(data).length,
        ip: req.ip || req.connection.remoteAddress
      }
    );
    
    return originalJson(data);
  };
  
  // Override response.send for non-JSON responses
  const originalSend = res.send.bind(res);
  res.send = function(data: any) {
    const duration = Date.now() - startTime;
    const { statusCode } = res;
    
    // Only log if not already logged by json method
    if (!res.headersSent || !res.getHeader('content-type')?.toString().includes('application/json')) {
      logger.logRequest(
        'http-request-complete',
        method,
        path,
        statusCode,
        duration,
        correlationId,
        req.userId,
        {
          chatId: req.chatId,
          responseSize: typeof data === 'string' ? data.length : JSON.stringify(data).length,
          ip: req.ip || req.connection.remoteAddress
        }
      );
    }
    
    return originalSend(data);
  };
  
  next();
}

/**
 * Error logging middleware
 * Captures and logs all unhandled errors with structured logging
 */
export function errorLoggingMiddleware(error: any, req: Request, res: Response, next: NextFunction): void {
  const { method, path, correlationId, startTime, userId, chatId } = req;
  const duration = Date.now() - startTime;
  const statusCode = error.status || error.statusCode || 500;
  
  // Log the error with full context
  logger.error(
    'http-request-error',
    `${method} ${path} failed with ${error.message}`,
    error,
    {
      correlationId,
      method,
      path,
      statusCode,
      duration,
      userId,
      chatId,
      ip: req.ip || req.connection.remoteAddress,
      userAgent: req.headers['user-agent']
    }
  );
  
  // Send error response
  if (!res.headersSent) {
    res.status(statusCode).json({
      error: {
        message: error.message || 'Internal Server Error',
        correlationId,
        timestamp: new Date().toISOString()
      }
    });
  }
  
  next();
}

/**
 * Performance monitoring middleware
 * Monitors slow requests and memory usage
 */
export function performanceMiddleware(req: Request, res: Response, next: NextFunction): void {
  const startMemory = process.memoryUsage();
  
  // Check for slow requests on response finish
  res.on('finish', () => {
    const duration = Date.now() - req.startTime;
    const endMemory = process.memoryUsage();
    
    // Log slow requests (> 2 seconds)
    if (duration > 2000) {
      logger.warn('http-slow-request', `Slow request detected: ${req.method} ${req.path}`, {
        correlationId: req.correlationId,
        duration,
        method: req.method,
        path: req.path,
        memoryUsage: {
          heapUsed: endMemory.heapUsed - startMemory.heapUsed,
          heapTotal: endMemory.heapTotal,
          rss: endMemory.rss - startMemory.rss
        }
      });
    }
    
    // Log memory warnings (> 500MB heap used)
    if (endMemory.heapUsed > 500 * 1024 * 1024) {
      logger.warn('high-memory-usage', 'High memory usage detected', {
        correlationId: req.correlationId,
        memoryUsage: endMemory,
        path: req.path
      });
    }
  });
  
  next();
}

/**
 * Rate limiting logging middleware
 * Logs rate limiting events
 */
export function rateLimitLoggingMiddleware(req: Request, res: Response, next: NextFunction): void {
  // This would integrate with actual rate limiting logic
  // For now, just a placeholder that logs suspicious activity
  
  const rateLimitHeaders = {
    'x-ratelimit-limit': res.getHeader('x-ratelimit-limit'),
    'x-ratelimit-remaining': res.getHeader('x-ratelimit-remaining'),
    'x-ratelimit-reset': res.getHeader('x-ratelimit-reset')
  };
  
  // Log if rate limit headers are present
  if (rateLimitHeaders['x-ratelimit-remaining']) {
    const remaining = parseInt(rateLimitHeaders['x-ratelimit-remaining'] as string);
    
    if (remaining < 10) {
      logger.warn('rate-limit-approaching', 'Rate limit approaching for client', {
        correlationId: req.correlationId,
        ip: req.ip,
        remaining,
        path: req.path,
        userId: req.userId
      });
    }
  }
  
  next();
}
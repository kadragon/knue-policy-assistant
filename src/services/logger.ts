import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import { appConfig } from '../config';

// Log levels and colors
const logLevels = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
  trace: 4
};

const logColors = {
  error: 'red',
  warn: 'yellow', 
  info: 'green',
  debug: 'blue',
  trace: 'magenta'
};

// Structured log interface
export interface StructuredLog {
  level: keyof typeof logLevels;
  timestamp: string;
  service: string;
  operation: string;
  correlationId?: string;
  userId?: string;
  chatId?: string;
  duration?: number;
  statusCode?: number;
  error?: {
    message: string;
    stack?: string;
    code?: string;
  };
  metadata?: Record<string, any>;
  message: string;
}

// Custom Winston format for structured logging
const structuredFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss.SSS'
  }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.printf((info) => {
    const {
      timestamp,
      level,
      message,
      service = 'unknown',
      operation = 'unknown',
      correlationId,
      userId,
      chatId,
      duration,
      statusCode,
      error,
      metadata,
      ...rest
    } = info as any;

    const logEntry: StructuredLog = {
      level: level as keyof typeof logLevels,
      timestamp,
      service,
      operation,
      message,
      ...(correlationId && { correlationId }),
      ...(userId && { userId }),
      ...(chatId && { chatId }),
      ...(duration !== undefined && { duration }),
      ...(statusCode && { statusCode }),
      ...(error && { error }),
      ...(metadata && { metadata }),
      ...rest
    };

    return JSON.stringify(logEntry);
  })
);

// Console format for development
const consoleFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss'
  }),
  winston.format.colorize({ colors: logColors }),
  winston.format.printf((info) => {
    const {
      timestamp,
      level,
      message,
      service = 'unknown',
      operation = 'unknown',
      correlationId,
      duration,
      error
    } = info as any;

    let logMessage = `${timestamp} [${level}] [${service}:${operation}]`;
    
    if (correlationId) {
      logMessage += ` [${correlationId}]`;
    }
    
    logMessage += ` ${message}`;
    
    if (duration !== undefined) {
      logMessage += ` (${duration}ms)`;
    }
    
    if (error) {
      logMessage += `\n  Error: ${error.message}`;
      if (error.stack) {
        logMessage += `\n  Stack: ${error.stack}`;
      }
    }
    
    return logMessage;
  })
);

// Create transports
const transports: winston.transport[] = [];

// Console transport for development
if (process.env['NODE_ENV'] !== 'production') {
  transports.push(
    new winston.transports.Console({
      format: consoleFormat,
      level: 'debug'
    })
  );
}

// File transport for all logs
transports.push(
  new DailyRotateFile({
    filename: 'logs/application-%DATE%.log',
    datePattern: 'YYYY-MM-DD',
    zippedArchive: true,
    maxSize: '20m',
    maxFiles: '14d',
    format: structuredFormat,
    level: 'info'
  })
);

// Separate error log file
transports.push(
  new DailyRotateFile({
    filename: 'logs/error-%DATE%.log',
    datePattern: 'YYYY-MM-DD',
    zippedArchive: true,
    maxSize: '20m',
    maxFiles: '30d',
    format: structuredFormat,
    level: 'error'
  })
);

// Create Winston logger instance
export const logger = winston.createLogger({
  levels: logLevels,
  transports,
  exitOnError: false,
  // Handle uncaught exceptions
  exceptionHandlers: [
    new DailyRotateFile({
      filename: 'logs/exceptions-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '30d',
      format: structuredFormat
    })
  ],
  // Handle unhandled promise rejections  
  rejectionHandlers: [
    new DailyRotateFile({
      filename: 'logs/rejections-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '30d',
      format: structuredFormat
    })
  ]
});

// Add colors to Winston
winston.addColors(logColors);

export class LoggerService {
  private serviceName: string;

  constructor(serviceName: string) {
    this.serviceName = serviceName;
  }

  // Structured logging methods
  error(operation: string, message: string, error?: Error, metadata?: Record<string, any>): void {
    logger.error(message, {
      service: this.serviceName,
      operation,
      error: error ? {
        message: error.message,
        stack: error.stack,
        code: (error as any).code
      } : undefined,
      metadata
    });
  }

  warn(operation: string, message: string, metadata?: Record<string, any>): void {
    logger.warn(message, {
      service: this.serviceName,
      operation,
      metadata
    });
  }

  info(operation: string, message: string, metadata?: Record<string, any>): void {
    logger.info(message, {
      service: this.serviceName,
      operation,
      metadata
    });
  }

  debug(operation: string, message: string, metadata?: Record<string, any>): void {
    logger.debug(message, {
      service: this.serviceName,
      operation,
      metadata
    });
  }

  trace(operation: string, message: string, metadata?: Record<string, any>): void {
    logger.log('trace', message, {
      service: this.serviceName,
      operation,
      metadata
    });
  }

  // Performance logging
  logPerformance(
    operation: string,
    duration: number,
    metadata?: Record<string, any>
  ): void {
    const level = duration > 5000 ? 'warn' : duration > 2000 ? 'info' : 'debug';
    const message = `Operation completed in ${duration}ms`;
    
    logger.log(level, message, {
      service: this.serviceName,
      operation,
      duration,
      metadata
    });
  }

  // HTTP request logging
  logRequest(
    operation: string,
    method: string,
    path: string,
    statusCode: number,
    duration: number,
    correlationId?: string,
    userId?: string,
    metadata?: Record<string, any>
  ): void {
    const level = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';
    const message = `${method} ${path} - ${statusCode}`;
    
    logger.log(level, message, {
      service: this.serviceName,
      operation,
      statusCode,
      duration,
      correlationId,
      userId,
      metadata: {
        method,
        path,
        ...metadata
      }
    });
  }

  // RAG operation logging
  logRAGOperation(
    operation: string,
    query: string,
    documentsFound: number,
    maxScore: number,
    hasEvidence: boolean,
    duration: number,
    chatId?: string,
    metadata?: Record<string, any>
  ): void {
    const message = `RAG query processed: ${documentsFound} docs, max_score=${maxScore.toFixed(3)}, evidence=${hasEvidence}`;
    
    this.info(operation, message, {
      chatId,
      duration,
      ragMetrics: {
        query: query.substring(0, 100) + (query.length > 100 ? '...' : ''),
        documentsFound,
        maxScore,
        hasEvidence
      },
      ...metadata
    });
  }

  // Conversation operation logging
  logConversationOperation(
    operation: string,
    chatId: string,
    messageCount: number,
    duration?: number,
    metadata?: Record<string, any>
  ): void {
    const message = `Conversation operation: ${messageCount} messages`;
    
    this.info(operation, message, {
      chatId,
      duration,
      conversationMetrics: {
        messageCount
      },
      ...metadata
    });
  }

  // Sync operation logging
  logSyncOperation(
    operation: string,
    jobId: string,
    filesProcessed: number,
    status: 'completed' | 'failed' | 'running',
    duration?: number,
    error?: Error,
    metadata?: Record<string, any>
  ): void {
    const message = `Sync job ${jobId}: ${status}, ${filesProcessed} files processed`;
    const level = status === 'failed' ? 'error' : 'info';
    
    logger.log(level, message, {
      service: this.serviceName,
      operation,
      duration,
      error: error ? {
        message: error.message,
        stack: error.stack
      } : undefined,
      syncMetrics: {
        jobId,
        filesProcessed,
        status
      },
      metadata
    });
  }

  // Health check logging
  logHealthCheck(
    operation: string,
    service: string,
    status: 'healthy' | 'degraded' | 'unhealthy',
    responseTime: number,
    error?: Error,
    metadata?: Record<string, any>
  ): void {
    const level = status === 'unhealthy' ? 'error' : status === 'degraded' ? 'warn' : 'debug';
    const message = `Health check: ${service} - ${status} (${responseTime}ms)`;
    
    logger.log(level, message, {
      service: this.serviceName,
      operation,
      duration: responseTime,
      error: error ? {
        message: error.message,
        stack: error.stack
      } : undefined,
      healthMetrics: {
        targetService: service,
        status,
        responseTime
      },
      metadata
    });
  }
}

// Global logger instance
export const globalLogger = new LoggerService('global');

// Utility function to create service-specific loggers
export function createLogger(serviceName: string): LoggerService {
  return new LoggerService(serviceName);
}

// Performance tracking decorator
export function logPerformance(serviceName: string, operation: string) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    const serviceLogger = new LoggerService(serviceName);

    descriptor.value = async function (...args: any[]) {
      const startTime = Date.now();
      
      try {
        const result = await originalMethod.apply(this, args);
        const duration = Date.now() - startTime;
        
        serviceLogger.logPerformance(operation, duration, {
          method: propertyKey,
          argsCount: args.length
        });
        
        return result;
      } catch (error) {
        const duration = Date.now() - startTime;
        
        serviceLogger.error(operation, `Method ${propertyKey} failed after ${duration}ms`, error as Error, {
          method: propertyKey,
          argsCount: args.length
        });
        
        throw error;
      }
    };

    return descriptor;
  };
}
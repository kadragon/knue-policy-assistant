import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';

/**
 * Rate limiting middleware configurations for different endpoints
 */

// General API rate limit - 100 requests per 15 minutes per IP
export const generalRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: {
    error: 'Too Many Requests',
    message: 'Too many requests from this IP, please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  handler: (_req: Request, res: Response) => {
    res.status(429).json({
      error: 'Too Many Requests',
      message: 'Too many requests from this IP, please try again later.',
      retryAfter: '15 minutes',
      timestamp: new Date().toISOString()
    });
  }
});

// Strict rate limit for webhook endpoints - 60 requests per 15 minutes per IP
export const webhookRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 60, // Limit each IP to 60 requests per windowMs
  message: {
    error: 'Too Many Requests',
    message: 'Too many webhook requests from this IP, please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req: Request, res: Response) => {
    res.status(429).json({
      error: 'Too Many Requests',
      message: 'Too many webhook requests from this IP, please try again later.',
      retryAfter: '15 minutes',
      timestamp: new Date().toISOString()
    });
  }
});

// Stricter rate limit for RAG endpoints - 30 requests per 10 minutes per IP
export const ragRateLimit = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 30, // Limit each IP to 30 requests per windowMs
  message: {
    error: 'Too Many Requests',
    message: 'Too many RAG requests from this IP, please try again later.',
    retryAfter: '10 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req: Request, res: Response) => {
    res.status(429).json({
      error: 'Too Many Requests',
      message: 'Too many RAG requests from this IP, please try again later.',
      retryAfter: '10 minutes',
      timestamp: new Date().toISOString()
    });
  }
});

// Lenient rate limit for health check endpoints - 120 requests per 15 minutes per IP
export const healthRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 120, // Limit each IP to 120 requests per windowMs
  message: {
    error: 'Too Many Requests',
    message: 'Too many health check requests from this IP, please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req: Request, res: Response) => {
    res.status(429).json({
      error: 'Too Many Requests',
      message: 'Too many health check requests from this IP, please try again later.',
      retryAfter: '15 minutes',
      timestamp: new Date().toISOString()
    });
  }
});
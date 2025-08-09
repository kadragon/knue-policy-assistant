import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';

// Trusted IP ranges that can bypass rate limiting
const TRUSTED_IPS = [
  '127.0.0.1', // localhost
  '::1', // localhost IPv6
  // Add Cloud Run internal IPs or load balancer IPs here if needed
];

// Skip rate limiting for trusted IPs
const skipTrustedIPs = (req: Request): boolean => {
  const clientIP = req.ip || '';
  return TRUSTED_IPS.includes(clientIP);
};

/**
 * Rate limiting middleware configurations for different endpoints
 */

// General API rate limit - 100 requests per 15 minutes per IP
export const generalRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  skip: skipTrustedIPs, // Skip rate limiting for trusted IPs
  keyGenerator: (req: Request): string => {
    // Use forwarded IP if behind proxy
    return req.ip || 'unknown';
  },
  message: {
    error: 'Too Many Requests',
    message: 'Too many requests from this IP, please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      error: 'Too Many Requests',
      message: 'Too many requests from this IP, please try again later.',
      retryAfter: '15 minutes',
      timestamp: new Date().toISOString(),
      ip: req.ip
    });
  }
});

// Strict rate limit for webhook endpoints - 60 requests per 15 minutes per IP
export const webhookRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 60, // Limit each IP to 60 requests per windowMs
  skip: skipTrustedIPs,
  keyGenerator: (req: Request): string => {
    return req.ip || 'unknown';
  },
  message: {
    error: 'Too Many Requests',
    message: 'Too many webhook requests from this IP, please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      error: 'Too Many Requests',
      message: 'Too many webhook requests from this IP, please try again later.',
      retryAfter: '15 minutes',
      timestamp: new Date().toISOString(),
      ip: req.ip
    });
  }
});

// Stricter rate limit for RAG endpoints - 30 requests per 10 minutes per IP
export const ragRateLimit = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 30, // Limit each IP to 30 requests per windowMs
  skip: skipTrustedIPs,
  keyGenerator: (req: Request): string => {
    return req.ip || 'unknown';
  },
  message: {
    error: 'Too Many Requests',
    message: 'Too many RAG requests from this IP, please try again later.',
    retryAfter: '10 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      error: 'Too Many Requests',
      message: 'Too many RAG requests from this IP, please try again later.',
      retryAfter: '10 minutes',
      timestamp: new Date().toISOString(),
      ip: req.ip
    });
  }
});

// Lenient rate limit for health check endpoints - 120 requests per 15 minutes per IP
export const healthRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 120, // Limit each IP to 120 requests per windowMs
  skip: skipTrustedIPs,
  keyGenerator: (req: Request): string => {
    return req.ip || 'unknown';
  },
  message: {
    error: 'Too Many Requests',
    message: 'Too many health check requests from this IP, please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      error: 'Too Many Requests',
      message: 'Too many health check requests from this IP, please try again later.',
      retryAfter: '15 minutes',
      timestamp: new Date().toISOString(),
      ip: req.ip
    });
  }
});

// Very strict rate limit for sync operations - 10 requests per hour per IP
export const syncRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // Limit each IP to 10 requests per hour
  skip: skipTrustedIPs,
  keyGenerator: (req: Request): string => {
    return req.ip || 'unknown';
  },
  message: {
    error: 'Too Many Requests',
    message: 'Too many sync requests from this IP, please try again later.',
    retryAfter: '1 hour'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      error: 'Too Many Requests',
      message: 'Too many sync requests from this IP, please try again later.',
      retryAfter: '1 hour',
      timestamp: new Date().toISOString(),
      ip: req.ip
    });
  }
});
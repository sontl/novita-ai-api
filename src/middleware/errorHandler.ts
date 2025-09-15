import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

export interface ApiError extends Error {
  statusCode?: number;
  code?: string;
}

export const errorHandler = (
  error: ApiError,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const requestId = req.headers['x-request-id'] || 'unknown';
  
  logger.error('API Error', {
    error: error.message,
    stack: error.stack,
    statusCode: error.statusCode,
    code: error.code,
    requestId,
    method: req.method,
    url: req.url,
  });

  const statusCode = error.statusCode || 500;
  const errorCode = error.code || 'INTERNAL_ERROR';
  
  res.status(statusCode).json({
    error: {
      code: errorCode,
      message: error.message,
      timestamp: new Date().toISOString(),
      requestId,
    },
  });
};
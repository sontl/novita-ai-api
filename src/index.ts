import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config, getConfigSummary } from './config/config';
import { logger, createContextLogger } from './utils/logger';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { 
  requestLoggerMiddleware, 
  correlationIdMiddleware, 
  performanceMiddleware 
} from './middleware/requestLogger';
import { metricsMiddleware } from './middleware/metricsMiddleware';
import { healthRouter } from './routes/health';
import { instancesRouter } from './routes/instances';
import { metricsRouter } from './routes/metrics';
import cacheRouter from './routes/cache';

const app = express();

// Log configuration summary on startup
try {
  logger.info('Configuration loaded successfully', getConfigSummary());
} catch (error) {
  // In test environment, configuration might not be fully loaded
  if (config.nodeEnv !== 'test') {
    throw error;
  }
}

// Security middleware - conditionally enabled based on configuration
if (config.security.enableHelmet) {
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
      },
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true
    }
  }));
}

if (config.security.enableCors) {
  app.use(cors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
    credentials: true,
    optionsSuccessStatus: 200
  }));
}

// Trust proxy for accurate IP addresses
app.set('trust proxy', true);

// Request correlation and performance tracking
app.use(correlationIdMiddleware);
app.use(performanceMiddleware);
app.use(metricsMiddleware);

// Body parsing middleware with size limits
app.use(express.json({ 
  limit: '10mb',
  verify: (req, res, buf) => {
    // Store raw body for webhook signature verification if needed
    (req as any).rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Enhanced request/response logging
app.use(requestLoggerMiddleware);

// Routes
app.use('/health', healthRouter);
app.use('/api/instances', instancesRouter);
app.use('/api/cache', cacheRouter);
app.use('/api/metrics', metricsRouter);

// 404 handler for unmatched routes
app.use(notFoundHandler);

// Global error handler (must be last)
app.use(errorHandler);

// Only start server if not in test environment
if (config.nodeEnv !== 'test') {
  const server = app.listen(config.port, () => {
    logger.info(`Server running on port ${config.port}`);
    logger.info(`Environment: ${config.nodeEnv}`);
  });

  // Graceful shutdown
  process.on('SIGTERM', () => {
    logger.info('SIGTERM received, shutting down gracefully');
    server.close(() => {
      logger.info('Process terminated');
      process.exit(0);
    });
  });

  process.on('SIGINT', () => {
    logger.info('SIGINT received, shutting down gracefully');
    server.close(() => {
      logger.info('Process terminated');
      process.exit(0);
    });
  });
}

export { app };
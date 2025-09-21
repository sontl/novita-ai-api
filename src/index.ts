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
import { jobWorkerService } from './services/jobWorkerService';
import { createMigrationScheduler } from './services/migrationScheduler';
import { autoStopService } from './services/autoStopService';
import { serviceRegistry } from './services/serviceRegistry';
import { initializeServices, shutdownServices } from './services/serviceInitializer';

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
  // Initialize Redis-backed services
  initializeServices(config)
    .then(async (serviceResult) => {
      logger.info('Services initialized successfully', {
        redisHealthy: serviceResult.redisHealthy,
        cacheManagerType: serviceResult.cacheManager.getConfiguration().defaultBackend
      });

      // Get job queue service from registry (initialized by serviceInitializer)
      const jobQueueService = serviceRegistry.getJobQueueService();
      if (!jobQueueService) {
        throw new Error('Job queue service not initialized');
      }

      // Start job worker service for background processing
      jobWorkerService.start();
      logger.info('Job worker service started');
      
      // Initialize and start migration scheduler
      const migrationScheduler = createMigrationScheduler(config, jobQueueService);
      serviceRegistry.registerMigrationScheduler(migrationScheduler);
      migrationScheduler.start();
      logger.info('Migration scheduler initialized', {
        enabled: config.migration.enabled,
        intervalMs: config.migration.scheduleIntervalMs
      });

      // Start auto-stop service for inactive instance management
      autoStopService.startScheduler();
      logger.info('Auto-stop service initialized', autoStopService.getAutoStopStats());
      
      const server = app.listen(config.port, () => {
        logger.info(`Server running on port ${config.port}`);
        logger.info(`Environment: ${config.nodeEnv}`);
        logger.info('Application startup completed successfully');
      });

      // Graceful shutdown helper function
      const gracefulShutdown = async (signal: string) => {
        logger.info(`${signal} received, shutting down gracefully`);
        
        try {
          // Shutdown auto-stop service
          autoStopService.stopScheduler();
          logger.info('Auto-stop service shutdown complete');
          
          // Shutdown job worker service first
          await jobWorkerService.shutdown(10000);
          logger.info('Job worker service shutdown complete');
          
          // Shutdown all services (migration scheduler, cache manager, Redis client)
          await shutdownServices(10000);
          logger.info('All services shutdown complete');
          
          // Finally close the server
          server.close(() => {
            logger.info('Process terminated');
            process.exit(0);
          });
        } catch (error) {
          logger.error(`Error during ${signal} shutdown`, { error: (error as Error).message });
          process.exit(1);
        }
      };

      // Graceful shutdown
      process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
      process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    })
    .catch((error) => {
      logger.error('Failed to initialize services', {
        error: error instanceof Error ? error.message : String(error)
      });
      
      if (!config.redis.enableFallback) {
        logger.error('Redis fallback disabled, exiting');
        process.exit(1);
      } else {
        logger.warn('Continuing with fallback services due to Redis initialization failure');
        // Continue with basic startup for fallback mode
        // This would need additional fallback initialization logic
      }
    });
}

export { app };
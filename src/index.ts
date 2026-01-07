import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';

// Add early console logging to catch startup issues
console.log('🚀 Starting Novita GPU Instance API...');
console.log('📊 Environment:', process.env.NODE_ENV);
console.log('🔧 Log Level:', process.env.LOG_LEVEL);
console.log('🐳 Running in Docker:', !!process.env.DOCKER_CONTAINER);

try {
  console.log('📋 Loading configuration...');
  var { config, getConfigSummary } = require('./config/config');
  console.log('✅ Configuration loaded successfully');
} catch (error) {
  console.error('❌ Failed to load configuration:', error);
  process.exit(1);
}

let logger: any;
try {
  console.log('📝 Initializing logger...');
  var { createAxiomSafeLogger } = require('./utils/axiomSafeLogger');
  logger = createAxiomSafeLogger('app');
  console.log('✅ Logger initialized');
} catch (error) {
  console.error('❌ Failed to initialize logger:', error);
  process.exit(1);
}
import { axiomLogger } from './utils/axiomLogger';
import { getAxiomStatus } from './config/axiomConfig';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import {
  requestLoggerMiddleware,
  correlationIdMiddleware,
  performanceMiddleware
} from './middleware/requestLogger';
import { axiomLoggingMiddleware, axiomErrorMiddleware } from './middleware/axiomLoggingMiddleware';
import { metricsMiddleware } from './middleware/metricsMiddleware';
import { healthRouter } from './routes/health';
import { instancesRouter } from './routes/instances';
import { metricsRouter } from './routes/metrics';
import cacheRouter from './routes/cache';
import { uiRouter } from './routes/ui';
import { JobWorkerService } from './services/jobWorkerService';
import { createMigrationScheduler } from './services/migrationScheduler';
import { createFailedMigrationScheduler } from './services/failedMigrationScheduler';
import { autoStopService } from './services/autoStopService';
import { cacheClearScheduler } from './services/cacheClearScheduler';
import { serviceRegistry } from './services/serviceRegistry';
import { initializeServices, shutdownServices } from './services/serviceInitializer';

const app = express();

// Log configuration summary on startup
try {
  const configSummary = getConfigSummary();
  const axiomStatus = getAxiomStatus();

  logger.info('Configuration loaded successfully', {
    ...configSummary,
    axiom: axiomStatus
  });

  // Log Axiom integration status
  if (axiomStatus.enabled) {
    axiomLogger.info('Axiom logging integration enabled', {
      component: 'startup',
      feature: 'logging',
      tags: ['axiom', 'integration', 'enabled']
    });
  } else {
    logger.info('Axiom logging not configured - using console logging only');
  }
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

// Axiom logging middleware (after correlation ID but before request logging)
app.use(axiomLoggingMiddleware);

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

// Serve static files for UI
app.use(express.static('src/public'));

// Serve app.js specifically
app.get('/app.js', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/app.js'));
});

// Routes
app.use('/health', healthRouter);
app.use('/api/instances', instancesRouter);
app.use('/api/cache', cacheRouter);
app.use('/api/metrics', metricsRouter);
app.use('/', uiRouter);

// 404 handler for unmatched routes
app.use(notFoundHandler);

// Axiom error handler (before global error handler)
app.use(axiomErrorMiddleware);

// Global error handler (must be last)
app.use(errorHandler);

// Only start server if not in test environment
if (config.nodeEnv !== 'test') {
  let jobWorkerService: JobWorkerService;

  console.log('🔧 Starting service initialization...');
  logger.debug('About to initialize services', {
    nodeEnv: config.nodeEnv,
    redisConfigured: !!(config.redis?.url && config.redis?.host && config.redis?.password)
  });

  // Initialize Redis-backed services
  initializeServices(config)
    .then(async (serviceResult) => {
      logger.info('Services initialized successfully', {
        redisHealthy: serviceResult.redisHealthy,
        cacheManagerType: 'redis',
        syncCompleted: !!serviceResult.syncResult,
        syncResult: serviceResult.syncResult
      });

      // Get job queue service from registry (initialized by serviceInitializer)
      const jobQueueService = serviceRegistry.getJobQueueService();
      if (!jobQueueService) {
        throw new Error('Job queue service not initialized');
      }

      // Create and start job worker service with the initialized job queue service
      jobWorkerService = new JobWorkerService(jobQueueService);
      jobWorkerService.start();
      logger.info('Job worker service started');

      // Initialize and start migration scheduler
      // const migrationScheduler = createMigrationScheduler(config, jobQueueService);
      // serviceRegistry.registerMigrationScheduler(migrationScheduler);
      // migrationScheduler.start();
      // logger.info('Migration scheduler initialized', {
      //   enabled: config.migration.enabled,
      //   intervalMs: config.migration.scheduleIntervalMs
      // });

      // // Initialize and start failed migration scheduler
      // const failedMigrationScheduler = createFailedMigrationScheduler(config, jobQueueService);
      // serviceRegistry.registerFailedMigrationScheduler(failedMigrationScheduler);

      // // Log detailed configuration before starting
      // logger.info('Failed migration scheduler configuration', {
      //   enabled: config.migration.enabled,
      //   intervalMs: config.migration.scheduleIntervalMs * 2,
      //   dryRunMode: config.migration.dryRunMode,
      //   jobTimeoutMs: config.migration.jobTimeoutMs,
      //   logLevel: config.migration.logLevel,
      //   nodeEnv: config.nodeEnv,
      //   isDevelopment: config.nodeEnv === 'development'
      // });

      // failedMigrationScheduler.start();

      // // Check status after start
      // const schedulerStatus = failedMigrationScheduler.getStatus();
      // logger.info('Failed migration scheduler status after start', {
      //   isRunning: schedulerStatus.isRunning,
      //   isEnabled: schedulerStatus.isEnabled,
      //   nextExecution: schedulerStatus.nextExecution,
      //   uptime: schedulerStatus.uptime
      // });

      // In development, log a reminder about the scheduler
      if (config.nodeEnv === 'development') {
        logger.info('Development mode: Failed migration scheduler will run every ' +
          Math.round((config.migration.scheduleIntervalMs * 2) / 60000) + ' minutes');
      }

      // Start auto-stop service for inactive instance management
      autoStopService.startScheduler();
      logger.info('Auto-stop service initialized', autoStopService.getAutoStopStats());

      // Start cache clear scheduler for automated daily cache clearing
      cacheClearScheduler.start();
      logger.info('Cache clear scheduler initialized', cacheClearScheduler.getStatus());

      const server = app.listen(config.port, () => {
        logger.info(`Server running on port ${config.port}`);
        logger.info(`Environment: ${config.nodeEnv}`);
        logger.info('Application startup completed successfully');
      });

      // Graceful shutdown helper function
      const gracefulShutdown = async (signal: string) => {
        logger.info(`${signal} received, shutting down gracefully`);

        try {
          // Shutdown cache clear scheduler
          cacheClearScheduler.stop();
          logger.info('Cache clear scheduler shutdown complete');

          // Shutdown auto-stop service
          autoStopService.stopScheduler();
          logger.info('Auto-stop service shutdown complete');

          // Shutdown job worker service first
          if (jobWorkerService) {
            await jobWorkerService.shutdown(10000);
            logger.info('Job worker service shutdown complete');
          }

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
      // In development mode with ts-node-dev, ignore SIGTERM to prevent shutdown on file changes
      if (config.nodeEnv === 'development' && process.env.npm_lifecycle_event === 'dev') {
        logger.info('Development mode detected - ignoring SIGTERM for hot reload');
        process.on('SIGINT', () => gracefulShutdown('SIGINT')); // Still handle Ctrl+C
      } else {
        process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
        process.on('SIGINT', () => gracefulShutdown('SIGINT'));
      }
    })
    .catch((error) => {
      logger.error('Failed to initialize services', {
        error: error instanceof Error ? error.message : String(error)
      });

      logger.error('Redis is required, exiting');
      process.exit(1);
    });
}

export { app };
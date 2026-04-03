import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { env } from './config/env';
import authRoutes from './modules/auth/routes';
import userRoutes from './modules/user/routes';
import financeRoutes from './modules/finance/routes';
import analyticsRoutes from './modules/analytics/routes';
import { errorHandler } from './middleware/errorHandler';
import { initializeAnalyticsCacheInvalidation } from './modules/analytics/invalidation';
import {
  applyTrustProxy,
  corsOptions,
  enforceHttps,
  generalRateLimiter,
  requireJsonContentType,
} from './middleware/security';
import { me } from './modules/auth/controller';

const app = express();

initializeAnalyticsCacheInvalidation();

app.disable('x-powered-by');
applyTrustProxy(app);

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    hsts:
      env.NODE_ENV === 'production'
        ? {
          maxAge: 60 * 60 * 24 * 365,
          includeSubDomains: true,
          preload: true,
        }
        : false,
    referrerPolicy: { policy: 'no-referrer' },
  })
);
app.use(cors(corsOptions));
app.use(enforceHttps);
app.use(generalRateLimiter);
app.use(express.json({ limit: env.API_BODY_LIMIT }));
app.use(express.urlencoded({ extended: false, limit: env.API_BODY_LIMIT }));
app.use(requireJsonContentType);

app.get('/health', (_req, res) => {
  res.status(200).json({ success: true, status: 'ok', timestamp: new Date().toISOString(), message: 'Finance API is healthy' });
});

app.get('/api/v1', (_req, res) => {
  res.status(200).json({
    success: true,
    message: 'Finance API v1',
  });
});

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/transactions', financeRoutes);
app.use('/api/v1/analytics', analyticsRoutes);

app.use((_req, res) => {
  res.status(404).json({ success: false, error: 'Route not found' });
});

app.use(errorHandler);

export default app;

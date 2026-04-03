import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import authRoutes from './modules/auth/routes';
import userRoutes from './modules/user/routes';
import financeRoutes from './modules/finance/routes';
import analyticsRoutes from './modules/analytics/routes';
import { errorHandler } from './middleware/errorHandler';
import { initializeAnalyticsCacheInvalidation } from './modules/analytics/invalidation';

const app = express();

initializeAnalyticsCacheInvalidation();

app.use(helmet());
app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
  res.status(200).json({ success: true, status: 'ok' });
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

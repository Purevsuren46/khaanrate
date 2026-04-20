import fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import csrf from '@fastify/csrf';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import websocketPlugin from '@fastify/websocket';
import { config } from './config/index.js';
import { LoanCoordinator } from './agents/loanCoordinator.js';
import { healthRouter } from './services/health.js';

const app = fastify({ logger: { level: config.LOG_LEVEL } });

// Register plugins
await app.register(cors);
await app.register(cookie);
await app.register(csrf);
await app.register(rateLimit, {
  max: 100,
  timeWindow: '1 minute',
  keyGenerator: (request) => request.ip
});
await app.register(websocketPlugin);
await app.register(swagger, {
  openapi: {
    info: { title: 'KhaanRate API', version: '1.0.0' },
    servers: [{ url: '/api' }]
  }
});

const coordinator = new LoanCoordinator(config);

// WebSocket for real-time rate push
app.websocket('/rates/ws', (connection, req) => {
  connection.on('error', console.warn);
  // push live rates periodically or on change
});

// Public routes
app.get('/api/health', async () => healthRouter.check());
app.get('/api/rates', async (req, reply) => {
  const rates = await coordinator.bankRateService.fetchAllLiveRates();
  return rates;
});
app.post('/api/loan', async (req, reply) => {
  const decision = await coordinator.evaluate(req.body);
  return { decision };
});

const start = async () => {
  try {
    await app.listen({ port: config.PORT, host: '0.0.0.0' });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};
start();

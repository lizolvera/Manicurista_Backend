import express from 'express';
import { env } from './config/env.js';
import type { AgendaService } from './services/agenda.service.js';
import { agendaRoutes } from './routes/agenda.routes.js';

export function createApp(
  service: Pick<AgendaService, 'read' | 'command'>,
  ping: () => Promise<unknown>,
) {
  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && !env.origins.includes(origin)) {
      res.status(403).json({ error: 'Origen no autorizado.' });
      return;
    }
    if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });
  app.use(express.json({ limit: '400kb' }));
  app.use('/api', agendaRoutes(service, ping));
  app.use(
    (_err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      res.status(400).json({ error: 'Solicitud inválida o imagen demasiado grande.' });
    },
  );
  return app;
}

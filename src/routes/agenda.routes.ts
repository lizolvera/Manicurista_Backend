import { Router } from 'express';
import { AgendaInputError, type AgendaService } from '../services/agenda.service.js';

export function agendaRoutes(
  service: Pick<AgendaService, 'read' | 'command'>,
  ping: () => Promise<unknown>,
) {
  const router = Router();
  router.get('/health', async (_req, res) => {
    try {
      await ping();
      res.json({ status: 'ok', version: '0.2.0', mode: 'fictional-shared-demo' });
    } catch {
      res.status(503).json({ error: 'Base no disponible.' });
    }
  });
  router.get('/state', async (_req, res) => {
    try {
      res.json(await service.read());
    } catch {
      res.status(503).json({ error: 'No fue posible leer la agenda.' });
    }
  });
  router.post('/command', async (req, res) => {
    try {
      res.json(await service.command(req.body));
    } catch (e) {
      if (e instanceof AgendaInputError) {
        res.status(e.status).json({ error: e.message });
        return;
      }
      res
        .status(503)
        .json({ error: 'No se pudo guardar. Revisa la conexión y vuelve a intentar.' });
    }
  });
  return router;
}

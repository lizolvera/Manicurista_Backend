import { createApp } from './app.js';
import { connectDatabase } from './config/database.js';
import { env } from './config/env.js';
import { AgendaService } from './services/agenda.service.js';
import { MongoAgendaRepository } from './services/mongo-agenda.repository.js';

async function start() {
  if (!Number.isInteger(env.port) || env.port < 1 || env.port > 65535)
    throw new Error('Configura un PORT válido en backend/.env.');
  const { client, db } = await connectDatabase();
  const service = new AgendaService(new MongoAgendaRepository(client, db));
  const app = createApp(service, () => client.db().command({ ping: 1 }));
  const server = app.listen(env.port, '0.0.0.0', () => {
    console.log(`Backend de Entre Uñas listo en http://localhost:${env.port}/api/health`);
    console.log('Demostración académica: utiliza únicamente datos ficticios.');
  });
  server.on('error', () => {
    console.error(
      'No se pudo abrir el puerto del backend. Revisa PORT y otras terminales abiertas.',
    );
    void client.close();
    process.exitCode = 1;
  });
  const shutdown = () => {
    server.close(() => {
      void client.close();
    });
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}

start().catch(() => {
  console.error(
    'No se pudo iniciar el backend. Revisa backend/.env, MONGODB_URI y el acceso de red de Atlas.',
  );
  process.exitCode = 1;
});

import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';

// Resolve .env relative to the backend, even if the command starts elsewhere.
config({ path: fileURLToPath(new URL('../../.env', import.meta.url)) });

export const env = {
  mongoUri: process.env['MONGODB_URI'] || '',
  database: process.env['MONGODB_DB'] || 'bina03_demo',
  port: Number(process.env['PORT'] || 3000),
  origins: (process.env['ALLOWED_ORIGINS'] || 'http://localhost:4200')
    .split(',')
    .map((origin) => origin.trim()),
};

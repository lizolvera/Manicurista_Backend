import { MongoClient } from 'mongodb';
import { env } from './env.js';
import { COLLECTIONS } from '../domain/documents.js';

export async function connectDatabase() {
  if (!env.mongoUri) throw new Error('Configura MONGODB_URI en backend/.env.');
  const client = new MongoClient(env.mongoUri, { serverSelectionTimeoutMS: 10000 });
  try {
    await client.connect();
    const db = client.db(env.database);
    const present = new Set(
      (await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name),
    );
    for (const name of [...COLLECTIONS, '_control']) {
      if (!present.has(name)) {
        try {
          await db.createCollection(name);
        } catch (e) {
          if ((e as { code?: number }).code !== 48) throw e;
        }
      }
    }
    await db
      .collection<{ _id: string; revision: number }>('_control')
      .updateOne({ _id: 'agenda' }, { $setOnInsert: { revision: 0 } }, { upsert: true });
    await db.collection('citas').createIndex({ manicuristId: 1, date: 1, time: 1 });
    await db.collection('citas').createIndex({ clientId: 1, date: -1 });
    await db.collection('disenos').createIndex({ clientId: 1, createdAt: -1 });
    await db.collection('notificaciones').createIndex({ createdAt: -1 });
    return { client, db };
  } catch (error) {
    await client.close();
    throw error;
  }
}

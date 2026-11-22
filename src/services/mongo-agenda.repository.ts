import type { ClientSession, Db, MongoClient } from 'mongodb';
import {
  COLLECTIONS,
  type DocumentState,
  fromDocuments,
  toDocuments,
} from '../domain/documents.js';
import type { AgendaState } from '../domain/agenda.model.js';

export interface AgendaRepository {
  read(): Promise<AgendaState>;
  change(update: (state: AgendaState) => AgendaState): Promise<AgendaState>;
}

export class MongoAgendaRepository implements AgendaRepository {
  constructor(
    private readonly client: MongoClient,
    private readonly db: Db,
  ) {}

  private async documents(session: ClientSession): Promise<DocumentState> {
    const result = {} as DocumentState;
    for (const name of COLLECTIONS) {
      const rows = await this.db
        .collection<DocumentState[typeof name][number]>(name)
        .find({}, { session })
        .toArray();
      // Collections use a fixed, validated document format; each key keeps its own type.
      (result[name] as unknown[]) = rows;
    }
    return result;
  }

  async read(): Promise<AgendaState> {
    return this.client.withSession((session) =>
      session.withTransaction(async () => fromDocuments(await this.documents(session)), {
        readConcern: { level: 'snapshot' },
        writeConcern: { w: 'majority' },
        maxCommitTimeMS: 10000,
      }),
    );
  }

  async change(update: (state: AgendaState) => AgendaState): Promise<AgendaState> {
    return this.client.withSession((session) =>
      session.withTransaction(
        async () => {
          // A tiny technical document serializes commands across server instances.
          // It prevents two transactions from reserving overlapping intervals from the same snapshot.
          await this.db
            .collection<{ _id: string; revision: number }>('_control')
            .updateOne({ _id: 'agenda' }, { $inc: { revision: 1 } }, { session });
          const previous = await this.documents(session);
          const oldState = fromDocuments(previous);
          const baseline = toDocuments(oldState);
          const next = update(oldState);
          const stored = toDocuments(next);
          for (const name of COLLECTIONS) {
            const old = new Map<string, unknown>(baseline[name].map((row) => [row._id, row]));
            const next = new Set(stored[name].map((row) => row._id));
            for (const row of stored[name]) {
              // New or changed documents are written; only reset-scenario removes rows.
              if (JSON.stringify(old.get(row._id)) !== JSON.stringify(row)) {
                await this.db
                  .collection<{ _id: string }>(name)
                  .replaceOne({ _id: row._id }, row, { upsert: true, session });
              }
            }
            for (const row of baseline[name]) {
              if (!next.has(row._id)) {
                await this.db
                  .collection<{ _id: string }>(name)
                  .deleteOne({ _id: row._id }, { session });
              }
            }
          }
          return next;
        },
        {
          readConcern: { level: 'snapshot' },
          writeConcern: { w: 'majority' },
          maxCommitTimeMS: 10000,
        },
      ),
    );
  }
}

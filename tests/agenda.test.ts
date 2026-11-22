import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { createApp } from '../src/app.js';
import { applyCommand, type AgendaCommand } from '../src/domain/agenda.actions.js';
import {
  type Appointment,
  type AgendaState,
  conflicts,
  migrateState,
} from '../src/domain/agenda.model.js';
import { AgendaInputError } from '../src/services/agenda.service.js';
import {
  COLLECTIONS,
  fromDocuments,
  toDocuments,
  type DocumentState,
} from '../src/domain/documents.js';
import { readFileSync } from 'node:fs';
import { MongoAgendaRepository } from '../src/services/mongo-agenda.repository.js';
import { AgendaService } from '../src/services/agenda.service.js';
import type { Db, MongoClient } from 'mongodb';

const appointment = (changes: Partial<Appointment> = {}): Appointment => ({
  id: 'a1',
  client: 'C01',
  manicurist: 'Manicurista 1',
  manicuristId: 'manicurista-001',
  serviceId: 'servicio-001',
  timeId: 'tiempo-001',
  totalPrice: 2000,
  date: '2026-11-10',
  time: '09:00',
  service: 'Manicura',
  duration: 1.5,
  buffer: 15,
  deposit: 100,
  balancePaid: 0,
  attendance: 'Sin registrar',
  notes: '',
  status: 'Pendiente',
  ...changes,
});
const empty = (): AgendaState => ({
  appointments: [],
  notices: [],
  clients: [],
  designs: [],
  manicurists: [
    {
      id: 'manicurista-001',
      name: 'Manicurista 1',
      active: true,
      createdAt: '2026-11-09T18:00:00Z',
    },
    {
      id: 'manicurista-002',
      name: 'Manicurista 2',
      active: true,
      createdAt: '2026-11-09T18:00:00Z',
    },
  ],
  services: [
    {
      id: 'servicio-001',
      name: 'Manicura',
      basePrice: 350,
      defaultTimeId: 'tiempo-001',
      active: true,
      createdAt: '2026-11-09T18:00:00Z',
    },
  ],
  times: [
    {
      id: 'tiempo-001',
      label: '1 hora y media',
      duration: 1.5,
      buffer: 15,
      active: true,
      createdAt: '2026-11-09T18:00:00Z',
    },
  ],
});
const apply = (state: AgendaState, command: AgendaCommand) =>
  applyCommand(state, command, randomUUID, () => new Date().toISOString());

function examples(): DocumentState {
  return Object.fromEntries(
    COLLECTIONS.map((name) => [
      name,
      [
        JSON.parse(
          readFileSync(
            new URL(`../../docs/mongodb/ejemplos/${name}.json`, import.meta.url),
            'utf8',
          ),
        ),
      ],
    ]),
  ) as unknown as DocumentState;
}

test('el repositorio persiste por colección, conserva agenda y revierte una operación inválida', async () => {
  const data = new Map<string, Record<string, unknown>[]>();
  for (const [name, rows] of Object.entries(examples())) data.set(name, structuredClone(rows));
  data.set('agenda', [{ _id: 'demo', appointments: [{ id: 'anterior' }], revision: 7 }]);
  data.set('_control', [{ _id: 'agenda', revision: 0 }]);
  const session = {
    withTransaction: async <T>(run: () => Promise<T>): Promise<T> => {
      const snapshot = structuredClone(data);
      try {
        return await run();
      } catch (e) {
        data.clear();
        for (const [k, v] of snapshot) data.set(k, v);
        throw e;
      }
    },
  };
  const db = {
    collection: (name: string) => ({
      find: (_filter: unknown, options: { session: unknown }) => {
        assert.equal(options.session, session);
        return { toArray: async () => structuredClone(data.get(name) || []) };
      },
      updateOne: async (_filter: unknown, _update: unknown, options: { session: unknown }) => {
        assert.equal(options.session, session);
        assert.equal(name, '_control');
        const lock = data.get(name)![0];
        lock.revision = Number(lock.revision) + 1;
        return { modifiedCount: 1 };
      },
      replaceOne: async (
        filter: { _id: string },
        row: Record<string, unknown>,
        options: { session: unknown; upsert: boolean },
      ) => {
        assert.equal(options.session, session);
        assert.equal(options.upsert, true);
        assert.ok(COLLECTIONS.includes(name as (typeof COLLECTIONS)[number]));
        const rows = data.get(name) || [];
        data.set(name, [...rows.filter((r) => r._id !== filter._id), structuredClone(row)]);
        return { modifiedCount: 1 };
      },
    }),
  };
  const client = { withSession: async <T>(run: (s: unknown) => Promise<T>) => run(session) };
  const repository = new MongoAgendaRepository(
    client as unknown as MongoClient,
    db as unknown as Db,
  );
  const service = new AgendaService(repository);
  const read = await service.read();
  assert.equal(read.clients[0].id, 'clienta-001');
  await service.command({
    action: 'save',
    payload: appointment({
      id: 'persisted',
      client: 'C02 Atlas',
      date: '2026-11-16',
      totalPrice: 350,
    }),
  });
  const saved = data.get('citas')!.find((r) => r._id === 'persisted')!;
  assert.equal(saved.serviceId, 'servicio-001');
  assert.equal(saved.totalPrice, 350);
  assert.ok(typeof saved.createdAt === 'string');
  assert.ok(!('id' in saved));
  assert.ok(!('client' in saved));
  assert.ok(data.get('clientas')!.some((r) => r._id === saved.clientId));
  assert.ok(data.get('notificaciones')!.some((r) => r.appointmentId === 'persisted'));
  const before = structuredClone(data);
  await assert.rejects(
    () =>
      service.command({
        action: 'save',
        payload: appointment({
          id: 'conflict',
          client: 'C03',
          date: '2026-11-16',
          time: '09:30',
          totalPrice: 350,
        }),
      }),
    /horario/,
  );
  assert.deepEqual(data, before);
  assert.deepEqual(data.get('agenda'), [
    { _id: 'demo', appointments: [{ id: 'anterior' }], revision: 7 },
  ]);
});

test('lee los siete ejemplos manuales y escribe exactamente sus campos de Atlas', () => {
  let state = fromDocuments(examples());
  assert.equal(state.appointments[0].client, 'C01 Prueba');
  assert.equal(state.appointments[0].manicurist, 'Manicurista 1');
  assert.equal(state.appointments[0].service, 'Semipermanente');
  state = apply(state, {
    action: 'save-client',
    payload: {
      id: 'new-client',
      name: 'C02 Prueba',
      description: 'Nota',
      createdAt: '1900-01-01T00:00:00Z',
    },
  });
  assert.notEqual(
    state.clients.find((c) => c.id === 'new-client')!.createdAt,
    '1900-01-01T00:00:00Z',
  );
  state = apply(state, {
    action: 'save',
    payload: {
      ...appointment({
        id: 'new-appointment',
        client: 'C02 Prueba',
        clientId: 'new-client',
        date: '2026-11-16',
      }),
      totalPrice: 350,
    },
  });
  state = apply(state, {
    action: 'save',
    payload: {
      ...state.appointments.find((a) => a.id === 'new-appointment')!,
      status: 'Confirmada',
    },
  });
  state = apply(state, { action: 'remind', payload: { id: 'new-appointment' } });
  state = apply(state, { action: 'read', payload: { id: state.notices[0].id } });
  state = apply(state, {
    action: 'save-design',
    payload: {
      id: 'new-design',
      clientId: 'new-client',
      serviceId: 'servicio-001',
      service: '',
      appointmentId: 'new-appointment',
      image: examples().disenos[0].image,
      note: 'Prueba',
      createdAt: '',
    },
  });
  const stored = toDocuments(state);
  for (const name of COLLECTIONS) {
    const validator = JSON.parse(
      readFileSync(new URL(`../../docs/mongodb/validadores/${name}.json`, import.meta.url), 'utf8'),
    ).$jsonSchema;
    for (const row of stored[name]) {
      const record = row as unknown as Record<string, unknown>;
      for (const key of validator.required)
        assert.ok(record[key] !== undefined, `${name}.${key} es obligatorio`);
      for (const key of Object.keys(record))
        assert.ok(key in validator.properties, `${name}.${key} no forma parte del formato`);
      for (const [key, value] of Object.entries(record)) {
        const rule = validator.properties[key];
        if (rule.pattern) assert.ok(new RegExp(rule.pattern).test(String(value)), `${name}.${key}`);
        if (rule.enum) assert.ok(rule.enum.includes(value));
      }
      assert.ok(!('id' in record));
    }
  }
  const cita = stored.citas.find((a) => a._id === 'new-appointment')!;
  assert.equal(cita.clientId, 'new-client');
  assert.equal(cita.manicuristId, 'manicurista-001');
  assert.equal(cita.serviceId, 'servicio-001');
  assert.equal(cita.totalPrice, 350);
  assert.ok(!('client' in cita));
  assert.ok(!('manicurist' in cita));
  assert.ok(!('service' in cita));
  assert.equal(stored.disenos[0].appointmentId, 'new-appointment');
});

test('el catálogo conserva el precio acordado y rechaza nuevas asignaciones inactivas', () => {
  let state = fromDocuments(examples());
  const before = { ...state.appointments[0] };
  state = apply(state, {
    action: 'save-service',
    payload: { ...state.services[0], basePrice: 500 },
  });
  assert.equal(state.appointments[0].totalPrice, before.totalPrice);
  assert.equal(state.appointments[0].duration, before.duration);
  // Editar el catálogo de tiempos tampoco reescribe la instantánea de la cita.
  state = apply(state, {
    action: 'save-time',
    payload: { ...state.times[0], duration: 2 },
  });
  assert.equal(state.times[0].duration, 2);
  assert.equal(state.appointments[0].duration, before.duration);
  state = apply(state, {
    action: 'save-manicurist',
    payload: { ...state.manicurists[0], active: false },
  });
  assert.throws(
    () => apply(state, { action: 'save', payload: appointment({ id: 'new', date: '2026-11-16' }) }),
    /activa/,
  );
  state = apply(state, {
    action: 'save',
    payload: { ...state.appointments[0], status: 'Confirmada' },
  });
  assert.equal(state.appointments[0].status, 'Confirmada');
});

test('rechaza referencias inexistentes, precios negativos y pagos mayores al total', () => {
  const state = fromDocuments(examples());
  assert.throws(
    () =>
      apply(state, { action: 'save', payload: appointment({ id: 'new', serviceId: 'missing' }) }),
    /servicio/,
  );
  assert.throws(
    () => apply(state, { action: 'save', payload: appointment({ id: 'new', totalPrice: -1 }) }),
    /precio/,
  );
  assert.throws(
    () =>
      apply(state, {
        action: 'save',
        payload: appointment({ id: 'new', totalPrice: 50, deposit: 100 }),
      }),
    /superar/,
  );
  assert.throws(
    () =>
      apply(state, { action: 'save-service', payload: { ...state.services[0], basePrice: 1.123 } }),
    /precio/,
  );
});

test('backend valida profesional, duración y conflictos por manicurista', () => {
  const state = apply(empty(), { action: 'save', payload: appointment() });
  assert.throws(
    () => apply(state, { action: 'save', payload: appointment({ id: 'a2', time: '09:45' }) }),
    /horario/,
  );
  assert.throws(
    () => apply(state, { action: 'save', payload: appointment({ id: 'a2', manicuristId: '' }) }),
    /manicurista/,
  );
  assert.throws(
    () => apply(state, { action: 'save', payload: appointment({ id: 'a2', timeId: 'missing' }) }),
    /duración/,
  );
  assert.throws(
    () =>
      apply(state, { action: 'save', payload: appointment({ id: 'a2', timeId: '', duration: -1 }) }),
    /duración/,
  );
  assert.equal(
    conflicts(
      appointment({ id: 'a2', manicurist: 'Manicurista 2', manicuristId: 'manicurista-002' }),
      state.appointments,
    ),
    false,
  );
});

test('el catálogo de tiempos alimenta la instantánea de la cita', () => {
  let state = empty();
  state = apply(state, {
    action: 'save-time',
    payload: { id: 'tiempo-002', label: '2 horas', duration: 2, buffer: 10, active: true },
  });
  assert.equal(state.times.length, 2);
  state = apply(state, { action: 'save', payload: appointment({ timeId: 'tiempo-002' }) });
  assert.equal(state.appointments[0].timeId, 'tiempo-002');
  assert.equal(state.appointments[0].duration, 2); // duración tomada del catálogo
  assert.equal(state.appointments[0].buffer, 15); // preparación variable: se toma del formulario
  state = apply(state, {
    action: 'save',
    payload: appointment({ id: 'a2', timeId: 'tiempo-002', buffer: 30, time: '12:00' }),
  });
  assert.equal(state.appointments[1].duration, 2);
  assert.equal(state.appointments[1].buffer, 30);
  assert.throws(
    () =>
      apply(state, {
        action: 'save-time',
        payload: { id: 'tiempo-003', label: 'Otra', duration: 2, buffer: 10, active: true },
      }),
    /Ya existe un tiempo/,
  );
  assert.throws(
    () =>
      apply(state, {
        action: 'save-service',
        payload: { ...state.services[0], id: 'servicio-002', name: 'Gel', defaultTimeId: 'missing' },
      }),
    /tiempo/,
  );
});

test('backend permite reprogramar y cancelar liberando el horario', () => {
  let state = apply(empty(), { action: 'save', payload: appointment() });
  state = apply(state, { action: 'save', payload: { ...state.appointments[0], time: '12:00' } });
  assert.equal(conflicts(appointment({ id: 'a2' }), state.appointments), false);
  state = apply(state, {
    action: 'save',
    payload: { ...state.appointments[0], status: 'Cancelada' },
  });
  assert.equal(conflicts(appointment({ id: 'a2', time: '12:00' }), state.appointments), false);
  assert.equal(state.notices[0].kind, 'cancel');
});

test('backend conserva perfiles y datos anteriores durante la migración', () => {
  const { manicurist: _manicurist, ...legacy } = appointment();
  const migrated = migrateState({ appointments: [legacy], notices: [] } as unknown as AgendaState);
  assert.equal(migrated.appointments[0].deposit, 100);
  assert.equal(migrated.appointments[0].manicurist, '');
  assert.equal(migrated.clients[0].name, 'C01');
});

test('API mantiene sus rutas, errores y CORS sin necesitar Angular ni Atlas en esta prueba', async () => {
  let state = empty();
  const service = {
    read: async () => state,
    command: async (input: unknown) => {
      try {
        state = apply(state, input as AgendaCommand);
        return state;
      } catch (e) {
        throw new AgendaInputError((e as Error).message);
      }
    },
  };
  const server = createApp(service, async () => ({ ok: 1 })).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('No se abrió el servidor de prueba.');
  const base = `http://127.0.0.1:${address.port}/api`;
  try {
    const health = await fetch(`${base}/health`);
    assert.equal(health.status, 200);
    assert.equal((await health.json()).status, 'ok');
    const forbidden = await fetch(`${base}/state`, {
      headers: { Origin: 'https://origen-no-permitido.example' },
    });
    assert.equal(forbidden.status, 403);
    const saved = await fetch(`${base}/command`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'save', payload: appointment() }),
    });
    assert.equal(saved.status, 200);
    assert.equal((await saved.json()).appointments[0].manicurist, 'Manicurista 1');
    const read = await fetch(`${base}/state`);
    assert.equal((await read.json()).appointments.length, 1);
    const invalid = await fetch(`${base}/command`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{broken',
    });
    assert.equal(invalid.status, 400);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

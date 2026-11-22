import type {
  AgendaState,
  Appointment,
  BitacoraEntry,
  Client,
  Design,
  Manicurist,
  Notice,
  Service,
  ServiceTime,
} from './agenda.model.js';

export interface ClientDocument {
  _id: string;
  name: string;
  description: string;
  createdAt: string;
}
export interface ManicuristDocument {
  _id: string;
  name: string;
  active: boolean;
  createdAt: string;
}
export interface ServiceDocument {
  _id: string;
  name: string;
  basePrice: number;
  defaultTimeId?: string;
  active: boolean;
  createdAt: string;
}
export interface ServiceTimeDocument {
  _id: string;
  label: string;
  duration: number;  // Duración en HORAS (ej: 1.5 = 1 hora y 30 minutos)
  buffer: number;    // Tiempo de preparación en MINUTOS
  active: boolean;
  createdAt: string;
}
export interface AppointmentDocument {
  _id: string;
  clientId: string;
  manicuristId: string;
  serviceId: string;
  timeId?: string;
  date: string;
  time: string;
  duration: number;  // Duración en HORAS (ej: 1.5 = 1 hora y 30 minutos)
  buffer: number;    // Tiempo de preparación en MINUTOS
  totalPrice: number;
  deposit: number;
  balancePaid: number;
  status: Appointment['status'];
  attendance: Appointment['attendance'];
  notes: string;
  createdAt: string;
  updatedAt: string;
}
export interface NoticeDocument {
  _id: string;
  appointmentId: string;
  message: string;
  kind: NonNullable<Notice['kind']>;
  read: boolean;
  createdAt: string;
}
export interface DesignDocument {
  _id: string;
  clientId: string;
  serviceId: string;
  appointmentId?: string;
  image: string;
  note: string;
  createdAt: string;
}
export interface BitacoraDocument {
  _id: string;
  timestamp: string;
  scenario: string;
  action: string;
  appointmentId: string;
  result: 'ok' | 'error';
  message: string;
}
export interface DocumentState {
  clientas: ClientDocument[];
  manicuristas: ManicuristDocument[];
  servicios: ServiceDocument[];
  tiempos: ServiceTimeDocument[];
  citas: AppointmentDocument[];
  notificaciones: NoticeDocument[];
  disenos: DesignDocument[];
  bitacora: BitacoraDocument[];
}
export const COLLECTIONS = [
  'clientas',
  'manicuristas',
  'servicios',
  'tiempos',
  'citas',
  'notificaciones',
  'disenos',
  'bitacora',
] as const;

export function fromDocuments(d: DocumentState): AgendaState {
  for (const name of COLLECTIONS) {
    for (const row of d[name])
      if (typeof row._id !== 'string')
        throw new Error('Los identificadores deben ser texto, como en los ejemplos del proyecto.');
  }
  const clients: Client[] = d.clientas.map(({ _id, ...rest }) => ({ id: _id, ...rest }));
  const manicurists: Manicurist[] = d.manicuristas.map(({ _id, ...rest }) => ({
    id: _id,
    ...rest,
  }));
  const services: Service[] = d.servicios.map(({ _id, ...rest }) => ({ id: _id, ...rest }));
  const times: ServiceTime[] = d.tiempos.map(({ _id, ...rest }) => ({ id: _id, ...rest }));
  const appointments: Appointment[] = d.citas.map(({ _id, ...rest }) => ({
    id: _id,
    ...rest,
    client: clients.find((c) => c.id === rest.clientId)?.name || 'Clienta no disponible',
    manicurist:
      manicurists.find((m) => m.id === rest.manicuristId)?.name || 'Manicurista no disponible',
    service: services.find((s) => s.id === rest.serviceId)?.name || 'Servicio no disponible',
  }));
  const designs: Design[] = d.disenos.map(({ _id, ...rest }) => ({
    id: _id,
    ...rest,
    service: services.find((s) => s.id === rest.serviceId)?.name || 'Servicio no disponible',
  }));
  const notices: Notice[] = d.notificaciones
    .map(({ _id, ...rest }) => ({ id: _id, ...rest }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const log: BitacoraEntry[] = d.bitacora.map(({ _id, ...rest }) => ({ id: _id, ...rest }));
  return {
    clients,
    manicurists,
    services,
    times,
    appointments,
    designs,
    notices,
    log,
    // El escenario activo es el del restablecimiento más reciente en la bitácora.
    scenario: log.find((e) => e.action === 'restablecer-escenario')?.scenario ?? '',
  };
}

// Explicit projections keep display-only names and frontend IDs out of stored documents.
export function toDocuments(s: AgendaState): DocumentState {
  return {
    clientas: s.clients.map((c) => ({
      _id: c.id,
      name: c.name,
      description: c.description,
      createdAt: c.createdAt!,
    })),
    manicuristas: s.manicurists.map((m) => ({
      _id: m.id,
      name: m.name,
      active: m.active,
      createdAt: m.createdAt!,
    })),
    servicios: s.services.map((x) => ({
      _id: x.id,
      name: x.name,
      basePrice: x.basePrice,
      ...(x.defaultTimeId ? { defaultTimeId: x.defaultTimeId } : {}),
      active: x.active,
      createdAt: x.createdAt!,
    })),
    tiempos: s.times.map((t) => ({
      _id: t.id,
      label: t.label,
      duration: t.duration,
      buffer: t.buffer,
      active: t.active,
      createdAt: t.createdAt!,
    })),
    citas: s.appointments.map((a) => ({
      _id: a.id,
      clientId: a.clientId!,
      manicuristId: a.manicuristId,
      serviceId: a.serviceId,
      ...(a.timeId ? { timeId: a.timeId } : {}),
      date: a.date,
      time: a.time,
      duration: a.duration,
      buffer: a.buffer,
      totalPrice: a.totalPrice!,
      deposit: a.deposit,
      balancePaid: a.balancePaid,
      status: a.status,
      attendance: a.attendance,
      notes: a.notes,
      createdAt: a.createdAt!,
      updatedAt: a.updatedAt!,
    })),
    notificaciones: s.notices.map((n) => ({
      _id: n.id,
      appointmentId: n.appointmentId,
      message: n.message,
      kind: n.kind || 'success',
      read: n.read,
      createdAt: n.createdAt,
    })),
    disenos: s.designs.map((d) => ({
      _id: d.id,
      clientId: d.clientId,
      serviceId: d.serviceId,
      ...(d.appointmentId ? { appointmentId: d.appointmentId } : {}),
      image: d.image,
      note: d.note,
      createdAt: d.createdAt,
    })),
    bitacora: s.log.map((e) => ({
      _id: e.id,
      timestamp: e.timestamp,
      scenario: e.scenario,
      action: e.action,
      appointmentId: e.appointmentId,
      result: e.result,
      message: e.message,
    })),
  };
}

import { randomUUID } from 'node:crypto';
import type { AgendaState, Appointment } from '../domain/agenda.model.js';
import { type AgendaCommand, applyCommand, appendLogEntry } from '../domain/agenda.actions.js';
import type { AgendaRepository } from './mongo-agenda.repository.js';

export class AgendaInputError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}
export class AgendaService {
  constructor(private readonly repository: AgendaRepository) {}
  read(): Promise<AgendaState> {
    return this.repository.read();
  }
  async command(input: unknown): Promise<AgendaState> {
    if (
      !input ||
      typeof input !== 'object' ||
      !('payload' in input) ||
      !input.payload ||
      typeof input.payload !== 'object'
    )
      throw new AgendaInputError('Solicitud inválida.');
    const command = input as AgendaCommand;
    try {
      return await this.repository.change((old) => {
        try {
          return applyCommand(old, command, randomUUID, () => new Date().toISOString());
        } catch (e) {
          throw new AgendaInputError(e instanceof Error ? e.message : 'Revisa los datos.');
        }
      });
    } catch (e) {
      // A rejected booking is part of the experiment log; the failed transaction is
      // rolled back, so the entry is appended in its own locked write.
      if (command.action === 'save') {
        const payload = command.payload as Appointment;
        const message = e instanceof Error ? e.message : 'Revisa los datos.';
        try {
          await this.repository.change((old) =>
            appendLogEntry(
              old,
              {
                scenario: old.scenario,
                action: 'intento-rechazado',
                appointmentId: typeof payload?.id === 'string' ? payload.id : '',
                result: 'error',
                message,
              },
              randomUUID,
              () => new Date().toISOString(),
            ),
          );
        } catch {
          // La bitácora nunca debe impedir que el rechazo llegue al cliente.
        }
      }
      throw e;
    }
  }
}

import { randomUUID } from 'node:crypto';
import type { AgendaState } from '../domain/agenda.model.js';
import { type AgendaCommand, applyCommand } from '../domain/agenda.actions.js';
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
    return this.repository.change((old) => {
      try {
        return applyCommand(old, command, randomUUID, () => new Date().toISOString());
      } catch (e) {
        throw new AgendaInputError(e instanceof Error ? e.message : 'Revisa los datos.');
      }
    });
  }
}

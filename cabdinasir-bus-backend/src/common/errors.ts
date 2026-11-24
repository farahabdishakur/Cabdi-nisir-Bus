import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Khalad ganacsi oo leh koodh. Frontend-ka ayaa koodhka u turjuma Af-Soomaali.
 * Format: { "error": { "code", "message", "details" } }
 */
export class AppError extends HttpException {
  constructor(
    public readonly code: string,
    message: string,
    status: HttpStatus = HttpStatus.BAD_REQUEST,
    public readonly details?: Record<string, unknown>,
  ) {
    super({ code, message, details }, status);
  }
}

export const Errors = {
  notFound: (entity: string, id?: string) =>
    new AppError('NOT_FOUND', `${entity} not found`, HttpStatus.NOT_FOUND, id ? { id } : undefined),
  forbiddenBranch: () =>
    new AppError('FORBIDDEN_BRANCH', 'You cannot access data of another branch', HttpStatus.FORBIDDEN),
  forbidden: (message = 'Not allowed') => new AppError('FORBIDDEN', message, HttpStatus.FORBIDDEN),
  invalidState: (entity: string, from: string, to: string) =>
    new AppError('INVALID_STATUS_TRANSITION', `${entity} cannot go from ${from} to ${to}`, HttpStatus.CONFLICT, {
      from,
      to,
    }),
  conflict: (code: string, message: string, details?: Record<string, unknown>) =>
    new AppError(code, message, HttpStatus.CONFLICT, details),
  bad: (code: string, message: string, details?: Record<string, unknown>) =>
    new AppError(code, message, HttpStatus.BAD_REQUEST, details),
};

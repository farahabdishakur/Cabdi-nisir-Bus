import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Response } from 'express';
import { AppError } from './errors';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    const { status, body } = this.toBody(exception);
    if (status >= 500) this.logger.error(exception instanceof Error ? exception.stack : exception);
    res.status(status).json({ error: body });
  }

  private toBody(e: unknown): { status: number; body: { code: string; message: string; details?: unknown } } {
    if (e instanceof AppError) {
      return { status: e.getStatus(), body: { code: e.code, message: e.message, details: e.details } };
    }
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === 'P2002' && /mobile_ref|reference/.test(String(e.meta?.target ?? '') + e.message)) {
        return { status: HttpStatus.CONFLICT, body: { code: 'MOBILE_REFERENCE_USED', message: 'This Zaad/eDahab transaction was already used' } };
      }
      if (e.code === 'P2002' && /fleetNo/.test(String(e.meta?.target ?? '') + e.message)) {
        return { status: HttpStatus.CONFLICT, body: { code: 'FLEET_NO_USED', message: 'This bus number is already used' } };
      }
      if (e.code === 'P2002') {
        return {
          status: HttpStatus.CONFLICT,
          body: { code: 'DUPLICATE', message: 'Record already exists', details: { target: e.meta?.target } },
        };
      }
      if (e.code === 'P2025') {
        return { status: HttpStatus.NOT_FOUND, body: { code: 'NOT_FOUND', message: 'Record not found' } };
      }
    }
    if (e instanceof HttpException) {
      const status = e.getStatus();
      const r = e.getResponse() as string | { message?: string | string[] };
      const message = typeof r === 'string' ? r : r.message;
      const code =
        status === 400 ? 'VALIDATION_ERROR'
        : status === 401 ? 'UNAUTHORIZED'
        : status === 403 ? 'FORBIDDEN'
        : status === 404 ? 'NOT_FOUND'
        : status === 429 ? 'TOO_MANY_REQUESTS'
        : 'HTTP_ERROR';
      return {
        status,
        body: {
          code,
          message: Array.isArray(message) ? 'Validation failed' : (message ?? e.message),
          details: Array.isArray(message) ? { fields: message } : undefined,
        },
      };
    }
    return { status: 500, body: { code: 'INTERNAL_ERROR', message: 'Internal server error' } };
  }
}

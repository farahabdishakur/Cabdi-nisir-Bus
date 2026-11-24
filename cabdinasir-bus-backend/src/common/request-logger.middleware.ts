import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { NextFunction, Request, Response } from 'express';

/** Request kasta: X-Request-Id + log (method, path, status, ms). Cilad baadhis ayay fududaysaa. */
@Injectable()
export class RequestLoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(req: Request, res: Response, next: NextFunction) {
    const id = (req.headers['x-request-id'] as string) || randomUUID();
    res.setHeader('X-Request-Id', id);
    const start = Date.now();
    res.on('finish', () => {
      if (process.env.NODE_ENV === 'test') return;
      this.logger.log(`${id} ${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - start}ms`);
    });
    next();
  }
}

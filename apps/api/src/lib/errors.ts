/**
 * Global error handler
 */

import { FastifyError, FastifyReply, FastifyRequest } from 'fastify';

export class AppError extends Error {
  statusCode: number;
  code: string;
  details?: Record<string, unknown>;

  constructor(message: string, statusCode: number, code: string, details?: Record<string, unknown>) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export function errorHandler(error: FastifyError | AppError, request: FastifyRequest, reply: FastifyReply) {
  if (error instanceof AppError) {
    return reply.status(error.statusCode).send({
      error: error.code,
      message: error.message,
      details: error.details,
    });
  }

  // Zod validation errors
  if ((error as any).validation) {
    return reply.status(400).send({
      error: 'VALIDATION_ERROR',
      message: 'Request validation failed',
      details: (error as any).validation,
    });
  }

  request.log.error(error);

  return reply.status(500).send({
    error: 'INTERNAL_ERROR',
    message: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message,
  });
}

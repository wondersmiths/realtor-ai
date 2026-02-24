/**
 * Base application error with HTTP status code and machine-readable code.
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;

  constructor(message: string, statusCode = 500, code = 'INTERNAL_ERROR') {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    // Ensure proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, new.target.prototype);
  }

  toJSON() {
    return {
      error: {
        message: this.message,
        code: this.code,
        statusCode: this.statusCode,
      },
    };
  }
}

/**
 * Resource not found (HTTP 404).
 */
export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, 404, 'NOT_FOUND');
    this.name = 'NotFoundError';
  }
}

/**
 * Access denied - the user is authenticated but lacks permission (HTTP 403).
 */
export class ForbiddenError extends AppError {
  constructor(message = 'Access denied') {
    super(message, 403, 'FORBIDDEN');
    this.name = 'ForbiddenError';
  }
}

/**
 * Authentication required or invalid credentials (HTTP 401).
 */
export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 401, 'UNAUTHORIZED');
    this.name = 'UnauthorizedError';
  }
}

/**
 * Request validation failed (HTTP 422).
 */
export class ValidationError extends AppError {
  public readonly fieldErrors: Record<string, string[]>;

  constructor(message = 'Validation failed', fieldErrors: Record<string, string[]> = {}) {
    super(message, 422, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
    this.fieldErrors = fieldErrors;
  }

  toJSON() {
    return {
      error: {
        message: this.message,
        code: this.code,
        statusCode: this.statusCode,
        fieldErrors: this.fieldErrors,
      },
    };
  }
}

/**
 * Usage limit or subscription quota exceeded (HTTP 429).
 */
export class QuotaExceededError extends AppError {
  public readonly limit: number;
  public readonly current: number;

  constructor(message = 'Quota exceeded', limit = 0, current = 0) {
    super(message, 429, 'QUOTA_EXCEEDED');
    this.name = 'QuotaExceededError';
    this.limit = limit;
    this.current = current;
  }

  toJSON() {
    return {
      error: {
        message: this.message,
        code: this.code,
        statusCode: this.statusCode,
        limit: this.limit,
        current: this.current,
      },
    };
  }
}

/**
 * AI service failure - model call, timeout, or rate limit (HTTP 502).
 */
export class AIServiceError extends AppError {
  public readonly model?: string;
  public readonly retryable: boolean;

  constructor(message = 'AI service unavailable', model?: string, retryable = true) {
    super(message, 502, 'AI_SERVICE_ERROR');
    this.name = 'AIServiceError';
    this.model = model;
    this.retryable = retryable;
  }

  toJSON() {
    return {
      error: {
        message: this.message,
        code: this.code,
        statusCode: this.statusCode,
        model: this.model,
        retryable: this.retryable,
      },
    };
  }
}

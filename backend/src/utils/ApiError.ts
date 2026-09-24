export interface FieldError {
  field?: string;
  message: string;
}

export class ApiError extends Error {
  public statusCode: number;
  public code: string;
  public errors: FieldError[];

  constructor(statusCode: number, message: string, code?: string, errors: FieldError[] = []) {
    super(message);
    this.statusCode = statusCode;
    this.code = code || ApiError.defaultCode(statusCode);
    this.errors = errors;
    Object.setPrototypeOf(this, ApiError.prototype);
  }

  private static defaultCode(status: number): string {
    switch (status) {
      case 400: return 'BAD_REQUEST';
      case 401: return 'AUTH_REQUIRED';
      case 403: return 'FORBIDDEN';
      case 404: return 'RESOURCE_NOT_FOUND';
      case 409: return 'CONFLICT';
      case 422: return 'VALIDATION_ERROR';
      case 429: return 'RATE_LIMITED';
      case 500: return 'SERVER_ERROR';
      case 503: return 'DATABASE_ERROR';
      default: return 'ERROR';
    }
  }

  static badRequest(message: string, codeOrErrors?: string | FieldError[], errors: FieldError[] = []) {
    if (Array.isArray(codeOrErrors)) {
      return new ApiError(400, message, 'BAD_REQUEST', codeOrErrors);
    }
    return new ApiError(400, message, codeOrErrors || 'BAD_REQUEST', errors);
  }

  static unauthorized(message = 'Authentication required', code = 'AUTH_REQUIRED') {
    return new ApiError(401, message, code);
  }

  static forbidden(message = 'You do not have access to this resource', code = 'FORBIDDEN') {
    return new ApiError(403, message, code);
  }

  static notFound(message = 'Resource not found', code = 'RESOURCE_NOT_FOUND') {
    return new ApiError(404, message, code);
  }

  static conflict(message: string, codeOrErrors?: string | FieldError[], errors: FieldError[] = []) {
    if (Array.isArray(codeOrErrors)) {
      return new ApiError(409, message, 'CONFLICT', codeOrErrors);
    }
    return new ApiError(409, message, codeOrErrors || 'CONFLICT', errors);
  }

  static unprocessable(message: string, codeOrErrors?: string | FieldError[], errors: FieldError[] = []) {
    if (Array.isArray(codeOrErrors)) {
      return new ApiError(422, message, 'VALIDATION_ERROR', codeOrErrors);
    }
    return new ApiError(422, message, codeOrErrors || 'VALIDATION_ERROR', errors);
  }

  static tooManyRequests(message = 'Too many requests, please try again later', code = 'RATE_LIMITED') {
    return new ApiError(429, message, code);
  }

  static internal(message = 'Something went wrong', code = 'SERVER_ERROR') {
    return new ApiError(500, message, code);
  }

  static database(message = 'Database operation failed', code = 'DATABASE_ERROR', statusCode = 503) {
    return new ApiError(statusCode, message, code);
  }
}

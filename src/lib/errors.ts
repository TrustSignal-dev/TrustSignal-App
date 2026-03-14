export class AppError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code: string
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class RequestValidationError extends AppError {
  constructor(message: string, code = "invalid_request") {
    super(message, 400, code);
  }
}

export class AuthenticationError extends AppError {
  constructor(message = "Unauthorized", code = "unauthorized") {
    super(message, 401, code);
  }
}

export class ConflictError extends AppError {
  constructor(message: string, code = "conflict") {
    super(message, 409, code);
  }
}

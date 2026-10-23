type ErrorBody = { message?: string; code?: string };

export class ApiError extends Error {
  status: number | null;
  code?: string;
  details?: unknown;

  constructor(message: string, status: number | null, code?: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function createApiError(status: number, body: unknown, fallback: string): ApiError {
  const b = (typeof body === "object" && body !== null ? body : {}) as ErrorBody;
  return new ApiError(b.message ?? fallback, status, b.code, body);
}

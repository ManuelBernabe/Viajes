const GENERIC = 'No se ha podido completar. Inténtalo de nuevo.';

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init.headers },
  });

  if (!response.ok) {
    let message = GENERIC;
    let code: string | undefined;
    try {
      const problem = (await response.json()) as { detail?: string; title?: string; type?: string };
      message = problem.detail ?? problem.title ?? GENERIC;
      code = problem.type;
    } catch {
      // Respuesta sin cuerpo JSON: queda el mensaje genérico.
    }
    throw new ApiError(response.status, message, code);
  }

  return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
}

export function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }
  if (error instanceof TypeError) {
    return 'Sin conexión. Inténtalo cuando tengas cobertura.';
  }
  return GENERIC;
}

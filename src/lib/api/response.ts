import "server-only";
import type { ApiErrorCode, ApiResult } from "@marketplace/shared";
import { ViewerError } from "@/lib/auth/viewer";

const headers = { "Cache-Control": "private, no-store" };

export class ApiError extends Error {
  constructor(public readonly status: number, public readonly code: ApiErrorCode, message: string) {
    super(message);
  }
}

export function ok<T>(data: T, status = 200) {
  return Response.json({ data } satisfies ApiResult<T>, { status, headers });
}

export function fail(status: number, code: ApiErrorCode, message: string) {
  return Response.json({ error: { code, message } } satisfies ApiResult<never>, { status, headers });
}

// Converts known errors to ApiResult responses and rethrows anything unexpected.
export async function handle(run: () => Promise<Response>) {
  try {
    return await run();
  } catch (error) {
    if (error instanceof ApiError) return fail(error.status, error.code, error.message);
    if (error instanceof ViewerError) {
      const code = error.status === 401 ? "UNAUTHENTICATED" : error.status === 403 ? "FORBIDDEN" : "UNAVAILABLE";
      return fail(error.status, code, error.message);
    }
    console.error(error);
    return fail(500, "UNAVAILABLE", "Something went wrong. Try again.");
  }
}
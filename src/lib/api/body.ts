import "server-only";
import type { z } from "zod";
import { ApiError } from "@/lib/api/response";

export async function readJson<T extends z.ZodType>(request: Request, schema: T): Promise<z.infer<T>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new ApiError(400, "INVALID_INPUT", "Send a JSON body.");
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError(400, "INVALID_INPUT", parsed.error.issues[0]?.message ?? "Check the request and try again.");
  }
  return parsed.data;
}
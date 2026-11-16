import type { ApiResult, Viewer } from "@marketplace/shared";
import { requireViewer, ViewerError } from "@/lib/auth/viewer";

export async function GET() {
  const headers = { "Cache-Control": "private, no-store" };
  try {
    const data = await requireViewer();
    return Response.json({ data } satisfies ApiResult<Viewer>, { headers });
  } catch (error) {
    if (!(error instanceof ViewerError)) throw error;
    const code = error.status === 401 ? "UNAUTHENTICATED" : error.status === 403 ? "FORBIDDEN" : "UNAVAILABLE";
    return Response.json(
      { error: { code, message: error.message } } satisfies ApiResult<Viewer>,
      { status: error.status, headers },
    );
  }
}

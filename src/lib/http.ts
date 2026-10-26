import { z } from "zod";

export class AppError extends Error {
  constructor(
    public code: string,
    public status = 400,
  ) {
    super(code);
  }
}
export function assertOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const allowed = new Set([new URL(request.url).origin]);
  if (process.env.APP_URL) allowed.add(new URL(process.env.APP_URL).origin);
  if (process.env.VERCEL_URL) allowed.add(`https://${process.env.VERCEL_URL}`);
  if (!origin || !allowed.has(origin)) throw new AppError("forbidden", 403);
}
export async function readJson<T>(
  request: Request,
  schema: z.ZodType<T>,
  maxBytes = 400_000,
): Promise<T> {
  if (!request.headers.get("content-type")?.includes("application/json"))
    throw new AppError("invalid_input");
  const reader = request.body?.getReader();
  if (!reader) throw new AppError("invalid_input");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > maxBytes) {
      await reader.cancel();
      throw new AppError("too_large", 413);
    }
    chunks.push(value);
  }
  try {
    return schema.parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
  } catch {
    throw new AppError("invalid_input");
  }
}
export function apiError(error: unknown) {
  if (error instanceof AppError)
    return Response.json(
      { error: error.code },
      { status: error.status, headers: { "Cache-Control": "no-store" } },
    );
  console.error("request_failed", {
    type: error instanceof Error ? error.name : "unknown",
  });
  return Response.json(
    { error: "service_error" },
    { status: 500, headers: { "Cache-Control": "no-store" } },
  );
}
export function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

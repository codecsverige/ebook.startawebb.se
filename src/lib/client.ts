export class RequestError extends Error {
  constructor(
    public code: string,
    public status = 400,
  ) {
    super(code);
  }
}
export async function request<T>(
  url: string,
  options: RequestInit = {},
): Promise<T> {
  const res = await fetch(url, {
    ...options,
    cache: "no-store",
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  const data = await res.json().catch(() => ({ error: "service_error" }));
  if (!res.ok)
    throw new RequestError(data.error || "service_error", res.status);
  return data as T;
}
export function codeOf(e: unknown) {
  return e instanceof RequestError ? e.code : "service_error";
}

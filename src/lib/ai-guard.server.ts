// Light abuse protection for the editor's AI endpoints (the app has no sign-in).
// - only same-site browser requests from the editor are accepted
// - a best-effort per-visitor rate limit (in-memory, per server instance)

const WINDOW_MS = 10 * 60 * 1000;
const MAX_REQUESTS = 15;
const hits = new Map<string, number[]>();

export function checkAiRequest(request: Request): Response | null {
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") {
    return Response.json({ error: { message: "AI tools can only be used from the PhotoEarnAI editor." } }, { status: 403 });
  }
  const origin = request.headers.get("origin");
  if (origin) {
    try {
      if (new URL(origin).host !== new URL(request.url).host && site !== "same-origin") {
        return Response.json({ error: { message: "AI tools can only be used from the PhotoEarnAI editor." } }, { status: 403 });
      }
    } catch {
      return Response.json({ error: { message: "Bad origin" } }, { status: 403 });
    }
  }

  const visitor =
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "local";
  const now = Date.now();
  const recent = (hits.get(visitor) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_REQUESTS) {
    const retryAfter = Math.ceil((WINDOW_MS - (now - (recent[0] ?? now))) / 1000);
    return Response.json(
      { error: { message: "Too many AI requests. Please wait a few minutes and try again." } },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }
  recent.push(now);
  hits.set(visitor, recent);
  if (hits.size > 5000) hits.clear();
  return null;
}

export const ALLOWED_SIZES = ["1024x1024", "1536x1024", "1024x1536"] as const;
export const MAX_PROMPT = 1000;
export const MAX_IMAGE_BYTES = 12 * 1024 * 1024;

export function passThrough(upstream: Response) {
  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      "Content-Type": upstream.headers.get("Content-Type") ?? "application/json",
      "Cache-Control": "no-cache",
    },
  });
}

import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { ALLOWED_SIZES, MAX_PROMPT, checkAiRequest, passThrough } from "@/lib/ai-guard.server";
import { generateImage, imageSettings } from "@/lib/image-gateway.server";

const Body = z.object({
  prompt: z.string().trim().min(3).max(MAX_PROMPT),
  size: z.enum(ALLOWED_SIZES).default("1024x1024"),
  stream: z.boolean().default(true),
});

export const Route = createFileRoute("/api/ai/generate-image")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const blocked = checkAiRequest(request);
        if (blocked) return blocked;
        const parsed = Body.safeParse(await request.json().catch(() => null));
        if (!parsed.success) {
          return Response.json({ error: { message: "Please describe the picture (3–1000 characters)." } }, { status: 400 });
        }
        const apiKey = process.env["LOVABLE_API_KEY"];
        if (!apiKey) return Response.json({ error: { message: "AI is not configured." } }, { status: 500 });
        const { prompt, size, stream } = parsed.data;
        const upstream = await generateImage({ ...imageSettings, apiKey }, prompt, stream, { size });
        return passThrough(upstream);
      },
    },
  },
});

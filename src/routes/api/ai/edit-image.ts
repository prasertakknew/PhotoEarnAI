import { createFileRoute } from "@tanstack/react-router";

import { ALLOWED_SIZES, MAX_IMAGE_BYTES, MAX_PROMPT, checkAiRequest, passThrough } from "@/lib/ai-guard.server";
import { editImage, imageSettings } from "@/lib/image-gateway.server";

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];

export const Route = createFileRoute("/api/ai/edit-image")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const blocked = checkAiRequest(request);
        if (blocked) return blocked;
        const incoming = await request.formData().catch(() => null);
        if (!incoming) return Response.json({ error: { message: "Expected an image upload." } }, { status: 400 });

        const prompt = incoming.get("prompt");
        const image = incoming.get("image");
        const size = String(incoming.get("size") ?? "auto");
        const background = String(incoming.get("background") ?? "auto");
        if (typeof prompt !== "string" || prompt.trim().length < 3 || prompt.length > MAX_PROMPT) {
          return Response.json({ error: { message: "Please describe the change (3–1000 characters)." } }, { status: 400 });
        }
        if (!(image instanceof File) || !IMAGE_TYPES.includes(image.type) || image.size > MAX_IMAGE_BYTES) {
          return Response.json({ error: { message: "The picture must be a PNG, JPG or WebP under 12 MB." } }, { status: 400 });
        }

        // Forward only the fields this editor uses.
        const form = new FormData();
        form.set("prompt", prompt.trim());
        form.set("image", image, image.name || "layer.png");
        if ((ALLOWED_SIZES as readonly string[]).includes(size)) form.set("size", size);
        if (background === "transparent") {
          form.set("background", "transparent");
          form.set("output_format", "png");
        }
        form.set("stream", incoming.get("stream") === "false" ? "false" : "true");

        const apiKey = process.env["LOVABLE_API_KEY"];
        if (!apiKey) return Response.json({ error: { message: "AI is not configured." } }, { status: 500 });
        const upstream = await editImage({ ...imageSettings, apiKey }, form);
        return passThrough(upstream);
      },
    },
  },
});

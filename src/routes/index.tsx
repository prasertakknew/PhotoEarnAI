import { createFileRoute } from "@tanstack/react-router";
import { useRef } from "react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "PhotoEarnAI — Free Online Photo & Graphics Editor" },
      {
        name: "description",
        content:
          "PhotoEarnAI is a free Thai/English browser photo editor with layers, filters, Clone Stamp, custom tools, presets, plug-ins, fonts, PSD and GIF/MP4 export.",
      },
      { property: "og:title", content: "PhotoEarnAI — Free Online Photo & Graphics Editor" },
      {
        property: "og:description",
        content:
          "Edit photos in your browser: layers, filters, text, Clone Stamp, custom tools, presets, plug-ins and fonts.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: EditorPage,
});

// The editor is a self-contained local-first app served from /editor/.
// It runs in a full-screen frame so its own stylesheet and global scripts
// stay isolated from the React shell.
function EditorPage() {
  const frameRef = useRef<HTMLIFrameElement>(null);
  return (
    <main className="editor-shell">
      <h1 className="sr-only">PhotoEarnAI editor</h1>
      <iframe
        ref={frameRef}
        src="/editor/index.html"
        title="PhotoEarnAI editor"
        className="editor-frame"
        allow="clipboard-read; clipboard-write; fullscreen"
        onLoad={() => frameRef.current?.focus()}
      />
    </main>
  );
}

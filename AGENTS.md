<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Project rules

- The PhotoEarnAI editor is a self-contained vanilla-JS app in `public/editor/`, embedded full-screen by `src/routes/index.tsx` via an iframe; keep editor code there (classic scripts sharing `window.photoearnai`) so its global CSS/JS stays isolated from the React shell.
- Never overwrite `window.photoearnai`; extend it with `Object.assign` because several scripts register on it in sequence.
- Third-party browser libraries the editor needs at runtime (ffmpeg class/worker, gifenc) are vendored under `public/editor/vendor/`, because Web Workers must be same-origin; only large core/wasm files may come from a CDN via Blob URLs.
- `vendor/photocraft-source/` is an unmodified upstream reference tree, not built or linted; don't import from it.
- Architecture/design docs from the original project live in `docs/photoearnai/`.
- Undo: call `history.captureSnapshot(name)` BEFORE mutating; each step stores cloned layers (masks, metadata, doc size), because Undo restores the pre-change state and pushes the current one to Redo.
- Selections are one document-sized alpha mask in `engine.selectionMgr` (`js/engine/selection.js`), shared by Marquee, Lasso and Magic Wand, so delete/copy/fill/mask/paint-clipping all use one representation.
- Layer masks are an alpha-only canvas on `Layer.mask` (opaque = shown); compositing goes through `Layer.getRenderSource()`, so new render paths must use it instead of `layer.canvas`.
- Editor AI calls go to same-origin TanStack server routes `src/routes/api/ai/*`, which proxy the Lovable AI Gateway with `LOVABLE_API_KEY`; `src/lib/ai-guard.server.ts` (same-origin check + rate limit + input caps) is required because the app has no sign-in.

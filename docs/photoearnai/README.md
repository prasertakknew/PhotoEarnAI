# PhotoEarnAI

PhotoEarnAI is a free, local-first browser editor for raster and vector-oriented workflows. It is a fork-level rebrand and extension of the supplied clean-room browser prototype, informed by the supplied PhotoCraft architecture and the repository's REA (Reverse Engineer Anything) guidance.

Photopea is used only as a public product-behavior and layout reference. This project does not copy proprietary Photopea source, bundles, fonts, logos, or assets. The browser implementation is original or inherited from the supplied repository under its applicable open-source license.

## Delivered editor capabilities

The current runnable slice includes a layered HTML5 Canvas compositor; local new-document and image import/drop workflows; brush, eraser, bucket, shape, move, marquee, text, eyedropper, hand, and zoom tools; layer visibility, opacity, blend modes, ordering, duplication, merge, delete, undo, redo, and export; brightness/contrast, invert, grayscale, sepia, blur, sharpen, and vignette filters; project JSON save/load; and a preloaded neon camera demo.

PhotoEarnAI adds a Thai/English live language switcher and a local Studio panel. Studio lets users create custom tools, presets, and filters; import local JavaScript plug-ins; load fonts through the browser FontFace API; edit text layers; and place a logo or watermark as a normal editable layer with scale, opacity, position, and tiling controls. Extension metadata is persisted in this browser and is included in PhotoEarnAI project JSON.

The advanced feature layer now includes lazy `ag-psd@25.0.0` browser parsing/export through [`js/core/psdWasm.js`](js/core/psdWasm.js), PSD layer/group metadata, blend-mode mapping, text/mask/effect metadata preservation, and a parse→write→parse roundtrip counter. It also includes [`js/core/ffmpegWasm.js`](js/core/ffmpegWasm.js) for optional ffmpeg.wasm frame extraction at 2 fps, MP4/GIF export, drag-and-drop video import, and a visible progress bar. Brush dynamics, scattering, texture, smart-object transform metadata, Curves/Levels/HSL adjustment layers, and Drop Shadow/Bevel layer styles are implemented in separate engine modules and exposed in the advanced brush panel.

The interface is local-only: artwork is not uploaded and the static server does not store files. Plug-ins are explicitly user-selected local modules and may run code in the current page, so users should only load files they trust.

The default opening state follows a Photopea-style workspace: Move Tool is active, the canvas is unobstructed, the complete tool rail is on the left, foreground is `#0e8aef`, background is white, and Virtual Keys is available at the bottom of the rail. Advanced Brush controls appear only after selecting the Advanced Brush tool. The rail includes rectangular marquee, lasso, crop, eyedropper, regular/advanced brush, clone stamp, eraser, gradient, bucket, blur, text, pen, shape, hand, and zoom tools.

Pen is a freehand signature tool: select it and drag on the canvas to draw a thin ink stroke; use Text Tool when typed text is required. Video export sorts animation layers by frame index, uses ffmpeg.wasm for MP4/GIF when available, and falls back to the browser MediaRecorder for MP4/WebM when FFmpeg cannot initialize.

FFmpeg is initialized with an explicit jsDelivr `worker.js` URL. This avoids the default esm.sh worker URL being rejected by the embedded Preview origin, while the core JavaScript and WASM assets continue to load through Blob URLs.

Clone Stamp usage: select `S`, hold `Alt` (or click the latched Virtual Keys `Alt` button), click the source pixels, release Alt, then drag where the copy should appear. Virtual Keys stay latched until clicked again or reset with `NoTouch`; physical Ctrl/Alt/Shift key presses also synchronize the indicators.

## Architecture

The detailed subsystem map, data flow, extension boundaries, clean-room boundary, and future PhotoCraft/WASM migration seams are in [`docs/architecture.md`](docs/architecture.md). The implementation decisions and design system are in [`plan.md`](plan.md). Outcome-based acceptance clauses are in [`TODO.md`](TODO.md).

The primary source folders are:

- `js/engine/` for the document canvas and independent layer buffers.
- `js/tools/` for built-in pointer tools.
- `js/filters/` for pixel operations.
- `js/history/` for snapshots and undo/redo.
- `js/core/` for bilingual UI, extension registry, project serialization, watermark placement, and Studio UI.
- `css/` and `index.html` for the editor shell and visual system.

The complete upstream PhotoCraft source snapshot is preserved under `vendor/photocraft-source/` with its original notices and a `PHOTOEARNAI-REFERENCE.md` handoff note. It is an unmodified reference tree and is not loaded by the browser runtime; PhotoEarnAI's runnable app remains isolated at the repository root.

## Run locally

Requirements: Node.js 18 or newer. From the project root:

```bash
npm start
```

The server listens on `http://localhost:3000` by default and honors `PORT` when supplied. It binds `0.0.0.0` for managed Preview. The route manifest is available at `/manus-routes.json` and the health endpoint is `/health`.

Run checks with:

```bash
npm run check
npm run test:smoke
```

## Supported format boundary

The current browser slice imports common raster images, PhotoEarnAI JSON projects, PSD through the lazy ag-psd adapter, and video through ffmpeg.wasm when the CDN/core can load (with an HTMLVideoElement frame fallback). ag-psd is a JavaScript library rather than a WASM binary, so the requested file name `psdWasm.js` is retained as the integration seam but the UI/docs do not claim a native ag-psd WASM codec. Full 307/309 PhotoCraft parity, AI, Sketch, vector, RAW, and all Photoshop effects remain open compatibility milestones and require independent fixtures/tests; the app does not silently pretend that an ag-psd decode covers every PSD feature.

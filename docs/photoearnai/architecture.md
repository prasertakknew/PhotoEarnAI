# PhotoEarnAI architecture

PhotoEarnAI is a local-first browser graphics editor assembled from the supplied clean-room `photopea-clone` and informed by the supplied PhotoCraft repository's layered Rust architecture. The implementation deliberately separates observations from design choices: Photopea provided only broad public behavior and layout observations; all code in this project is original or supplied under its respective open-source license.

## Runtime topology

```text
Browser
  ├─ index.html
  ├─ css/style.css
  ├─ js/app.js                         composition root
  ├─ js/core/i18n.js                   bilingual catalog + live UI updates
  ├─ js/core/extensionRegistry.js      user-owned capability registry
  ├─ js/core/projectManager.js         project JSON serialization
  ├─ js/core/watermarkManager.js       logo/watermark layer creation
  ├─ js/engine/canvasEngine.js         document and compositor
  ├─ js/engine/layer.js                independent layer buffers
  ├─ js/engine/brushEngine.js          dynamics/scatter/texture stamps
  ├─ js/engine/smartObject.js          lossless source/transform metadata
  ├─ js/engine/adjustmentLayers.js     Curves/Levels/HSL compositor pass
  ├─ js/engine/layerStyles.js          Drop Shadow/Bevel compositor pass
  ├─ js/tools/toolManager.js           pointer tools and tool state
  ├─ js/tools/brushToolAdvanced.js     advanced brush binding
  ├─ js/filters/filterEngine.js        pixel algorithms
  └─ js/history/historyManager.js      snapshots, undo, redo

Node static server
  ├─ serves all static files
  ├─ honors PORT and binds 0.0.0.0 for managed Preview
  ├─ exposes /manus-routes.json
  └─ does not receive or persist image pixels

Optional browser integrations
  ├─ js/core/psdWasm.js                lazy ag-psd@25 read/write adapter
  └─ js/core/ffmpegWasm.js             lazy ffmpeg.wasm frame/export adapter

Reference source
  └─ vendor/photocraft-source/  complete upstream PhotoCraft snapshot, not runtime-loaded
```

The editor has no backend and does not upload user artwork. Browser localStorage stores settings, extension records, and the last selected language. Project JSON is downloaded or loaded explicitly by the user.

## Document model

A document is an `engine` state object with a name, width, height, viewport transform, active layer index, and ordered `Layer[]`. Each layer owns an offscreen HTML canvas and composition metadata:

```js
{
  id,
  name,
  width,
  height,
  x,
  y,
  opacity,
  blendMode,
  visible,
  locked,
  dataUrl
}
```

The compositor clears the display canvas and draws visible layers from bottom to top with `globalAlpha`, `globalCompositeOperation`, and layer offsets. Layer thumbnails are generated on demand for the Layers dock. The history manager serializes the engine state before a mutating command and restores asynchronous layer images when undoing or loading a project.

## Interaction pipeline

Pointer events enter `ToolManager`, which converts viewport coordinates to document coordinates through `CanvasEngine.screenToDoc`. The active tool then mutates only the active layer or viewport state. Brush and eraser use interpolated strokes; bucket uses bounded flood fill; shape and text draw into the layer buffer; move updates layer offsets; hand and zoom update the viewport transform. Each mutating action captures a history snapshot before the first pixel change.

The built-in tools are intentionally thin. The extension registry can add custom tool buttons with a safe declared action. Custom tools are not granted arbitrary DOM or network access by the registry; they receive the editor API only through the explicit adapter used by the action.

## Filter pipeline

Built-in filters operate on `ImageData` for the active layer. The current engine includes brightness/contrast, invert, grayscale, sepia, blur, sharpen, and vignette. Custom filters are registered as declarative records and can be applied through the Studio panel. A custom filter is parsed into a bounded operation such as brightness, contrast, grayscale, invert, sepia, or vignette rather than evaluated as unrestricted source code.

This boundary keeps extension data portable and makes project JSON deterministic. More advanced filters can be added later as versioned operations with their own parameter schemas.

## Extension registry

`ExtensionRegistry` is the single owner for user-owned extension metadata. It normalizes IDs, validates names, applies per-record limits, persists JSON under a versioned localStorage key, and exposes collections for the UI.

Supported record types:

- `tool`: display name, shortcut, description, and bounded action.
- `preset`: name, category, and settings such as opacity, blend mode, and filter operation.
- `filter`: name and one bounded filter operation.
- `plugin`: local module filename, manifest name, and capability text.
- `font`: family name, style, and session-only loading state.
- `watermark`: filename, opacity, scale, position, and tiled configuration.

The registry is storage-backed but failure-tolerant: malformed records are skipped, quota errors surface as a visible toast, and the editor remains usable.

## PSD adapter

`PsdWasmAdapter` is loaded only after File → Open PSD or File → Export PSD. It calls ag-psd's browser `readPsd` and `writePsd` APIs, maps nested `children` into PhotoEarnAI layer/group records, carries common blend modes, and retains text, mask, and effects metadata on imported layers. Export writes a real PSD blob. After parsing, the adapter performs a lightweight write→read layer-count roundtrip and reports the result. The requested filename is retained for the integration contract, but ag-psd 25 is a JavaScript codec rather than a WASM binary; the UI/docs do not claim otherwise. Full PhotoCraft 307/309 fixture parity and all 27-mode/effect parity remain future test milestones.

## Video frame pipeline

`FfmpegWasmAdapter` lazily loads `@ffmpeg/ffmpeg@0.12.10`, `@ffmpeg/util`, and the pinned `@ffmpeg/core@0.12.10` ESM core. Import writes the selected local file into the virtual FFmpeg filesystem, runs `fps=2` image extraction, and turns each PNG into an `animationFrame` layer. Export writes those layers back and runs either the `libx264` MP4 command or a palette generation/paletteuse GIF command. Progress events update `#ffmpeg-progress`. If the optional core cannot load, an HTMLVideoElement seek/draw fallback preserves the frame-layer workflow without uploading the source.

## Non-destructive feature paths

Brush input is routed through `BrushEngine` before the legacy stamp path. The engine computes pressure-scaled radius, spacing, scattering offsets, hardness gradients, and a bounded texture pattern. A Smart Object stores source identity and a transform object rather than baking a transform into source pixels. Adjustment layers are transparent records that run a compositor pass on the current display context; Layer Styles draw shadow/bevel passes around the original layer, then the normal layer draw remains intact. All these metadata paths are included in `Layer.toJSON()` and restored by `Layer.fromJSON()`.

## Text editing

Text layers carry a metadata marker and the original text settings in the layer object. The Text editor reads the selected layer, presents content/font/size/color/weight/alignment controls, clears the layer buffer, redraws the text, and refreshes the composite. The implementation remains raster-backed today, while the metadata boundary leaves room for a future vector text layer.

Uploaded fonts use `FontFace` with an object URL. The binary stays in memory for the current session; only family/style metadata is persisted. This avoids pretending that localStorage is a durable font binary store.

## Watermark and logo workflow

The watermark manager accepts a browser `File`, loads it into an image, creates a new layer sized to the document, and draws the logo either once or in a tiled pattern. Scale, x/y position, opacity, and tiled mode are validated before drawing. The result is an ordinary layer, so it participates in visibility, blending, history, project export, and later editing like any other artwork.

## Project persistence

Project JSON stores document metadata, serialized layer data URLs, the active layer, and extension metadata. The project manager uses browser downloads for save and a file input for load. Import is limited to the project shape and reports a user-facing error for malformed data. This is separate from Photoshop PSD/AI/Sketch codecs; those are future milestones and are not falsely advertised by this browser slice.

## Localization

`I18n` maintains the selected language and a compact catalog of UI keys. Elements with `data-i18n` receive translated text; elements with `data-i18n-title` receive translated tooltips. The language switcher updates the document root `lang`, visible strings, and dynamic status labels. Missing keys fall back to English to avoid blank controls.

## Security and privacy boundary

The server is static-only. It normalizes request paths, blocks traversal, returns a route manifest, and never parses or stores image content. Local plug-in modules are explicitly labeled as user-provided code and are loaded only after the user selects the file. There is no automatic remote module fetch.

## Extension path from the PhotoCraft reference

The complete PhotoCraft source snapshot is checked into `vendor/photocraft-source/` for traceable architecture and feature work. Its upstream notices and licenses remain in that directory. The root PhotoEarnAI app does not import the snapshot at runtime; this separation keeps the runnable browser build small and keeps the clean-room implementation boundary explicit.

The supplied PhotoCraft repository describes a deeper architecture with format codecs, tiled raster storage, a document model, a command registry, tools, text, vector, composition, and a WebAssembly frontend. PhotoEarnAI keeps the same conceptual seams in a browser-sized form:

- `CanvasEngine` and `Layer` correspond to the document/compositor seam.
- `ToolManager` corresponds to the tool state-machine seam.
- `FilterEngine` corresponds to algorithm operations.
- `ExtensionRegistry` corresponds to command/preset/plugin registries.
- `ProjectManager` is the browser persistence adapter.
- `I18n` is the presentation-layer localization adapter.

A future Rust/WASM migration can preserve these responsibilities without making the UI depend on proprietary Photopea implementation details.

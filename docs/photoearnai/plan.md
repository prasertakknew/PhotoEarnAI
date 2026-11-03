# PhotoEarnAI implementation plan

## Scope and boundary

PhotoEarnAI is a fork-level rebrand and extension of the supplied open-source clean-room browser prototype. Photopea is used only as a public product-behavior and layout reference. No Photopea proprietary source, bundles, shaders, fonts, logos, or assets are copied. The supplied PhotoCraft repository remains an architectural reference for layered documents, command-oriented tools, codecs, presets, fonts, and plug-ins; the runnable first slice uses the archived vanilla HTML5 Canvas prototype because the Sandbox does not include a Rust toolchain.

## Implementation approach

The browser app stays dependency-light and local-first: a Node static server serves an HTML shell, modular browser scripts hold the editor subsystems, and the canvas engine owns document/layer composition. The existing clean-room modules remain the rendering core. New application modules add a single extension registry and storage-backed managers for custom tools, presets, filters, plug-ins, fonts, and watermark/logo assets. Optional PSD and video adapters are lazy-loaded only when the user chooses those workflows, keeping first paint independent of large CDN/WASM downloads. The registry is deliberately capability-scoped: user extensions are metadata plus safe browser callbacks, and plug-ins are user-provided JavaScript modules imported with a clear local-only warning.

Thai and English are implemented as a live UI language toggle. Static UI strings use translation keys and the existing markup receives `data-i18n` attributes at startup. Dynamic labels are resolved through the same translator. User preferences and custom extension records are stored in localStorage so the editor remains usable without an account or backend.

Text editing is implemented as a first-class layer workflow: selected text layers carry editable metadata, double-clicking a text layer opens the text editor, and applying changes redraws the layer with the selected font, size, weight, alignment, color, and content. Font upload uses the browser FontFace API and stores font metadata; binary font bytes are kept only for the active session because localStorage is not a safe binary font store.

Watermarks/logos are implemented as a reusable overlay workflow. A user can import an image, configure opacity, scale, position, and tiled mode, then place the result into a named layer. The watermark configuration is also saved in project JSON when the user saves the project.

## Design direction

Three candidate directions were considered: **Neon instrument panel** (0.07), a high-contrast dark editor with cyan and violet control accents; **Paper studio** (0.06), a warm canvas with quiet neutral chrome; **Signal lab** (0.05), a technical dark workspace with amber status cues. The chosen direction is **Neon instrument panel**.

### Design Movement

A restrained cybernetic instrument panel: dense enough for professional editing, but with clear focus states and luminous accents that make the canvas feel active.

### Core Principles

- Make the document the visual focus; chrome should frame rather than compete with it.
- Make extension points visible and understandable instead of hiding them behind generic settings.
- Use bilingual labels without doubling the visual noise; Thai is shown first when selected and English remains available in the language switcher.
- Use motion only for state transitions: menus, modals, active tools, and confirmation toasts.

### Color Philosophy

The base is charcoal and graphite so bright artwork remains readable. Cyan marks active editing and data flow; violet marks extension and customization; amber marks local-only or experimental capabilities. The signature color is **Signal Cyan** `#28d7d1`, used for active borders, focus rings, and the PhotoEarnAI mark.

### Layout Paradigm

A professional editor frame: a compact top command rail, contextual options bar, vertical tool rail, large canvas stage, and a right dock for layers/history/color/info. Extension controls live in an expandable “Studio” panel rather than another permanent toolbar.

### Signature Elements

- A cyan “EA” aperture mark in the wordmark.
- Small capability chips for Local, Bilingual, and Extensions.
- A quiet scanline texture on the canvas viewport that disappears behind the actual document.

### Interaction Philosophy

Every meaningful edit gives feedback through history, toast copy, and the active layer state. Custom capabilities are registered through small forms and immediately appear in the relevant menu or extension panel.

### Animation

Use 120–180ms easing for menu and modal entry. Keep canvas transforms direct and unanimated. Use a subtle pulse only for the local-storage status dot and extension install success; never animate the artwork itself.

### Typography System

Use system UI sans-serif for chrome and `Noto Sans Thai`, `Tahoma`, and sans-serif fallbacks for bilingual UI. Use a compact 11–13px chrome scale, 15px panel headers, and 24px modal titles. User-selected document fonts are independent from the chrome font.

### Brand Essence

A local-first creative workspace for people who need Photoshop-like control without a heavy install, with extension points they can own. Personality: precise, open, inventive.

### Brand Voice

Headlines are direct and technical: “Make the layer yours.” CTAs are confident and specific: “Add a tool” and “Place watermark.” Helper copy explains local behavior plainly: “Saved in this browser; no upload required.”

### Wordmark & Logo

Use the “EA aperture” mark: two nested cyan brackets forming an open lens around a violet center dot, followed by the PhotoEarnAI wordmark. The mark is drawn in CSS/SVG rather than copied from any reference product.

## Project structure

- `index.html`: editor shell, menus, toolbar, panels, extension studio, dialogs, and bilingual data attributes.
- `css/style.css`: dark instrument-panel design tokens, layout, modal, extension cards, and responsive behavior.
- `js/app.js`: application composition, event wiring, document lifecycle, menu actions, and integration of managers.
- `js/engine/`: document canvas and layer model.
- `js/engine/brushEngine.js`: pressure-aware stamp engine with dynamics, spacing, scattering, and texture.
- `js/engine/smartObject.js`: source identity, lossless transform, and smart-filter metadata.
- `js/engine/adjustmentLayers.js`: Curves, Levels, and HSL non-destructive compositor operations.
- `js/engine/layerStyles.js`: Drop Shadow and Bevel composition-time effects.
- `js/tools/`: built-in pointer tools plus custom tool registration hooks.
- `js/tools/brushToolAdvanced.js` and `js/features/brushPanel.js`: advanced brush controls.
- `js/filters/`: built-in pixel filters plus user filter callback execution.
- `js/history/`: snapshots and undo/redo.
- `js/core/i18n.js`: translation catalog and live language switching.
- `js/core/extensionRegistry.js`: normalized records and local persistence for tools, presets, filters, plug-ins, fonts, and watermark configurations.
- `js/core/watermarkManager.js`: imported logo/watermark overlay creation.
- `js/core/psdWasm.js`: lazy ag-psd 25 PSD read/write adapter, layer/group mapping, and roundtrip counter. The name preserves the requested seam; ag-psd itself is JavaScript, not a native WASM binary.
- `js/core/ffmpegWasm.js`: lazy ffmpeg.wasm frame extraction and MP4/GIF export with HTML video fallback.
- `js/features/advancedFeatures.js`: PSD/video menus, drag-drop, feature tabs, and engine panel bindings.
- `js/core/projectManager.js`: project JSON export/import and extension metadata serialization.
- `public/manus-routes.json`: WebDev route manifest.
- `docs/architecture.md`: detailed subsystem and data-flow documentation.
- `plan.md` and `TODO.md`: implementation decisions and outcome-based acceptance clauses.

## Build and run workflow

1. Serve the project from the project root with `npm start`; the server honors `PORT` and listens on `0.0.0.0` for managed Preview.
2. Verify `/`, `/manus-routes.json`, the sample asset, and module scripts return HTTP 200.
3. Use the managed Preview for the initial visual check and a mobile-width screenshot for responsive regression.
4. Run `npm run check` for syntax/route checks and `npm run test:smoke` for the deterministic browser-independent registry checks.
5. Commit the project files to the managed Git remote so WebDev can record the checkpoint. Publication is not enabled automatically.

## Explicit limits

The advanced adapters are deliberately progressive: a normal browser editor remains usable when optional CDN modules are blocked, while selected PSD/video workflows report their actual backend. This implementation does not claim complete PSD 307/309 fixture parity, AI/Sketch interoperability, RAW codecs, vector path parity, all 27 Photoshop blend modes, all 67 PhotoCraft brush concepts, or PhotoCraft Rust feature parity. Those are documented extension points and future milestones.

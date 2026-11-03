# Integration sources

- ag-psd README: https://github.com/Agamnentzar/ag-psd/blob/master/README.md — documents browser `readPsd`/`writePsd`, canvas/imageData layers, masks, smart-linked data options, and limitations. ag-psd is a JavaScript library; it does not ship as a WASM codec. PhotoEarnAI therefore names its adapter `psdWasm.js` for the requested integration surface but reports the actual ag-psd runtime honestly in the UI.
- ffmpeg.wasm usage: https://ffmpegwasm.netlify.app/docs/getting-started/usage/ — documents `FFmpeg`, `toBlobURL`, `writeFile`, `exec`, `readFile`, and progress events for `@ffmpeg/core@0.12.10`.

The browser loads these optional integrations lazily from pinned public CDNs. If a CDN, cross-origin isolation policy, or browser capability prevents loading, PhotoEarnAI keeps the local editor usable and exposes a native HTMLVideoElement frame fallback for video import.

class FfmpegWasmAdapter {
  constructor(engine) { this.engine = engine; this.ffmpeg = null; this.util = null; this.loading = null; }
  progress(value, label) { const bar = document.getElementById('ffmpeg-progress'); if (bar) bar.value = Math.round(value * 100); const text = document.getElementById('ffmpeg-progress-label'); if (text) text.textContent = `${label || 'FFmpeg'} ${Math.round(value * 100)}%`; }
  // Same-origin asset URL helper. Browsers refuse to start a Worker from a
  // different origin (the cause of the old "Failed to construct 'Worker'" GIF
  // error), so the @ffmpeg/ffmpeg class + worker files are vendored under
  // /editor/vendor and loaded from this site. Only the large core/wasm files
  // come from the CDN, converted to Blob URLs which Workers accept.
  asset(path) { return new URL(path, document.baseURI).href; }
  async load() {
    if (this.ffmpeg) return this.ffmpeg;
    if (!this.loading) this.loading = Promise.all([import(this.asset('vendor/ffmpeg/index.js')), import(this.asset('vendor/ffmpeg-util/index.js'))]).then(async ([core, util]) => {
      this.ffmpeg = new core.FFmpeg(); this.util = util;
      this.ffmpeg.on('progress', ({ progress }) => this.progress(progress, 'FFmpeg'));
      const base = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm';
      await this.ffmpeg.load({
        classWorkerURL: this.asset('vendor/ffmpeg/worker.js'),
        coreURL: await util.toBlobURL(`${base}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await util.toBlobURL(`${base}/ffmpeg-core.wasm`, 'application/wasm')
      });
      return this.ffmpeg;
    });
    try { return await this.loading; } catch (error) { this.loading = null; this.ffmpeg = null; throw error; }
  }
  async importVideo(file, fps = 2) {
    this.progress(0, 'Video');
    try {
      await this.load(); const { fetchFile } = this.util;
      await this.ffmpeg.writeFile('input.video', await fetchFile(file));
      await this.ffmpeg.exec(['-i', 'input.video', '-vf', `fps=${fps}`, '-f', 'image2', 'frame-%03d.png']);
      const frames = [];
      for (let i = 1; i < 1000; i++) { try { const data = await this.ffmpeg.readFile(`frame-${String(i).padStart(3, '0')}.png`); frames.push(new Blob([data], { type: 'image/png' })); } catch { break; } }
      await this.addFrames(frames); this.progress(1, 'Video'); return { frames: frames.length, backend: 'ffmpeg.wasm' };
    } catch (error) { console.warn('ffmpeg.wasm unavailable; using HTMLVideoElement fallback', error); return this.importWithVideoElement(file, fps); }
  }
  async importWithVideoElement(file, fps = 2) {
    const url = URL.createObjectURL(file); const video = document.createElement('video'); video.preload = 'auto'; video.muted = true; video.playsInline = true;
    const waitFor = (event, timeout = 15000) => new Promise((resolve, reject) => { const timer = setTimeout(() => { cleanup(); reject(new Error(`Video ${event} timeout`)); }, timeout); const cleanup = () => { clearTimeout(timer); video.removeEventListener(event, onEvent); video.removeEventListener('error', onError); }; const onEvent = () => { cleanup(); resolve(); }; const onError = () => { cleanup(); reject(new Error('Browser could not decode this video format')); }; video.addEventListener(event, onEvent, { once: true }); video.addEventListener('error', onError, { once: true }); });
    try {
      const metadata = waitFor('loadedmetadata'); video.src = url; video.load(); await metadata;
      const canvas = document.createElement('canvas'); canvas.width = video.videoWidth || 640; canvas.height = video.videoHeight || 360; const ctx = canvas.getContext('2d'); const frames = [];
      const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0; if (!duration) throw new Error('Video has no readable duration');
      for (let t = 0; t < duration; t += 1 / fps) { video.currentTime = Math.min(t, Math.max(0, duration - 0.001)); await waitFor('seeked'); ctx.drawImage(video, 0, 0, canvas.width, canvas.height); const blob = await new Promise(r => canvas.toBlob(r, 'image/png')); if (blob) frames.push(blob); this.progress(Math.min(0.99, t / duration), 'Video'); }
      await this.addFrames(frames); this.progress(1, 'Video'); return { frames: frames.length, backend: 'HTMLVideoElement fallback' };
    } finally { URL.revokeObjectURL(url); }
  }
  async addFrames(frames) { for (let i = frames.length - 1; i >= 0; i--) { const img = await createImageBitmap(frames[i]); const layer = this.engine.addLayer(`Frame ${String(frames.length - i).padStart(3, '0')}`, { animationFrame: i, frameDelay: 500 }); layer.ctx.drawImage(img, 0, 0, layer.width, layer.height); img.close?.(); } this.engine.render(); }
  getVideoFrames() { return this.engine.layers.filter(l => l.animationFrame !== undefined).sort((a, b) => a.animationFrame - b.animationFrame); }
  download(data, mime, filename) { const url = URL.createObjectURL(data instanceof Blob ? data : new Blob([data], { type: mime })); const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
  async export(format = 'mp4') {
    // GIF is encoded directly in the browser with gifenc: no 30 MB FFmpeg
    // download, no Worker, works on every origin.
    if (format === 'gif') return this.exportGif();
    const frames = this.getVideoFrames(); if (!frames.length) throw new Error('No video frame layers. Open a video first.');
    try { return await this.exportWithFfmpeg(format, frames); }
    catch (error) { console.warn('FFmpeg export failed; using browser recorder fallback', error); return this.exportWithRecorder(frames); }
  }
  composeFrame(layer, ctx) {
    // Frame layer composited over the non-animation layers (background etc.).
    const w = this.engine.width, h = this.engine.height;
    ctx.clearRect(0, 0, w, h); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h);
    for (const l of this.engine.layers) { if (l.animationFrame !== undefined && l !== layer) continue; if (l.visible === false && l !== layer) continue; if (l === layer) { ctx.save(); ctx.globalAlpha = 1; ctx.drawImage(l.canvas, l.x || 0, l.y || 0); ctx.restore(); } else l.renderTo(ctx); }
  }
  async exportGif() {
    const { GIFEncoder, quantize, applyPalette } = await import(this.asset('vendor/gifenc/gifenc.esm.js'));
    const frames = this.getVideoFrames();
    const maxSide = 800; const scale = Math.min(1, maxSide / Math.max(this.engine.width, this.engine.height));
    const w = Math.max(1, Math.round(this.engine.width * scale)), h = Math.max(1, Math.round(this.engine.height * scale));
    const full = document.createElement('canvas'); full.width = this.engine.width; full.height = this.engine.height; const fctx = full.getContext('2d', { willReadFrequently: true });
    const out = document.createElement('canvas'); out.width = w; out.height = h; const octx = out.getContext('2d', { willReadFrequently: true });
    const gif = GIFEncoder();
    const list = frames.length ? frames : [null];
    for (let i = 0; i < list.length; i++) {
      if (list[i]) this.composeFrame(list[i], fctx); else { this.engine.render(); fctx.fillStyle = '#ffffff'; fctx.fillRect(0, 0, full.width, full.height); fctx.drawImage(this.engine.displayCanvas, 0, 0); }
      octx.clearRect(0, 0, w, h); octx.drawImage(full, 0, 0, w, h);
      const { data } = octx.getImageData(0, 0, w, h);
      const palette = quantize(data, 256); const index = applyPalette(data, palette);
      gif.writeFrame(index, w, h, { palette, delay: list[i]?.frameDelay || 500 });
      this.progress((i + 1) / list.length, 'GIF');
      await new Promise(r => setTimeout(r, 0));
    }
    gif.finish();
    this.download(new Blob([gif.bytes()], { type: 'image/gif' }), 'image/gif', 'PhotoEarnAI.gif');
    return { format: 'gif', filename: 'PhotoEarnAI.gif', backend: `gifenc · ${list.length} frame${list.length > 1 ? 's' : ''}` };
  }
  async exportWithFfmpeg(format, frames) {
    await this.load();
    for (let i = 0; i < frames.length; i++) { const blob = await new Promise(r => frames[i].canvas.toBlob(r, 'image/png')); if (!blob) throw new Error('Could not encode a video frame'); await this.ffmpeg.writeFile(`frame-${String(i + 1).padStart(3, '0')}.png`, await this.util.fetchFile(blob)); this.progress(i / frames.length, 'Export'); }
    const out = format === 'gif' ? 'output.gif' : 'output.mp4'; const args = format === 'gif' ? ['-framerate', '2', '-i', 'frame-%03d.png', '-vf', 'palettegen=stats_mode=diff[pal],[0:v][pal]paletteuse=dither=sierra2_4a', out] : ['-framerate', '2', '-i', 'frame-%03d.png', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out];
    await this.ffmpeg.exec(args); const data = await this.ffmpeg.readFile(out); this.download(data, format === 'gif' ? 'image/gif' : 'video/mp4', `PhotoEarnAI.${format}`); this.progress(1, 'Export'); return { format, filename: `PhotoEarnAI.${format}`, backend: 'ffmpeg.wasm' };
  }
  async exportWithRecorder(frames) {
    if (!HTMLCanvasElement.prototype.captureStream || typeof MediaRecorder === 'undefined') throw new Error('This browser cannot encode MP4. Try Export GIF or use a Chromium-based browser.');
    const canvas = document.createElement('canvas'); canvas.width = this.engine.width; canvas.height = this.engine.height; const ctx = canvas.getContext('2d');
    const mime = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'].find(type => MediaRecorder.isTypeSupported(type)); if (!mime) throw new Error('No supported video encoder found');
    const recorder = new MediaRecorder(canvas.captureStream(2), { mimeType: mime, videoBitsPerSecond: 4_000_000 }); const chunks = [];
    recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); }; const stopped = new Promise((resolve, reject) => { recorder.onstop = resolve; recorder.onerror = () => reject(new Error('Browser video encoder failed')); });
    recorder.start(); for (let i = 0; i < frames.length; i++) { ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(frames[i].canvas, 0, 0, canvas.width, canvas.height); this.progress((i + 1) / frames.length, 'Export'); await new Promise(resolve => setTimeout(resolve, 500)); } recorder.stop(); await stopped;
    const isMp4 = mime.startsWith('video/mp4'); const extension = isMp4 ? 'mp4' : 'webm'; this.download(new Blob(chunks, { type: mime }), mime, `PhotoEarnAI.${extension}`); return { format: extension, filename: `PhotoEarnAI.${extension}`, backend: 'MediaRecorder fallback' };
  }
}
window.FfmpegWasmAdapter = FfmpegWasmAdapter;

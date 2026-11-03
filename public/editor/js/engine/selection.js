/**
 * SelectionManager - one pixel mask (document-sized canvas, alpha = selected)
 * shared by Marquee, Lasso and Magic Wand. Draws "marching ants" on an overlay
 * canvas inside the stage so it pans/zooms with the document.
 */
class SelectionManager {
  constructor(engine) {
    this.engine = engine;
    this.mask = null; // canvas, doc size
    this.overlay = document.createElement('canvas');
    this.overlay.className = 'selection-overlay';
    this.overlay.setAttribute('aria-hidden', 'true');
    engine.stage.appendChild(this.overlay);
    this.edges = null;
    this.phase = 0;
    this.preview = null; // lasso polyline preview
    setInterval(() => { if (this.edges) { this.phase = (this.phase + 1) % 8; this.draw(); } }, 160);
    engine.on('viewportChange', () => this.draw());
  }

  get has() { return !!this.mask; }

  newMask() {
    const c = document.createElement('canvas');
    c.width = this.engine.width; c.height = this.engine.height;
    return c;
  }

  /** mode: 'replace' | 'add' | 'subtract' */
  combine(next, mode = 'replace') {
    if (mode === 'replace' || !this.mask || this.mask.width !== next.width || this.mask.height !== next.height) {
      this.mask = next;
    } else {
      const ctx = this.mask.getContext('2d', { willReadFrequently: true });
      ctx.save();
      ctx.globalCompositeOperation = mode === 'subtract' ? 'destination-out' : 'source-over';
      ctx.drawImage(next, 0, 0);
      ctx.restore();
    }
    this.refresh();
  }

  setRect(x, y, w, h, mode) {
    const x0 = Math.round(Math.min(x, x + w)); const y0 = Math.round(Math.min(y, y + h));
    const rw = Math.round(Math.abs(w)); const rh = Math.round(Math.abs(h));
    if (rw < 2 || rh < 2) { if (mode === 'replace' || !mode) this.clear(); return; }
    const c = this.newMask(); const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(x0, y0, rw, rh);
    this.combine(c, mode);
  }

  setPolygon(points, mode) {
    if (!points || points.length < 3) { if (mode === 'replace' || !mode) this.clear(); return; }
    const c = this.newMask(); const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(points[0].x, points[0].y);
    for (const p of points.slice(1)) ctx.lineTo(p.x, p.y);
    ctx.closePath(); ctx.fill();
    this.combine(c, mode);
  }

  setMask(canvas, mode) { this.combine(canvas, mode); }

  selectAll() { const c = this.newMask(); const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); this.combine(c, 'replace'); }

  invert() {
    const c = this.newMask(); const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    if (this.mask) { ctx.globalCompositeOperation = 'destination-out'; ctx.drawImage(this.mask, 0, 0); }
    this.mask = c; this.refresh();
  }

  clear() { this.mask = null; this.edges = null; this.preview = null; this.draw(); this.engine.emit('selectionChange'); }

  /** Selection mask in a layer's own coordinates. */
  maskForLayer(layer) {
    if (!this.mask) return null;
    const c = document.createElement('canvas'); c.width = layer.width; c.height = layer.height;
    c.getContext('2d').drawImage(this.mask, -layer.x, -layer.y);
    return c;
  }

  /** Bounding box of the selection (doc coords), or null. */
  bounds() {
    if (!this.mask) return null;
    const { width: w, height: h } = this.mask;
    const d = this.mask.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
    let minX = w, minY = h, maxX = -1, maxY = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 127) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
    return maxX < 0 ? null : { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
  }

  refresh() {
    if (!this.mask) { this.clear(); return; }
    const { width: w, height: h } = this.mask;
    const d = this.mask.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
    const inside = (x, y) => x >= 0 && y >= 0 && x < w && y < h && d[(y * w + x) * 4 + 3] > 127;
    const edges = [];
    let any = false;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (!inside(x, y)) continue;
        any = true;
        if (!inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1)) edges.push(x, y);
      }
    }
    if (!any) { this.clear(); return; }
    this.edges = edges;
    this.draw();
    this.engine.emit('selectionChange');
  }

  draw() {
    const o = this.overlay; const e = this.engine;
    if (o.width !== e.width || o.height !== e.height) { o.width = e.width; o.height = e.height; }
    const ctx = o.getContext('2d');
    ctx.clearRect(0, 0, o.width, o.height);
    const dot = Math.max(1, Math.ceil(1.25 / (e.zoom || 1)));
    if (this.edges) {
      const ed = this.edges;
      for (let i = 0; i < ed.length; i += 2) {
        const x = ed[i]; const y = ed[i + 1];
        ctx.fillStyle = (((x + y) >> 2) + this.phase) % 2 ? '#000' : '#fff';
        ctx.fillRect(x - (dot >> 1), y - (dot >> 1), dot, dot);
      }
    }
    if (this.preview && this.preview.length > 1) {
      ctx.save(); ctx.lineWidth = dot; ctx.strokeStyle = '#fff'; ctx.setLineDash([4 * dot, 4 * dot]);
      ctx.beginPath(); ctx.moveTo(this.preview[0].x, this.preview[0].y);
      for (const p of this.preview.slice(1)) ctx.lineTo(p.x, p.y);
      ctx.stroke(); ctx.strokeStyle = '#000'; ctx.lineDashOffset = 4 * dot; ctx.stroke(); ctx.restore();
    }
  }

  /**
   * Magic wand: select pixels similar to the clicked one.
   * source: canvas in doc coords (or a layer with offset), tolerance 0-255.
   */
  static wandMask(layer, docX, docY, tolerance = 32, contiguous = true, docW, docH) {
    const w = layer.width; const h = layer.height;
    const lx = Math.round(docX - layer.x); const ly = Math.round(docY - layer.y);
    const out = document.createElement('canvas'); out.width = docW; out.height = docH;
    if (lx < 0 || ly < 0 || lx >= w || ly >= h) return out;
    const src = layer.ctx.getImageData(0, 0, w, h).data;
    const i0 = (ly * w + lx) * 4;
    const r0 = src[i0], g0 = src[i0 + 1], b0 = src[i0 + 2], a0 = src[i0 + 3];
    const tol = Math.max(0, Math.min(255, tolerance));
    const match = (i) => Math.abs(src[i] - r0) <= tol && Math.abs(src[i + 1] - g0) <= tol && Math.abs(src[i + 2] - b0) <= tol && Math.abs(src[i + 3] - a0) <= tol;
    const sel = new Uint8Array(w * h);
    if (contiguous) {
      const stack = [ly * w + lx]; sel[ly * w + lx] = 1;
      while (stack.length) {
        const p = stack.pop(); const x = p % w; const y = (p - x) / w;
        if (x > 0 && !sel[p - 1] && match((p - 1) * 4)) { sel[p - 1] = 1; stack.push(p - 1); }
        if (x < w - 1 && !sel[p + 1] && match((p + 1) * 4)) { sel[p + 1] = 1; stack.push(p + 1); }
        if (y > 0 && !sel[p - w] && match((p - w) * 4)) { sel[p - w] = 1; stack.push(p - w); }
        if (y < h - 1 && !sel[p + w] && match((p + w) * 4)) { sel[p + w] = 1; stack.push(p + w); }
      }
    } else {
      for (let p = 0; p < w * h; p++) if (match(p * 4)) sel[p] = 1;
    }
    const tmp = document.createElement('canvas'); tmp.width = w; tmp.height = h;
    const tctx = tmp.getContext('2d'); const img = tctx.createImageData(w, h);
    for (let p = 0; p < w * h; p++) if (sel[p]) { const i = p * 4; img.data[i] = img.data[i + 1] = img.data[i + 2] = img.data[i + 3] = 255; }
    tctx.putImageData(img, 0, 0);
    out.getContext('2d').drawImage(tmp, layer.x, layer.y);
    return out;
  }
}

window.SelectionManager = SelectionManager;

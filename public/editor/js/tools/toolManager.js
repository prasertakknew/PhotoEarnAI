/**
 * ToolManager - Orchestrates user interaction, pointer event dispatching, and tool logic.
 * Brush strokes, eraser, clone/heal, bucket fill, shapes, text, selections (marquee,
 * lasso, magic wand), layer-mask painting and pan/zoom.
 */
const PAINT_TOOLS = ['brush', 'brushAdvanced', 'eraser', 'clone', 'healing', 'blur', 'pen'];
const SIZED_TOOLS = ['brush', 'brushAdvanced', 'eraser', 'clone', 'healing', 'blur'];

class ToolManager {
  constructor(engine, historyManager) {
    this.engine = engine;
    this.history = historyManager;
    this.activeTool = 'brush';

    // Tool specific configurations
    this.shapeType = 'rect';
    this.shapeStrokeWidth = 3;
    this.shapeFill = true;

    this.textFont = 'Arial, sans-serif';
    this.textSize = 48;

    this.wandTolerance = 32;
    this.wandContiguous = true;

    // Crop: 'layer' = copy the area into a new layer (original kept), 'canvas' = crop the document
    this.cropMode = 'layer';
    this.cropSource = 'layer'; // 'layer' (active layer) | 'visible' (all visible layers)

    // Interaction tracking
    this.isDrawing = false;
    this.isPanning = false;
    this.lastDocX = 0;
    this.lastDocY = 0;
    this.startDocX = 0;
    this.startDocY = 0;
    this.startPanX = 0;
    this.startPanY = 0;
    this.startScreenX = 0;
    this.startScreenY = 0;
    this.strokeCaptured = false;

    // Clone / Healing source
    this.cloneSource = null;      // point source {x, y}
    this.cloneArea = null;        // area source {x, y, w, h}
    this.cloneMode = 'brush';     // 'brush' (paint with a round brush) | 'area' (stamp the whole picked area)
    this.cloneBuffer = null;
    this.cloneOffset = null;
    this.pickingSource = false;   // Alt+drag in progress
    this.lassoPoints = [];

    // Selection clipping during a stroke
    this.preStroke = null;
    this.strokeSelMask = null;

    // Marquee overlay
    this.marqueeEl = document.getElementById('marquee-selection');

    this.bindEvents();
    this.engine.on('viewportChange', () => this.refreshSourceMarker());
  }

  get selection() { return this.engine.selectionMgr; }

  modifiers(e) {
    const m = window.photoearnai?.virtualModifiers || {};
    return { alt: !!(e.altKey || m.alt), shift: !!(e.shiftKey || m.shift), ctrl: !!(e.ctrlKey || e.metaKey || m.ctrl) };
  }

  hint(text) { const el = document.getElementById('status-engine'); if (el) el.textContent = text; }

  setTool(toolName) {
    this.activeTool = toolName;
    document.querySelectorAll('.tool-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tool === toolName);
    });

    // Update viewport cursor
    const vp = this.engine.viewport;
    vp.classList.toggle('panning', toolName === 'hand');
    vp.classList.toggle('sized-cursor', SIZED_TOOLS.includes(toolName));

    // Update options bar visibility
    const optLabel = document.getElementById('opt-tool-name');
    if (optLabel) {
      const names = {
        move: 'Move Tool',
        marquee: 'Rectangular Marquee',
        brush: 'Brush Tool',
        brushAdvanced: 'Advanced Brush · 67 Dynamics',
        lasso: 'Lasso Tool',
        wand: 'Magic Wand Tool',
        crop: 'Crop Tool',
        clone: 'Clone Stamp Tool',
        healing: 'Healing Brush Tool',
        gradient: 'Gradient Tool',
        blur: 'Blur Tool',
        pen: 'Pen Tool',
        eraser: 'Eraser Tool',
        bucket: 'Paint Bucket Tool',
        shape: 'Shape Tool',
        text: 'Text Tool',
        eyedropper: 'Eyedropper Tool',
        hand: 'Hand Tool',
        zoom: 'Zoom Tool'
      };
      const label = names[toolName] || toolName;
      optLabel.textContent = window.PhotoEarnI18n ? PhotoEarnI18n.translate(label) : label;
    }

    const toggle = (id, show) => document.getElementById(id)?.classList.toggle('hidden', !show);
    toggle('opt-brush-group', SIZED_TOOLS.includes(toolName));
    toggle('opt-clone-group', ['clone', 'healing'].includes(toolName));
    toggle('opt-wand-group', toolName === 'wand');
    toggle('opt-select-group', ['wand', 'marquee', 'lasso'].includes(toolName));
    toggle('opt-shape-group', toolName === 'shape');
    toggle('opt-text-group', toolName === 'text');
    toggle('opt-crop-group', toolName === 'crop');
    const brushPanel = document.getElementById('brush-panel');
    if (brushPanel) brushPanel.style.display = toolName === 'brushAdvanced' ? 'grid' : 'none';
    if (toolName === 'clone' || toolName === 'healing') this.hint(this.cloneHelp());
    if (toolName === 'crop') this.hint(window.PhotoEarnI18n?.language === 'th' ? 'ครอบตัด: ลากกรอบบนภาพ ส่วนที่ครอบจะเป็นเลเยอร์ใหม่ รูปเดิมไม่หาย' : 'Crop: drag a box · the cropped part becomes a new layer, the original stays');
    if (toolName === 'blur') this.hint(window.PhotoEarnI18n?.language === 'th' ? 'เบลอ: ลากบนภาพ · ปรับความแรงที่ Opacity และขนาดที่ Size' : 'Blur: drag over the picture · Opacity = strength, Size = brush size');
    if (toolName === 'wand') this.hint('Magic Wand: click a colour to select it · Shift+click adds · Alt+click removes');
    this.refreshSourceMarker();
    this.updateCloneModeUI();
  }

  cloneHelp() {
    const th = window.PhotoEarnI18n?.language === 'th';
    return th
      ? 'โคลน: Alt+คลิก = เลือกจุดต้นทาง (ใช้ขนาดแปรง) · Alt+ลาก = เลือกพื้นที่ที่จะโคลน · ปุ่ม [ ] = ปรับขนาด'
      : 'Clone: Alt+click = pick a source point (uses brush size) · Alt+drag = pick an area to clone · [ ] = change size';
  }

  bindEvents() {
    const vp = this.engine.viewport;

    vp.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    window.addEventListener('pointermove', (e) => this.onPointerMove(e));
    window.addEventListener('pointerup', (e) => this.onPointerUp(e));
    window.addEventListener('pointercancel', () => this.cancelStroke());

    // Mouse wheel zoom
    vp.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.15 : 0.87;
      const vpRect = vp.getBoundingClientRect();
      const mouseX = e.clientX - vpRect.left;
      const mouseY = e.clientY - vpRect.top;
      this.engine.setZoom(this.engine.zoom * zoomFactor, mouseX, mouseY);
    }, { passive: false });

    // Track cursor coordinates for status bar + brush size circle
    vp.addEventListener('pointermove', (e) => {
      const coords = this.engine.screenToDoc(e.clientX, e.clientY);
      const statusCursor = document.getElementById('status-cursor');
      const infoX = document.getElementById('info-cursor-x');
      const infoY = document.getElementById('info-cursor-y');

      if (statusCursor) statusCursor.textContent = `X: ${coords.x} Y: ${coords.y}`;
      if (infoX) infoX.textContent = coords.x;
      if (infoY) infoY.textContent = coords.y;
      this.updateBrushCursor(e);
    });
    vp.addEventListener('pointerleave', () => { const c = document.getElementById('brush-cursor'); if (c) c.style.display = 'none'; });
  }

  updateBrushCursor(e) {
    let cursor = document.getElementById('brush-cursor');
    if (!cursor) { cursor = document.createElement('div'); cursor.id = 'brush-cursor'; cursor.className = 'brush-cursor'; this.engine.viewport.appendChild(cursor); }
    const showArea = this.activeTool === 'clone' && this.cloneMode === 'area';
    if (!SIZED_TOOLS.includes(this.activeTool) || showArea || e.pointerType === 'touch') { cursor.style.display = 'none'; return; }
    const rect = this.engine.viewport.getBoundingClientRect();
    const d = Math.max(4, this.engine.brushSize * this.engine.zoom);
    cursor.style.display = 'block';
    cursor.style.width = `${d}px`; cursor.style.height = `${d}px`;
    cursor.style.transform = `translate(${e.clientX - rect.left - d / 2}px, ${e.clientY - rect.top - d / 2}px)`;
  }

  setBrushSize(size) {
    const s = Math.max(1, Math.min(500, Math.round(size)));
    this.engine.brushSize = s;
    const input = document.getElementById('opt-brush-size'); if (input) input.value = s;
    const val = document.getElementById('opt-brush-size-val'); if (val) val.textContent = `${s}px`;
    this.refreshSourceMarker();
  }

  /** Where brush-like tools paint: the layer pixels or its mask. */
  paintTarget(layer) {
    // Clone, Healing and Blur always work on the picture itself.
    const pixelOnly = ['clone', 'healing', 'blur', 'bucket'].includes(this.activeTool);
    if (layer.mask && layer.editingMask && !pixelOnly) return { canvas: layer.mask, ctx: layer.maskCtx, isMask: true };
    return { canvas: layer.canvas, ctx: layer.ctx, isMask: false };
  }

  colorIsLight(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return true;
    const n = parseInt(m[1], 16); const r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    return (0.299 * r + 0.587 * g + 0.114 * b) >= 128;
  }

  // ---------------------------------------------------------------- selection clip
  beginSelectionClip(layer) {
    this.preStroke = null; this.strokeSelMask = null;
    if (!this.selection?.has) return;
    const t = this.paintTarget(layer);
    const pre = document.createElement('canvas'); pre.width = t.canvas.width; pre.height = t.canvas.height;
    pre.getContext('2d').drawImage(t.canvas, 0, 0);
    this.preStroke = pre;
    this.strokeSelMask = this.selection.maskForLayer(layer);
  }

  applySelectionClip(layer) {
    if (!this.preStroke || !this.strokeSelMask) return;
    const t = this.paintTarget(layer);
    const w = t.canvas.width, h = t.canvas.height;
    if (!this._clipTmp || this._clipTmp.width !== w || this._clipTmp.height !== h) { this._clipTmp = document.createElement('canvas'); this._clipTmp.width = w; this._clipTmp.height = h; }
    const tmp = this._clipTmp.getContext('2d');
    tmp.globalCompositeOperation = 'source-over'; tmp.clearRect(0, 0, w, h);
    tmp.drawImage(t.canvas, 0, 0);
    tmp.globalCompositeOperation = 'destination-in'; tmp.drawImage(this.strokeSelMask, 0, 0);
    tmp.globalCompositeOperation = 'source-over';
    const ctx = t.ctx; ctx.save();
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(this.preStroke, 0, 0);
    ctx.globalCompositeOperation = 'destination-out'; ctx.drawImage(this.strokeSelMask, 0, 0);
    ctx.globalCompositeOperation = 'source-over'; ctx.drawImage(this._clipTmp, 0, 0);
    ctx.restore();
  }

  endSelectionClip(layer) { this.applySelectionClip(layer); this.preStroke = null; this.strokeSelMask = null; }

  /** Cancel a stroke in progress (e.g. a second finger started a pinch). */
  cancelStroke() {
    if (!this.isDrawing) return;
    this.isDrawing = false;
    this.preStroke = null; this.strokeSelMask = null;
    this.hideGhost();
    if (this.strokeCaptured) this.history.discardLast();
    this.strokeCaptured = false;
    if (this.marqueeEl) this.marqueeEl.style.display = 'none';
    if (this.selection) { this.selection.preview = null; this.selection.draw(); }
  }

  capture(name) { this.history.captureSnapshot(name); this.strokeCaptured = true; }

  // ---------------------------------------------------------------- pointer events
  onPointerDown(e) {
    if (e.button === 1 || e.spaceKey || this.activeTool === 'hand') {
      // Middle click or spacebar or Hand tool -> Pan
      this.isPanning = true;
      this.startScreenX = e.clientX;
      this.startScreenY = e.clientY;
      this.startPanX = this.engine.panX;
      this.startPanY = this.engine.panY;
      this.engine.viewport.classList.add('panning');
      return;
    }

    if (e.button !== 0) return; // Only primary button for drawing

    const coords = this.engine.screenToDoc(e.clientX, e.clientY);
    const mods = this.modifiers(e);
    this.isDrawing = true;
    this.strokeCaptured = false;
    this.lastDocX = coords.x;
    this.lastDocY = coords.y;
    this.startDocX = coords.x;
    this.startDocY = coords.y;
    this.startScreenX = e.clientX;
    this.startScreenY = e.clientY;
    let layer = this.engine.getActiveLayer();
    if (!layer) { this.isDrawing = false; return; }

    if (this.activeTool === 'lasso') { this.lassoPoints = [{ x: coords.x, y: coords.y }]; return; }
    if (this.activeTool === 'marquee') return;

    if (this.activeTool === 'wand') {
      const mask = SelectionManager.wandMask(layer, coords.x, coords.y, this.wandTolerance, this.wandContiguous, this.engine.width, this.engine.height);
      this.selection?.setMask(mask, mods.shift ? 'add' : mods.alt ? 'subtract' : 'replace');
      this.releaseLatchedModifiers(e);
      this.isDrawing = false;
      return;
    }

    if (this.activeTool === 'clone' || this.activeTool === 'healing') {
      if (mods.alt) {
        // Alt+click = point source, Alt+drag = area source (decided on pointer up).
        this.pickingSource = true;
        return;
      }
      if (this.cloneMode === 'area' && this.cloneArea && this.activeTool === 'clone') {
        this.cloneBuffer = this.snapshotComposite();
        this.showGhost(coords.x, coords.y);
        return;
      }
      if (!this.cloneSource) {
        this.hint(window.PhotoEarnI18n?.language === 'th' ? 'กด Alt ค้าง (หรือปุ่ม Alt เสมือน) แล้วคลิกหรือลากเพื่อเลือกต้นทางก่อน' : 'Alt+click or Alt+drag (or Virtual Alt) to pick the source first');
        this.isDrawing = false;
        return;
      }
      // Aligned mode: the offset between source and first stamp is kept for every stroke.
      if (!this.cloneOffset) this.cloneOffset = { x: this.cloneSource.x - coords.x, y: this.cloneSource.y - coords.y };
      this.cloneBuffer = this.snapshotComposite();
    }

    if (this.activeTool === 'blur') {
      const picked = this.pickBlurLayer(coords.x, coords.y);
      if (!picked) { this.isDrawing = false; return; }
      layer = picked;
    }

    if (PAINT_TOOLS.includes(this.activeTool)) {
      const target = this.paintTarget(layer);
      const names = { pen: 'Pen Signature', brush: 'Brush Stroke', brushAdvanced: 'Brush Stroke', clone: 'Clone Stamp', healing: 'Healing Brush', blur: 'Blur', eraser: 'Eraser' };
      this.capture((names[this.activeTool] || 'Paint') + (target.isMask ? ' (mask)' : ''));
      this.beginSelectionClip(layer);
      this.drawBrushPoint(coords.x, coords.y, layer);
      this.applySelectionClip(layer);
      this.engine.render();
    } else if (this.activeTool === 'bucket') {
      this.capture('Paint Bucket');
      this.beginSelectionClip(layer);
      this.floodFill(coords.x, coords.y, layer, this.engine.foregroundColor);
      this.endSelectionClip(layer);
      this.engine.render();
      this.isDrawing = false;
      this.engine.emit('layerChange');
    } else if (this.activeTool === 'eyedropper') {
      this.pickColor(coords.x, coords.y);
      this.isDrawing = false;
    } else if (this.activeTool === 'zoom') {
      const vpRect = this.engine.viewport.getBoundingClientRect();
      const factor = mods.alt ? 0.75 : 1.33;
      this.engine.setZoom(this.engine.zoom * factor, e.clientX - vpRect.left, e.clientY - vpRect.top);
      this.isDrawing = false;
    } else if (this.activeTool === 'text') {
      this.addTextAt(coords.x, coords.y, layer);
      this.isDrawing = false;
    } else if (['shape', 'move', 'gradient'].includes(this.activeTool)) {
      this.capture({ shape: 'Draw Shape', move: 'Move Layer', gradient: 'Gradient' }[this.activeTool]);
      if (this.activeTool === 'gradient') this.beginSelectionClip(layer);
    }
  }

  releaseLatchedModifiers(e) {
    const mods = window.photoearnai?.virtualModifiers;
    if (!mods) return;
    let changed = false;
    if (mods.alt && !e.altKey) { mods.alt = false; changed = true; }
    if (mods.shift && !e.shiftKey) { mods.shift = false; changed = true; }
    if (changed) window.photoearnai?.syncVirtualKeys?.();
  }

  onPointerMove(e) {
    if (this.isPanning) {
      const dx = e.clientX - this.startScreenX;
      const dy = e.clientY - this.startScreenY;
      this.engine.panX = this.startPanX + dx;
      this.engine.panY = this.startPanY + dy;
      this.engine.updateStageTransform();
      return;
    }

    if (!this.isDrawing) return;

    const coords = this.engine.screenToDoc(e.clientX, e.clientY);
    const layer = this.engine.getActiveLayer();
    if (!layer) return;

    if (this.pickingSource) {
      this.updateMarqueeVisual(this.startDocX, this.startDocY, coords.x, coords.y);
      return;
    }

    if (this.ghost && this.activeTool === 'clone') { this.moveGhost(coords.x, coords.y); return; }

    if (SIZED_TOOLS.includes(this.activeTool)) {
      this.drawBrushLine(this.lastDocX, this.lastDocY, coords.x, coords.y, layer);
      this.lastDocX = coords.x;
      this.lastDocY = coords.y;
      this.applySelectionClip(layer);
      this.engine.render();
    } else if (this.activeTool === 'pen') {
      this.drawPenLine(this.lastDocX, this.lastDocY, coords.x, coords.y, layer);
      this.lastDocX = coords.x;
      this.lastDocY = coords.y;
      this.applySelectionClip(layer);
      this.engine.render();
    } else if (this.activeTool === 'move') {
      const dx = coords.x - this.lastDocX;
      const dy = coords.y - this.lastDocY;
      layer.x += dx;
      layer.y += dy;
      this.lastDocX = coords.x;
      this.lastDocY = coords.y;
      this.engine.render();
    } else if (this.activeTool === 'marquee' || this.activeTool === 'crop') {
      this.updateMarqueeVisual(this.startDocX, this.startDocY, coords.x, coords.y);
    } else if (this.activeTool === 'lasso') {
      this.lassoPoints.push({ x: coords.x, y: coords.y });
      if (this.selection) { this.selection.preview = this.lassoPoints; this.selection.draw(); }
    }
  }

  onPointerUp(e) {
    if (this.isPanning) {
      this.isPanning = false;
      if (this.activeTool !== 'hand') {
        this.engine.viewport.classList.remove('panning');
      }
    }

    if (!this.isDrawing) return;
    const coords = this.engine.screenToDoc(e.clientX, e.clientY);
    const layer = this.engine.getActiveLayer();
    const mods = this.modifiers(e);
    const dragged = Math.hypot(e.clientX - this.startScreenX, e.clientY - this.startScreenY) > 4;

    if (this.pickingSource) {
      this.pickingSource = false;
      if (this.marqueeEl) this.marqueeEl.style.display = 'none';
      if (dragged && this.activeTool === 'clone') {
        this.setCloneArea(this.startDocX, this.startDocY, coords.x, coords.y);
      } else {
        this.setCloneSource(this.startDocX, this.startDocY);
      }
      this.releaseLatchedModifiers(e);
    } else if (this.ghost && this.activeTool === 'clone' && layer) {
      this.capture('Clone Stamp (area)');
      this.beginSelectionClip(layer);
      this.stampArea(coords.x, coords.y, layer);
      this.endSelectionClip(layer);
      this.hideGhost();
      this.engine.render();
    } else if ((this.activeTool === 'move' || this.activeTool === 'shape') && !dragged && this.strokeCaptured) {
      // A plain click changed nothing: don't leave an empty undo step.
      this.history.discardLast();
    } else if (this.activeTool === 'shape' && layer) {
      this.drawShape(this.startDocX, this.startDocY, coords.x, coords.y, layer);
      this.engine.render();
    } else if (this.activeTool === 'crop') {
      if (this.marqueeEl) this.marqueeEl.style.display = 'none';
      const rect = { x: Math.min(this.startDocX, coords.x), y: Math.min(this.startDocY, coords.y), width: Math.abs(coords.x - this.startDocX), height: Math.abs(coords.y - this.startDocY) };
      if (this.cropMode === 'canvas') {
        this.capture('Crop Canvas');
        const ok = this.engine.cropTo(rect);
        if (!ok) this.history.discardLast();
      } else {
        this.capture('Crop to New Layer');
        const made = this.cropToNewLayer(rect);
        if (!made) this.history.discardLast();
      }
    } else if (this.activeTool === 'gradient' && layer) {
      this.drawGradient(this.startDocX, this.startDocY, coords.x, coords.y, layer);
      this.endSelectionClip(layer);
      this.engine.render();
    } else if (this.activeTool === 'marquee') {
      if (this.marqueeEl) this.marqueeEl.style.display = 'none';
      const mode = mods.shift ? 'add' : mods.alt ? 'subtract' : 'replace';
      if (dragged) this.selection?.setRect(this.startDocX, this.startDocY, coords.x - this.startDocX, coords.y - this.startDocY, mode);
      else if (mode === 'replace') this.selection?.clear();
      this.releaseLatchedModifiers(e);
    } else if (this.activeTool === 'lasso') {
      const mode = mods.shift ? 'add' : mods.alt ? 'subtract' : 'replace';
      if (this.selection) this.selection.preview = null;
      if (dragged) this.selection?.setPolygon(this.lassoPoints.slice(), mode);
      else if (mode === 'replace') this.selection?.clear();
      this.selection?.draw();
      this.releaseLatchedModifiers(e);
    } else if (PAINT_TOOLS.includes(this.activeTool) && layer) {
      this.endSelectionClip(layer);
      this.engine.render();
      this.refreshSourceMarker();
    }

    this.isDrawing = false;
    this.strokeCaptured = false;
    this.engine.emit('layerChange');
  }

  // ---------------------------------------------------------------- painting
  drawBrushPoint(x, y, layer) {
    if (this.activeTool === 'clone') { this.drawClonePoint(x, y, layer); return; }
    if (this.activeTool === 'healing') { this.drawHealPoint(x, y, layer); return; }
    if (this.activeTool === 'blur') { this.blurLayer(layer, x, y); return; }
    if (this.activeTool === 'pen') { this.drawPenLine(x, y, x + 0.1, y + 0.1, layer); return; }
    const t = this.paintTarget(layer);
    const { color, erase } = this.strokeColor(t);
    window.BrushEngine.configure({ size: this.engine.brushSize, opacity: this.engine.brushOpacity, hardness: this.engine.brushHardness });
    window.BrushEngine.stamp(t.ctx, x - layer.x, y - layer.y, color, 1, erase);
  }

  strokeColor(target) {
    if (target.isMask) return { color: '#ffffff', erase: this.activeTool === 'eraser' || !this.colorIsLight(this.engine.foregroundColor) };
    return { color: this.engine.foregroundColor, erase: this.activeTool === 'eraser' };
  }

  /**
   * Smooth interpolated brush stroke line.
   */
  drawBrushLine(x1, y1, x2, y2, layer) {
    if (this.activeTool === 'clone' || this.activeTool === 'healing') {
      if (!this.cloneOffset) return;
      const dist = Math.hypot(x2 - x1, y2 - y1); const step = Math.max(1, this.engine.brushSize / 4);
      const draw = (px, py) => this.activeTool === 'clone' ? this.drawClonePoint(px, py, layer) : this.drawHealPoint(px, py, layer);
      for (let d = step; d < dist; d += step) draw(x1 + (x2 - x1) * d / dist, y1 + (y2 - y1) * d / dist);
      draw(x2, y2);
      this.updateCloneMarker(x2 + this.cloneOffset.x, y2 + this.cloneOffset.y);
      return;
    }
    if (this.activeTool === 'blur') { this.blurLine(x1, y1, x2, y2, layer); return; }
    const t = this.paintTarget(layer);
    const { color, erase } = this.strokeColor(t);
    window.BrushEngine.configure({ size: this.engine.brushSize, opacity: this.engine.brushOpacity, hardness: this.engine.brushHardness });
    const dx = x2 - x1; const dy = y2 - y1; const distance = Math.max(1, Math.hypot(dx, dy)); const points = [];
    for (let i = 0; i <= distance; i += Math.max(1, this.engine.brushSize / 4)) points.push({ x: x1 + dx * i / distance - layer.x, y: y1 + dy * i / distance - layer.y });
    window.BrushEngine.stroke(t.ctx, points, color, 1, erase);
  }

  /**
   * Draw Vector Shape on layer.
   */
  drawShape(x1, y1, x2, y2, layer) {
    const ctx = layer.ctx;
    const lx1 = x1 - layer.x;
    const ly1 = y1 - layer.y;
    const lx2 = x2 - layer.x;
    const ly2 = y2 - layer.y;

    const w = lx2 - lx1;
    const h = ly2 - ly1;

    ctx.save();
    ctx.fillStyle = this.engine.foregroundColor;
    ctx.strokeStyle = this.engine.foregroundColor;
    ctx.lineWidth = this.shapeStrokeWidth;

    if (this.shapeType === 'rect') {
      if (this.shapeFill) ctx.fillRect(lx1, ly1, w, h);
      if (this.shapeStrokeWidth > 0) ctx.strokeRect(lx1, ly1, w, h);
    } else if (this.shapeType === 'circle') {
      ctx.beginPath();
      const rx = Math.abs(w / 2);
      const ry = Math.abs(h / 2);
      const cx = lx1 + w / 2;
      const cy = ly1 + h / 2;
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      if (this.shapeFill) ctx.fill();
      if (this.shapeStrokeWidth > 0) ctx.stroke();
    } else if (this.shapeType === 'line') {
      ctx.beginPath();
      ctx.moveTo(lx1, ly1);
      ctx.lineTo(lx2, ly2);
      ctx.stroke();
    }

    ctx.restore();
  }

  /**
   * Add text at target coordinate.
   */
  addTextAt(x, y, layer) {
    const text = prompt('Enter text for layer:');
    if (!text) return;

    this.history.captureSnapshot('Add Text');

    const ctx = layer.ctx;
    ctx.save();
    ctx.fillStyle = this.engine.foregroundColor;
    ctx.font = `${this.textSize}px ${this.textFont}`;
    ctx.textBaseline = 'top';
    ctx.fillText(text, x - layer.x, y - layer.y);
    ctx.restore();

    this.engine.render();
    this.engine.emit('layerChange');
  }

  /**
   * Sample color at coordinates.
   */
  pickColor(x, y) {
    if (x < 0 || x >= this.engine.width || y < 0 || y >= this.engine.height) return;
    const p = this.engine.displayCtx.getImageData(x, y, 1, 1).data;
    const hex = '#' + ((1 << 24) + (p[0] << 16) + (p[1] << 8) + p[2]).toString(16).slice(1);
    this.engine.foregroundColor = hex;

    const fgSwatch = document.getElementById('swatch-fg');
    if (fgSwatch) fgSwatch.style.backgroundColor = hex;
    const hexInput = document.getElementById('color-hex-input');
    if (hexInput) hexInput.value = hex;
  }

  /**
   * 4-way stack-based Flood Fill algorithm.
   */
  floodFill(startX, startY, layer, fillColorHex) {
    const lx = startX - layer.x;
    const ly = startY - layer.y;
    if (lx < 0 || lx >= layer.width || ly < 0 || ly >= layer.height) return;

    const ctx = layer.ctx;
    const imgData = ctx.getImageData(0, 0, layer.width, layer.height);
    const data = imgData.data;
    const w = layer.width;
    const h = layer.height;

    // Parse target fill color
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = 1; tempCanvas.height = 1;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.fillStyle = fillColorHex;
    tempCtx.fillRect(0, 0, 1, 1);
    const fillRgba = tempCtx.getImageData(0, 0, 1, 1).data;

    const startIdx = (ly * w + lx) * 4;
    const startR = data[startIdx];
    const startG = data[startIdx + 1];
    const startB = data[startIdx + 2];
    const startA = data[startIdx + 3];

    if (startR === fillRgba[0] && startG === fillRgba[1] && startB === fillRgba[2] && startA === fillRgba[3]) {
      return;
    }

    const tolerance = 25;
    const match = (idx) => {
      return Math.abs(data[idx] - startR) <= tolerance &&
             Math.abs(data[idx + 1] - startG) <= tolerance &&
             Math.abs(data[idx + 2] - startB) <= tolerance &&
             Math.abs(data[idx + 3] - startA) <= tolerance;
    };

    const stack = [ly * w + lx];
    const visited = new Uint8Array(w * h);
    visited[ly * w + lx] = 1;

    while (stack.length > 0) {
      const p = stack.pop();
      const cx = p % w; const cy = (p - cx) / w;
      const idx = p * 4;
      data[idx] = fillRgba[0];
      data[idx + 1] = fillRgba[1];
      data[idx + 2] = fillRgba[2];
      data[idx + 3] = fillRgba[3];
      if (cx > 0 && !visited[p - 1] && match((p - 1) * 4)) { visited[p - 1] = 1; stack.push(p - 1); }
      if (cx < w - 1 && !visited[p + 1] && match((p + 1) * 4)) { visited[p + 1] = 1; stack.push(p + 1); }
      if (cy > 0 && !visited[p - w] && match((p - w) * 4)) { visited[p - w] = 1; stack.push(p - w); }
      if (cy < h - 1 && !visited[p + w] && match((p + w) * 4)) { visited[p + w] = 1; stack.push(p + w); }
    }

    ctx.putImageData(imgData, 0, 0);
  }

  updateMarqueeVisual(x1, y1, x2, y2) {
    if (!this.marqueeEl) return;
    const minX = Math.min(x1, x2);
    const minY = Math.min(y1, y2);
    const w = Math.abs(x2 - x1);
    const h = Math.abs(y2 - y1);
    // The marquee lives inside the viewport, so positions are viewport-relative.
    const screenLeft = this.engine.panX + minX * this.engine.zoom;
    const screenTop = this.engine.panY + minY * this.engine.zoom;

    this.marqueeEl.style.display = 'block';
    this.marqueeEl.style.left = `${screenLeft}px`;
    this.marqueeEl.style.top = `${screenTop}px`;
    this.marqueeEl.style.width = `${w * this.engine.zoom}px`;
    this.marqueeEl.style.height = `${h * this.engine.zoom}px`;
  }

  // ---------------------------------------------------------------- clone / heal
  snapshotComposite() {
    // Sample "all layers" (like Photoshop's Sample: All Layers) in document coordinates.
    this.engine.render();
    const c = document.createElement('canvas'); c.width = this.engine.width; c.height = this.engine.height;
    c.getContext('2d').drawImage(this.engine.displayCanvas, 0, 0);
    return c;
  }

  softPatch(size) {
    if (!this._patch || this._patch.width !== size) { this._patch = document.createElement('canvas'); this._patch.width = size; this._patch.height = size; }
    return this._patch;
  }

  applySoftEdge(pctx, size) {
    const r = size / 2;
    const hard = Math.max(0, Math.min(0.98, this.engine.brushHardness));
    const g = pctx.createRadialGradient(r, r, r * hard, r, r, r);
    g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    pctx.globalCompositeOperation = 'destination-in';
    pctx.fillStyle = g; pctx.fillRect(0, 0, size, size);
    pctx.globalCompositeOperation = 'source-over';
  }

  drawClonePoint(x, y, layer) {
    if (!this.cloneBuffer || !this.cloneOffset) return;
    const size = Math.max(1, Math.round(this.engine.brushSize));
    const sx = x + this.cloneOffset.x; const sy = y + this.cloneOffset.y;
    const patch = this.softPatch(size); const pctx = patch.getContext('2d');
    pctx.clearRect(0, 0, size, size);
    pctx.drawImage(this.cloneBuffer, sx - size / 2, sy - size / 2, size, size, 0, 0, size, size);
    this.applySoftEdge(pctx, size);
    const ctx = layer.ctx;
    ctx.save();
    ctx.globalAlpha = this.engine.brushOpacity;
    ctx.drawImage(patch, x - layer.x - size / 2, y - layer.y - size / 2);
    ctx.restore();
  }

  /** Healing: copy the source texture but keep the destination's colour and light. */
  drawHealPoint(x, y, layer) {
    if (!this.cloneBuffer || !this.cloneOffset) return;
    const size = Math.max(4, Math.round(this.engine.brushSize));
    const pad = Math.max(2, Math.round(size / 4));
    const big = size + pad * 2;
    const sx = Math.round(x + this.cloneOffset.x - size / 2 - pad);
    const sy = Math.round(y + this.cloneOffset.y - size / 2 - pad);
    const dx = Math.round(x - size / 2 - pad);
    const dy = Math.round(y - size / 2 - pad);
    const grab = (gx, gy) => { const c = document.createElement('canvas'); c.width = big; c.height = big; c.getContext('2d', { willReadFrequently: true }).drawImage(this.cloneBuffer, gx, gy, big, big, 0, 0, big, big); return c; };
    // Low-pass by shrinking and enlarging again: works in every browser.
    const lowPass = (c) => { const s = Math.max(2, Math.round(big / 6)); const small = document.createElement('canvas'); small.width = s; small.height = s; const sctx = small.getContext('2d'); sctx.imageSmoothingQuality = 'high'; sctx.drawImage(c, 0, 0, s, s); const out = document.createElement('canvas'); out.width = big; out.height = big; const octx = out.getContext('2d', { willReadFrequently: true }); octx.imageSmoothingQuality = 'high'; octx.drawImage(small, 0, 0, big, big); return octx.getImageData(0, 0, big, big).data; };
    const srcC = grab(sx, sy); const dstC = grab(dx, dy);
    const src = srcC.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, big, big);
    const srcLow = lowPass(srcC); const dstLow = lowPass(dstC);
    const out = src.data;
    for (let i = 0; i < out.length; i += 4) {
      out[i] = Math.max(0, Math.min(255, out[i] - srcLow[i] + dstLow[i]));
      out[i + 1] = Math.max(0, Math.min(255, out[i + 1] - srcLow[i + 1] + dstLow[i + 1]));
      out[i + 2] = Math.max(0, Math.min(255, out[i + 2] - srcLow[i + 2] + dstLow[i + 2]));
    }
    const patch = this.softPatch(size); const pctx = patch.getContext('2d');
    pctx.clearRect(0, 0, size, size);
    const tmp = document.createElement('canvas'); tmp.width = big; tmp.height = big; tmp.getContext('2d').putImageData(src, 0, 0);
    pctx.drawImage(tmp, pad, pad, size, size, 0, 0, size, size);
    this.applySoftEdge(pctx, size);
    const ctx = layer.ctx;
    ctx.save();
    ctx.globalAlpha = this.engine.brushOpacity;
    ctx.drawImage(patch, x - layer.x - size / 2, y - layer.y - size / 2);
    ctx.restore();
  }

  setCloneSource(x, y) {
    this.cloneBuffer = this.snapshotComposite();
    this.cloneSource = { x, y }; this.cloneArea = null; this.cloneOffset = null;
    this.cloneMode = 'brush';
    this.updateCloneModeUI();
    this.refreshSourceMarker();
    const th = window.PhotoEarnI18n?.language === 'th';
    this.hint(th ? `ตั้งจุดต้นทางที่ ${Math.round(x)}, ${Math.round(y)} · ขนาด ${this.engine.brushSize}px · ลากตรงที่ต้องการวางสำเนา` : `Source set at ${Math.round(x)}, ${Math.round(y)} · size ${this.engine.brushSize}px · now drag where the copy should appear`);
  }

  setCloneArea(x1, y1, x2, y2) {
    const x = Math.max(0, Math.min(x1, x2)); const y = Math.max(0, Math.min(y1, y2));
    const w = Math.min(this.engine.width, Math.max(x1, x2)) - x; const h = Math.min(this.engine.height, Math.max(y1, y2)) - y;
    if (w < 2 || h < 2) { this.setCloneSource(x1, y1); return; }
    this.cloneBuffer = this.snapshotComposite();
    this.cloneArea = { x, y, w, h };
    this.cloneSource = { x: x + w / 2, y: y + h / 2 };
    this.cloneOffset = null;
    this.cloneMode = 'area';
    this.updateCloneModeUI();
    this.refreshSourceMarker();
    const th = window.PhotoEarnI18n?.language === 'th';
    this.hint(th ? `เลือกพื้นที่ ${Math.round(w)}×${Math.round(h)}px แล้ว · คลิกหรือลากไปตำแหน่งที่ต้องการวาง` : `Area ${Math.round(w)}×${Math.round(h)}px picked · click or drag where it should be stamped`);
  }

  setCloneMode(mode) {
    this.cloneMode = mode === 'area' && this.cloneArea ? 'area' : 'brush';
    if (mode === 'area' && !this.cloneArea) this.hint(window.PhotoEarnI18n?.language === 'th' ? 'Alt+ลาก เพื่อเลือกพื้นที่ที่จะโคลน' : 'Alt+drag to pick the area to clone');
    this.updateCloneModeUI();
    this.refreshSourceMarker();
  }

  updateCloneModeUI() {
    const sel = document.getElementById('opt-clone-mode');
    if (sel) sel.value = this.cloneMode;
    const info = document.getElementById('opt-clone-info');
    if (info) info.textContent = this.cloneArea && this.cloneMode === 'area' ? `${Math.round(this.cloneArea.w)}×${Math.round(this.cloneArea.h)}px` : `${this.engine.brushSize}px`;
  }

  showGhost(x, y) {
    const a = this.cloneArea; if (!a) return;
    if (!this.ghost) {
      this.ghost = document.createElement('canvas');
      this.ghost.className = 'clone-ghost';
      this.engine.stage.appendChild(this.ghost);
    }
    this.ghost.width = Math.round(a.w); this.ghost.height = Math.round(a.h);
    this.ghost.getContext('2d').drawImage(this.cloneBuffer, a.x, a.y, a.w, a.h, 0, 0, a.w, a.h);
    this.ghost.style.display = 'block';
    this.moveGhost(x, y);
  }

  moveGhost(x, y) {
    if (!this.ghost || !this.cloneArea) return;
    this.ghost.style.left = `${Math.round(x - this.cloneArea.w / 2)}px`;
    this.ghost.style.top = `${Math.round(y - this.cloneArea.h / 2)}px`;
  }

  hideGhost() { if (this.ghost) { this.ghost.remove(); this.ghost = null; } }

  stampArea(x, y, layer) {
    const a = this.cloneArea; if (!a || !this.cloneBuffer) return;
    const ctx = layer.ctx;
    ctx.save();
    ctx.globalAlpha = this.engine.brushOpacity;
    ctx.drawImage(this.cloneBuffer, a.x, a.y, a.w, a.h, Math.round(x - a.w / 2) - layer.x, Math.round(y - a.h / 2) - layer.y, a.w, a.h);
    ctx.restore();
  }

  refreshSourceMarker() {
    const tool = this.activeTool;
    const show = tool === 'clone' || tool === 'healing';
    let area = document.getElementById('clone-area-marker');
    if (!area) { area = document.createElement('div'); area.id = 'clone-area-marker'; area.className = 'clone-area-marker'; this.engine.viewport.appendChild(area); }
    if (show && this.cloneArea && this.cloneMode === 'area' && tool === 'clone') {
      const z = this.engine.zoom; const a = this.cloneArea;
      area.style.display = 'block';
      area.style.left = `${this.engine.panX + a.x * z}px`; area.style.top = `${this.engine.panY + a.y * z}px`;
      area.style.width = `${a.w * z}px`; area.style.height = `${a.h * z}px`;
    } else area.style.display = 'none';
    if (show && this.cloneSource && !(this.cloneMode === 'area' && tool === 'clone')) this.updateCloneMarker(this.cloneSource.x, this.cloneSource.y);
    else this.updateCloneMarker(null);
    this.updateCloneModeUI();
  }

  updateCloneMarker(docX, docY) {
    let marker = document.getElementById('clone-source-marker');
    if (!marker) { marker = document.createElement('div'); marker.id = 'clone-source-marker'; marker.className = 'clone-source-marker'; this.engine.viewport.appendChild(marker); }
    if (docX === null || docX === undefined) { marker.style.display = 'none'; return; }
    const d = Math.max(10, this.engine.brushSize * this.engine.zoom);
    marker.style.display = (this.activeTool === 'clone' || this.activeTool === 'healing') ? 'block' : 'none';
    marker.style.width = `${d}px`; marker.style.height = `${d}px`;
    marker.style.transform = `translate(${this.engine.panX + docX * this.engine.zoom - d / 2}px, ${this.engine.panY + docY * this.engine.zoom - d / 2}px)`;
  }

  // ---------------------------------------------------------------- crop
  /**
   * Copy the cropped area into a NEW layer above everything; the original
   * layers stay untouched. Source: the active layer, or all visible layers.
   */
  cropToNewLayer(rect) {
    const e = this.engine;
    const x = Math.max(0, Math.floor(rect.x)); const y = Math.max(0, Math.floor(rect.y));
    const w = Math.min(e.width, Math.ceil(rect.x + rect.width)) - x;
    const h = Math.min(e.height, Math.ceil(rect.y + rect.height)) - y;
    if (w < 2 || h < 2) return false;
    const th = window.PhotoEarnI18n?.language === 'th';
    const active = e.getActiveLayer();
    let source = 'layer';
    let src = Layer.makeCanvas(e.width, e.height);
    const sctx = src.getContext('2d', { willReadFrequently: true });
    if (this.cropSource === 'visible' || !active) source = 'visible';
    else {
      sctx.drawImage(active.getRenderSource(), active.x, active.y);
      if (!ToolManager.hasPixels(sctx, x, y, w, h)) source = 'visible';
    }
    if (source === 'visible') { e.render(); sctx.clearRect(0, 0, e.width, e.height); sctx.drawImage(e.displayCanvas, 0, 0); }
    const n = e.layers.filter(l => /^Crop \d+/.test(l.name)).length + 1;
    const layer = new Layer(`Crop ${n} (${w}×${h})`, e.width, e.height);
    layer.ctx.drawImage(src, x, y, w, h, x, y, w, h);
    e.layers.push(layer);
    e.activeLayerIndex = e.layers.length - 1;
    e.selectionMgr?.clear?.();
    e.render(); e.emit('layerChange');
    this.hint(th
      ? `ครอบตัดเป็นเลเยอร์ใหม่ "${layer.name}" แล้ว · รูปเดิมยังอยู่ครบ (ปิดตาเลเยอร์เดิมเพื่อดูเฉพาะส่วนที่ครอบ)`
      : `Cropped into new layer "${layer.name}" · the original is untouched (hide it to see only the crop)`);
    return true;
  }

  static hasPixels(ctx, x, y, w, h) {
    const d = ctx.getImageData(x, y, w, h).data;
    for (let i = 3; i < d.length; i += 16) if (d[i] > 8) return true;
    return false;
  }

  // ---------------------------------------------------------------- blur
  /**
   * Blur Tool works on whichever layer actually has pixels under the brush:
   * if the active layer is empty there (e.g. a text or effect layer was
   * selected), the top visible layer with pixels at that spot is used.
   */
  pickBlurLayer(x, y) {
    const e = this.engine; const th = window.PhotoEarnI18n?.language === 'th';
    const r = Math.max(2, Math.round(e.brushSize / 2));
    const has = (l) => {
      if (!l || !l.visible || l.group || l.adjustment) return false;
      const lx = Math.round(x - l.x - r), ly = Math.round(y - l.y - r);
      const sx = Math.max(0, lx), sy = Math.max(0, ly);
      const ex = Math.min(l.width, lx + r * 2), ey = Math.min(l.height, ly + r * 2);
      if (ex <= sx || ey <= sy) return false;
      return ToolManager.hasPixels(l.ctx, sx, sy, ex - sx, ey - sy);
    };
    const active = e.getActiveLayer();
    if (has(active)) return active;
    for (let i = e.layers.length - 1; i >= 0; i--) {
      if (has(e.layers[i])) {
        e.setActiveLayer(i);
        this.hint(th ? `เบลอบนเลเยอร์ "${e.layers[i].name}" (เลเยอร์ที่เลือกไว้ไม่มีภาพตรงนี้)` : `Blurring "${e.layers[i].name}" (the selected layer has no pixels here)`);
        return e.layers[i];
      }
    }
    this.hint(th ? 'ตรงนี้ไม่มีภาพให้เบลอ' : 'Nothing to blur here');
    return null;
  }

  /** Box-blur (3 passes ≈ Gaussian) on premultiplied RGBA. Works in every browser (no ctx.filter). */
  static boxBlurRGBA(data, w, h, radius, passes = 3) {
    const n = w * h; const ch = [new Float32Array(n), new Float32Array(n), new Float32Array(n), new Float32Array(n)];
    for (let i = 0; i < n; i++) { const a = data[i * 4 + 3] / 255; ch[0][i] = data[i * 4] * a; ch[1][i] = data[i * 4 + 1] * a; ch[2][i] = data[i * 4 + 2] * a; ch[3][i] = data[i * 4 + 3]; }
    const tmp = new Float32Array(n); const r = Math.max(1, Math.round(radius));
    const pass = (src, dst, len, count, stride, step) => {
      for (let line = 0; line < count; line++) {
        const base = line * stride; let sum = 0;
        for (let k = -r; k <= r; k++) sum += src[base + Math.min(len - 1, Math.max(0, k)) * step];
        for (let i = 0; i < len; i++) {
          dst[base + i * step] = sum / (2 * r + 1);
          sum += src[base + Math.min(len - 1, i + r + 1) * step] - src[base + Math.max(0, i - r) * step];
        }
      }
    };
    for (let p = 0; p < passes; p++) for (const c of ch) { pass(c, tmp, w, h, w, 1); pass(tmp, c, h, w, 1, w); }
    const out = new Uint8ClampedArray(data.length);
    for (let i = 0; i < n; i++) { const a = ch[3][i]; const k = a > 0 ? 255 / a : 0; out[i * 4] = ch[0][i] * k; out[i * 4 + 1] = ch[1][i] * k; out[i * 4 + 2] = ch[2][i] * k; out[i * 4 + 3] = a; }
    return out;
  }

  blurLayer(layer, x, y) {
    if (!layer) return;
    const size = Math.max(4, this.engine.brushSize); const r = size / 2;
    const br = Math.max(1, Math.round(size / 10));
    const lx = x - layer.x, ly = y - layer.y;
    const sx = Math.max(0, Math.floor(lx - r - br)), sy = Math.max(0, Math.floor(ly - r - br));
    const ex = Math.min(layer.width, Math.ceil(lx + r + br)), ey = Math.min(layer.height, Math.ceil(ly + r + br));
    const w = ex - sx, h = ey - sy; if (w < 2 || h < 2) return;
    const img = layer.ctx.getImageData(sx, sy, w, h);
    const blurred = ToolManager.boxBlurRGBA(img.data, w, h, br);
    const d = img.data; const hard = Math.max(0, Math.min(0.95, this.engine.brushHardness)); const strength = this.engine.brushOpacity;
    for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
      const dist = Math.hypot(sx + px + 0.5 - lx, sy + py + 0.5 - ly) / r; if (dist >= 1) continue;
      const wgt = (dist <= hard ? 1 : 1 - (dist - hard) / (1 - hard)) * strength; const i = (py * w + px) * 4;
      for (let c = 0; c < 4; c++) d[i + c] = d[i + c] + (blurred[i + c] - d[i + c]) * wgt;
    }
    layer.ctx.putImageData(img, sx, sy);
  }

  blurLine(x1, y1, x2, y2, layer) {
    const dist = Math.hypot(x2 - x1, y2 - y1); const step = Math.max(2, this.engine.brushSize / 3);
    for (let d = step; d < dist; d += step) this.blurLayer(layer, x1 + (x2 - x1) * d / dist, y1 + (y2 - y1) * d / dist);
    this.blurLayer(layer, x2, y2);
  }

  drawGradient(x1, y1, x2, y2, layer) {
    const t = this.paintTarget(layer);
    const ctx = t.ctx; const a = ctx.createLinearGradient(x1 - layer.x, y1 - layer.y, x2 - layer.x, y2 - layer.y);
    if (t.isMask) { a.addColorStop(0, 'rgba(255,255,255,1)'); a.addColorStop(1, 'rgba(255,255,255,0)'); ctx.save(); ctx.clearRect(0, 0, layer.width, layer.height); ctx.fillStyle = a; ctx.fillRect(0, 0, layer.width, layer.height); ctx.restore(); return; }
    a.addColorStop(0, this.engine.foregroundColor); a.addColorStop(1, this.engine.backgroundColor);
    ctx.save(); ctx.globalAlpha = this.engine.brushOpacity; ctx.fillStyle = a; ctx.fillRect(0, 0, layer.width, layer.height); ctx.restore();
  }

  drawPenLine(x1, y1, x2, y2, layer) {
    const t = this.paintTarget(layer);
    const ctx = t.ctx; ctx.save();
    if (t.isMask) { ctx.globalCompositeOperation = this.colorIsLight(this.engine.foregroundColor) ? 'source-over' : 'destination-out'; ctx.strokeStyle = '#ffffff'; }
    else ctx.strokeStyle = this.engine.foregroundColor;
    ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x1 - layer.x, y1 - layer.y); ctx.lineTo(x2 - layer.x, y2 - layer.y); ctx.stroke(); ctx.restore();
  }
}

window.ToolManager = ToolManager;

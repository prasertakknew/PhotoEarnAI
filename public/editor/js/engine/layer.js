/**
 * Layer - Represents an independent raster canvas buffer within a multi-layer document.
 * Adheres to Photopea's internal layer composition model.
 *
 * Layer masks: `mask` is an optional canvas the same size as the layer. Its alpha
 * channel decides visibility (opaque = shown, transparent = hidden), so painting
 * white reveals and painting black (or erasing) hides, like Photoshop masks.
 */
class Layer {
  constructor(name = 'New Layer', width = 1024, height = 1024) {
    this.id = 'layer_' + Math.random().toString(36).substr(2, 9);
    this.name = name;
    this.width = width;
    this.height = height;

    // Position offset relative to document canvas
    this.x = 0;
    this.y = 0;

    // Composition state
    this.opacity = 1.0;
    this.blendMode = 'source-over';
    this.visible = true;
    this.locked = false;
    this.group = false;
    this.groupChildren = [];
    this.psd = null;
    this.textData = null;
    this.smartObject = null;
    this.adjustment = null;
    this.styles = null;
    this.animationFrame = undefined;

    // Layer mask
    this.mask = null;
    this.maskEnabled = true;
    this.editingMask = false;

    // In-memory offscreen pixel canvas
    this.canvas = document.createElement('canvas');
    this.canvas.width = width;
    this.canvas.height = height;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    this.ctx.imageSmoothingEnabled = true;
  }

  static makeCanvas(width, height) {
    const c = document.createElement('canvas');
    c.width = width; c.height = height;
    return c;
  }

  /** Create a mask. mode: 'reveal' (all visible), 'hide' (all hidden) or a doc-sized selection canvas. */
  addMask(mode = 'reveal', selectionCanvas = null) {
    const mask = Layer.makeCanvas(this.width, this.height);
    const mctx = mask.getContext('2d', { willReadFrequently: true });
    if (selectionCanvas) {
      mctx.drawImage(selectionCanvas, -this.x, -this.y);
    } else if (mode === 'reveal') {
      mctx.fillStyle = '#ffffff';
      mctx.fillRect(0, 0, this.width, this.height);
    }
    this.mask = mask;
    this.maskEnabled = true;
    this.editingMask = true;
    return mask;
  }

  get maskCtx() { return this.mask ? this.mask.getContext('2d', { willReadFrequently: true }) : null; }

  removeMask() { this.mask = null; this.editingMask = false; }

  /** Bake the mask into the pixels and drop it. */
  applyMask() {
    if (!this.mask) return;
    this.ctx.save();
    this.ctx.globalCompositeOperation = 'destination-in';
    this.ctx.drawImage(this.mask, 0, 0);
    this.ctx.restore();
    this.removeMask();
  }

  invertMask() {
    if (!this.mask) return;
    const inv = Layer.makeCanvas(this.width, this.height);
    const ictx = inv.getContext('2d');
    ictx.fillStyle = '#ffffff';
    ictx.fillRect(0, 0, this.width, this.height);
    ictx.globalCompositeOperation = 'destination-out';
    ictx.drawImage(this.mask, 0, 0);
    const mctx = this.maskCtx;
    mctx.clearRect(0, 0, this.width, this.height);
    mctx.drawImage(inv, 0, 0);
  }

  /** Canvas to composite: the pixels with the mask applied when there is one. */
  getRenderSource() {
    if (!this.mask || !this.maskEnabled) return this.canvas;
    if (!this._maskedCanvas || this._maskedCanvas.width !== this.width || this._maskedCanvas.height !== this.height) {
      this._maskedCanvas = Layer.makeCanvas(this.width, this.height);
    }
    const t = this._maskedCanvas.getContext('2d');
    t.globalCompositeOperation = 'source-over';
    t.clearRect(0, 0, this.width, this.height);
    t.drawImage(this.canvas, 0, 0);
    t.globalCompositeOperation = 'destination-in';
    t.drawImage(this.mask, 0, 0);
    t.globalCompositeOperation = 'source-over';
    return this._maskedCanvas;
  }

  /**
   * Clears all pixels in this layer.
   */
  clear() {
    this.ctx.clearRect(0, 0, this.width, this.height);
  }

  /**
   * Resizes the layer canvas buffer while preserving existing pixels.
   */
  resize(newWidth, newHeight) {
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = this.width;
    tempCanvas.height = this.height;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.drawImage(this.canvas, 0, 0);

    this.width = newWidth;
    this.height = newHeight;
    this.canvas.width = newWidth;
    this.canvas.height = newHeight;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    this.ctx.drawImage(tempCanvas, 0, 0);
    if (this.mask) {
      const m = Layer.makeCanvas(newWidth, newHeight);
      m.getContext('2d').drawImage(this.mask, 0, 0);
      this.mask = m;
    }
  }

  /**
   * Deep clone this layer.
   */
  clone(newName) {
    const copy = new Layer(newName || (this.name + ' Copy'), this.width, this.height);
    copy.x = this.x;
    copy.y = this.y;
    copy.opacity = this.opacity;
    copy.blendMode = this.blendMode;
    copy.visible = this.visible;
    copy.locked = this.locked;
    copy.group = this.group;
    copy.groupChildren = [...this.groupChildren];
    copy.psd = this.psd ? structuredClone(this.psd) : null;
    copy.textData = this.textData ? structuredClone(this.textData) : null;
    copy.smartObject = this.smartObject ? structuredClone(this.smartObject) : null;
    copy.adjustment = this.adjustment ? structuredClone(this.adjustment) : null;
    copy.styles = this.styles ? structuredClone(this.styles) : null;
    copy.watermarkData = this.watermarkData ? structuredClone(this.watermarkData) : undefined;
    copy.animationFrame = this.animationFrame;
    copy.ctx.drawImage(this.canvas, 0, 0);
    if (this.mask) {
      copy.mask = Layer.makeCanvas(this.width, this.height);
      copy.mask.getContext('2d', { willReadFrequently: true }).drawImage(this.mask, 0, 0);
      copy.maskEnabled = this.maskEnabled;
      copy.editingMask = this.editingMask;
    }
    return copy;
  }

  /**
   * Draws this layer onto a target canvas context applying layer opacity, blend mode and offset.
   */
  renderTo(targetCtx) {
    if (!this.visible || this.opacity <= 0) return;

    if (this.adjustment && window.AdjustmentLayers) {
      window.AdjustmentLayers.applyToContext(targetCtx, this.adjustment, targetCtx.canvas.width, targetCtx.canvas.height);
      return;
    }

    targetCtx.save();
    targetCtx.globalAlpha = this.opacity;
    targetCtx.globalCompositeOperation = this.blendMode;
    if (this.styles && window.LayerStyles) window.LayerStyles.apply(targetCtx, this);
    targetCtx.drawImage(this.getRenderSource(), this.x, this.y);
    targetCtx.restore();
  }

  /**
   * Generates a mini thumbnail data URL for UI Layer list.
   */
  getThumbnail(thumbWidth = 32, thumbHeight = 32, source = this.canvas, background = null) {
    const thumbCanvas = document.createElement('canvas');
    thumbCanvas.width = thumbWidth;
    thumbCanvas.height = thumbHeight;
    const thumbCtx = thumbCanvas.getContext('2d');
    thumbCtx.imageSmoothingEnabled = true;

    // Draw scaled content
    const aspect = this.width / this.height;
    let dw = thumbWidth;
    let dh = thumbHeight;
    let dx = 0;
    let dy = 0;

    if (aspect >= 1) {
      dh = thumbWidth / aspect;
      dy = (thumbHeight - dh) / 2;
    } else {
      dw = thumbHeight * aspect;
      dx = (thumbWidth - dw) / 2;
    }

    if (background) { thumbCtx.fillStyle = background; thumbCtx.fillRect(dx, dy, dw, dh); }
    thumbCtx.drawImage(source, dx, dy, dw, dh);
    return thumbCanvas.toDataURL('image/png');
  }

  getMaskThumbnail(w = 32, h = 32) { return this.mask ? this.getThumbnail(w, h, this.mask, '#000000') : null; }

  /**
   * Serialize layer data to JSON compatible object.
   */
  toJSON() {
    return {
      id: this.id,
      name: this.name,
      width: this.width,
      height: this.height,
      x: this.x,
      y: this.y,
      opacity: this.opacity,
      blendMode: this.blendMode,
      visible: this.visible,
      group: this.group,
      groupChildren: this.groupChildren,
      psd: this.psd,
      textData: this.textData,
      smartObject: this.smartObject,
      adjustment: this.adjustment,
      styles: this.styles,
      animationFrame: this.animationFrame,
      maskDataUrl: this.mask ? this.mask.toDataURL('image/png') : null,
      maskEnabled: this.maskEnabled,
      dataUrl: this.canvas.toDataURL('image/png')
    };
  }

  /**
   * Restore layer from serialized JSON object.
   */
  static async fromJSON(json) {
    const layer = new Layer(json.name, json.width, json.height);
    layer.id = json.id || layer.id;
    layer.x = json.x || 0;
    layer.y = json.y || 0;
    layer.opacity = json.opacity !== undefined ? json.opacity : 1.0;
    layer.blendMode = json.blendMode || 'source-over';
    layer.visible = json.visible !== undefined ? json.visible : true;
    layer.group = Boolean(json.group);
    layer.groupChildren = json.groupChildren || [];
    layer.psd = json.psd || null;
    layer.textData = json.textData || null;
    layer.smartObject = json.smartObject || null;
    layer.adjustment = json.adjustment || null;
    layer.styles = json.styles || null;
    layer.animationFrame = json.animationFrame;

    const drawUrl = (url, ctx) => new Promise((resolve) => {
      const img = new Image();
      img.onload = () => { ctx.drawImage(img, 0, 0); resolve(); };
      img.onerror = () => resolve();
      img.src = url;
    });
    if (json.dataUrl) await drawUrl(json.dataUrl, layer.ctx);
    if (json.maskDataUrl) {
      layer.mask = Layer.makeCanvas(layer.width, layer.height);
      await drawUrl(json.maskDataUrl, layer.mask.getContext('2d', { willReadFrequently: true }));
      layer.maskEnabled = json.maskEnabled !== false;
    }
    return layer;
  }
}

window.Layer = Layer;

/**
 * CanvasEngine - Core multi-layer raster compositor and viewport controller.
 * Mirrors Photopea's internal canvas architecture and blending pipeline.
 */
class CanvasEngine {
  constructor(canvasElement, stageElement, viewportElement) {
    this.displayCanvas = canvasElement;
    this.displayCtx = this.displayCanvas.getContext('2d', { willReadFrequently: true });
    this.stage = stageElement;
    this.viewport = viewportElement;

    // Document properties
    this.docName = 'Untitled-1.psd';
    this.width = 1024;
    this.height = 1024;
    this.layers = [];
    this.activeLayerIndex = 0;

    // Viewport transform
    this.zoom = 1.0;
    this.panX = 0;
    this.panY = 0;

    // Change listeners
    this.listeners = {
      layerChange: [],
      render: [],
      viewportChange: [],
      historyChange: [],
      selectionChange: []
    };

    // Foreground / Background colors
    this.foregroundColor = '#3b82f6';
    this.backgroundColor = '#ffffff';

    // Tool state
    this.brushSize = 18;
    this.brushOpacity = 1.0;
    this.brushHardness = 0.8;

    // Shared pixel selection (marquee, lasso, magic wand)
    this.selectionMgr = window.SelectionManager ? new SelectionManager(this) : null;
  }

  /**
   * Subscribe to engine events.
   */
  on(event, callback) {
    if (this.listeners[event]) {
      this.listeners[event].push(callback);
    }
  }

  emit(event, data) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(fn => fn(data));
    }
  }

  /**
   * Initialize a new document.
   */
  newDocument(name = 'Untitled-1', width = 1024, height = 1024, background = 'white') {
    this.docName = name.endsWith('.psd') ? name : name + '.psd';
    this.width = parseInt(width, 10);
    this.height = parseInt(height, 10);

    this.displayCanvas.width = this.width;
    this.displayCanvas.height = this.height;

    this.layers = [];

    // Create background layer
    const bgLayer = new Layer('Background', this.width, this.height);
    if (background === 'white') {
      bgLayer.ctx.fillStyle = '#ffffff';
      bgLayer.ctx.fillRect(0, 0, this.width, this.height);
    } else if (background === 'black') {
      bgLayer.ctx.fillStyle = '#000000';
      bgLayer.ctx.fillRect(0, 0, this.width, this.height);
    } else if (typeof background === 'string' && /^#[0-9a-f]{3,8}$/i.test(background)) {
      bgLayer.ctx.fillStyle = background;
      bgLayer.ctx.fillRect(0, 0, this.width, this.height);
    } // transparent remains empty

    this.layers.push(bgLayer);
    this.activeLayerIndex = 0;
    this.dpi = this.dpi || 72;
    this.selectionMgr?.clear();

    this.centerAndFitViewport();
    this.render();
    this.emit('layerChange');
  }

  /**
   * Active layer accessor.
   */
  getActiveLayer() {
    if (this.layers.length === 0) return null;
    return this.layers[this.activeLayerIndex] || this.layers[0];
  }

  /**
   * Set active layer by index.
   */
  setActiveLayer(index) {
    if (index >= 0 && index < this.layers.length) {
      this.activeLayerIndex = index;
      this.emit('layerChange');
    }
  }

  /**
   * Add a new transparent layer on top of active layer.
   */
  addLayer(name, options = {}) {
    const layerName = name || `Layer ${this.layers.length + 1}`;
    const newLayer = new Layer(layerName, this.width, this.height);
    Object.assign(newLayer, options);
    
    // Insert directly above current active layer
    const insertIdx = this.activeLayerIndex + 1;
    this.layers.splice(insertIdx, 0, newLayer);
    this.activeLayerIndex = insertIdx;

    this.render();
    this.emit('layerChange');
    return newLayer;
  }

  /**
   * Duplicate active layer.
   */
  duplicateLayer() {
    const current = this.getActiveLayer();
    if (!current) return;

    const copy = current.clone(`${current.name} Copy`);
    const insertIdx = this.activeLayerIndex + 1;
    this.layers.splice(insertIdx, 0, copy);
    this.activeLayerIndex = insertIdx;

    this.render();
    this.emit('layerChange');
  }

  /**
   * Delete layer at specified index.
   */
  deleteLayer(index = this.activeLayerIndex) {
    if (this.layers.length <= 1) {
      // Don't delete the only remaining layer, just clear it
      this.layers[0].clear();
      this.render();
      this.emit('layerChange');
      return;
    }

    this.layers.splice(index, 1);
    if (this.activeLayerIndex >= this.layers.length) {
      this.activeLayerIndex = this.layers.length - 1;
    }

    this.render();
    this.emit('layerChange');
  }

  /**
   * Move layer up/down in hierarchy.
   */
  reorderLayer(fromIndex, toIndex) {
    if (toIndex < 0 || toIndex >= this.layers.length || fromIndex === toIndex) return;
    const [moved] = this.layers.splice(fromIndex, 1);
    this.layers.splice(toIndex, 0, moved);
    this.activeLayerIndex = toIndex;

    this.render();
    this.emit('layerChange');
  }

  /**
   * Merge active layer down into the layer beneath it.
   */
  mergeDown() {
    if (this.activeLayerIndex <= 0) return; // Cannot merge bottom layer down

    const topLayer = this.layers[this.activeLayerIndex];
    const bottomLayer = this.layers[this.activeLayerIndex - 1];

    topLayer.renderTo(bottomLayer.ctx);

    this.deleteLayer(this.activeLayerIndex);
    this.activeLayerIndex = this.activeLayerIndex - 1;

    this.render();
    this.emit('layerChange');
  }

  cropTo(rect) {
    const x = Math.max(0, Math.floor(rect.x));
    const y = Math.max(0, Math.floor(rect.y));
    const right = Math.min(this.width, Math.ceil(rect.x + rect.width));
    const bottom = Math.min(this.height, Math.ceil(rect.y + rect.height));
    const width = right - x;
    const height = bottom - y;
    if (width < 2 || height < 2) return false;
    for (const layer of this.layers) {
      const source = document.createElement('canvas');
      source.width = layer.width; source.height = layer.height;
      source.getContext('2d').drawImage(layer.canvas, 0, 0);
      layer.width = width; layer.height = height;
      layer.canvas.width = width; layer.canvas.height = height;
      layer.ctx = layer.canvas.getContext('2d', { willReadFrequently: true });
      layer.ctx.drawImage(source, x - layer.x, y - layer.y, width, height, 0, 0, width, height);
      if (layer.mask) { const m = document.createElement('canvas'); m.width = width; m.height = height; m.getContext('2d', { willReadFrequently: true }).drawImage(layer.mask, x - layer.x, y - layer.y, width, height, 0, 0, width, height); layer.mask = m; }
      layer.x = 0; layer.y = 0;
    }
    this.width = width; this.height = height;
    this.displayCanvas.width = width; this.displayCanvas.height = height;
    this.selectionMgr?.clear();
    this.centerAndFitViewport(); this.render(); this.emit('layerChange');
    return true;
  }

  /**
   * Composites all visible layers onto the display canvas.
   */
  render() {
    this.displayCtx.clearRect(0, 0, this.width, this.height);

    for (let i = 0; i < this.layers.length; i++) {
      this.layers[i].renderTo(this.displayCtx);
    }

    this.emit('render');
  }

  /**
   * Viewport transformation: center canvas in viewport and fit to view.
   */
  centerAndFitViewport() {
    const vpRect = this.viewport.getBoundingClientRect();
    if (vpRect.width < 10 || vpRect.height < 10) {
      // Layout not ready yet (e.g. first paint inside the embedded frame); retry next frame.
      requestAnimationFrame(() => this.centerAndFitViewport());
      return;
    }
    const margin = 40;
    const availW = vpRect.width - margin * 2;
    const availH = vpRect.height - margin * 2;

    const scaleX = availW / this.width;
    const scaleY = availH / this.height;
    let fitZoom = Math.min(scaleX, scaleY);
    if (fitZoom > 1) fitZoom = 1; // Don't upscale past 100% on initial load

    this.zoom = fitZoom;
    this.panX = (vpRect.width - this.width * this.zoom) / 2;
    this.panY = (vpRect.height - this.height * this.zoom) / 2;

    this.updateStageTransform();
  }

  /**
   * Set exact zoom factor.
   */
  setZoom(newZoom, centerX, centerY) {
    const clampedZoom = Math.max(0.05, Math.min(10.0, newZoom));
    if (clampedZoom === this.zoom) return;

    const vpRect = this.viewport.getBoundingClientRect();
    const cx = centerX !== undefined ? centerX : vpRect.width / 2;
    const cy = centerY !== undefined ? centerY : vpRect.height / 2;

    // Zoom towards cursor / center
    const docX = (cx - this.panX) / this.zoom;
    const docY = (cy - this.panY) / this.zoom;

    this.zoom = clampedZoom;
    this.panX = cx - docX * this.zoom;
    this.panY = cy - docY * this.zoom;

    this.updateStageTransform();
  }

  /**
   * Apply CSS transform to canvas stage.
   */
  updateStageTransform() {
    this.stage.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.zoom})`;
    this.emit('viewportChange', { zoom: this.zoom, panX: this.panX, panY: this.panY });
  }

  /**
   * Convert viewport screen client coordinates (clientX, clientY) to document canvas coordinates.
   */
  screenToDoc(clientX, clientY) {
    const vpRect = this.viewport.getBoundingClientRect();
    const screenX = clientX - vpRect.left;
    const screenY = clientY - vpRect.top;

    const docX = (screenX - this.panX) / this.zoom;
    const docY = (screenY - this.panY) / this.zoom;

    return {
      x: Math.round(docX),
      y: Math.round(docY),
      inside: docX >= 0 && docX < this.width && docY >= 0 && docY < this.height
    };
  }

  /**
   * Load an image (URL or blob) into the document.
   */
  async loadFromImage(src, name = 'Imported Image') {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        this.width = img.naturalWidth || img.width;
        this.height = img.naturalHeight || img.height;
        this.docName = name;

        this.displayCanvas.width = this.width;
        this.displayCanvas.height = this.height;

        this.layers = [];
        const baseLayer = new Layer('Background', this.width, this.height);
        baseLayer.ctx.drawImage(img, 0, 0);
        this.layers.push(baseLayer);
        this.activeLayerIndex = 0;
        this.selectionMgr?.clear();

        this.centerAndFitViewport();
        this.render();
        this.emit('layerChange');
        resolve();
      };
      img.onerror = reject;
      img.src = src;
    });
  }

  /**
   * Export composited canvas as PNG data URL or Blob.
   */
  exportPNG() {
    this.render();
    return this.displayCanvas.toDataURL('image/png');
  }

  /**
   * Export composited canvas as JPG data URL.
   */
  exportJPG(quality = 0.92) {
    // Flatten with white background for JPEG
    const flatCanvas = document.createElement('canvas');
    flatCanvas.width = this.width;
    flatCanvas.height = this.height;
    const flatCtx = flatCanvas.getContext('2d');
    flatCtx.fillStyle = '#ffffff';
    flatCtx.fillRect(0, 0, this.width, this.height);
    flatCtx.drawImage(this.displayCanvas, 0, 0);
    return flatCanvas.toDataURL('image/jpeg', quality);
  }

  /**
   * Save complete document to JSON project format.
   */
  toJSON() {
    return {
      version: '1.0',
      type: 'photoearnai-project',
      name: this.docName,
      width: this.width,
      height: this.height,
      layers: this.layers.map(l => l.toJSON())
    };
  }

  /**
   * Restore document from JSON project file.
   */
  async loadFromJSON(json) {
    this.docName = json.name || 'Untitled.psd';
    this.width = json.width;
    this.height = json.height;
    this.displayCanvas.width = this.width;
    this.displayCanvas.height = this.height;

    this.layers = [];
    for (const lJson of json.layers) {
      const layer = await Layer.fromJSON(lJson);
      this.layers.push(layer);
    }

    this.activeLayerIndex = Math.max(0, this.layers.length - 1);
    this.selectionMgr?.clear();
    this.centerAndFitViewport();
    this.render();
    this.emit('layerChange');
  }
}

window.CanvasEngine = CanvasEngine;

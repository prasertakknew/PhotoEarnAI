/* PhotoEarnAI PSD adapter (ag-psd).
 * ag-psd is vendored under vendor/ag-psd/ and loaded on demand from this site,
 * so opening/saving PSD never depends on a CDN (the old esm.sh import failed). */
class PsdWasmAdapter {
  constructor(engine) { this.engine = engine; this.module = null; this.loading = null; }

  async load() {
    if (this.module) return this.module;
    if (window.agPsd) { this.module = window.agPsd; return this.module; }
    if (!this.loading) {
      this.loading = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = new URL('vendor/ag-psd/ag-psd.js', document.baseURI).href;
        script.onload = () => window.agPsd ? resolve(window.agPsd) : reject(new Error('PSD library did not start'));
        script.onerror = () => reject(new Error('Could not load the PSD library. Check your internet connection and try again.'));
        document.head.appendChild(script);
      }).then(m => { this.module = m; return m; }).catch(err => { this.loading = null; throw err; });
    }
    return this.loading;
  }

  static rgbToHex(c) {
    if (!c) return '#000000';
    const v = (n) => Math.max(0, Math.min(255, Math.round(n || 0))).toString(16).padStart(2, '0');
    return `#${v(c.r)}${v(c.g)}${v(c.b)}`;
  }
  static hexToRgb(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    const n = m ? parseInt(m[1], 16) : 0;
    return { r: n >> 16, g: (n >> 8) & 255, b: n & 255 };
  }

  /** PSD masks are grayscale (white = shown); PhotoEarnAI masks use alpha. */
  static grayToAlphaMask(maskInfo, width, height) {
    const out = Layer.makeCanvas(width, height);
    const ctx = out.getContext('2d', { willReadFrequently: true });
    if ((maskInfo.defaultColor || 0) >= 128) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, width, height); }
    const src = maskInfo.canvas;
    if (src && src.width && src.height) {
      const tmp = Layer.makeCanvas(src.width, src.height);
      const tctx = tmp.getContext('2d', { willReadFrequently: true });
      tctx.drawImage(src, 0, 0);
      const img = tctx.getImageData(0, 0, src.width, src.height);
      const d = img.data;
      for (let i = 0; i < d.length; i += 4) { const g = d[i]; d[i] = 255; d[i + 1] = 255; d[i + 2] = 255; d[i + 3] = g; }
      tctx.putImageData(img, 0, 0);
      ctx.clearRect(maskInfo.left || 0, maskInfo.top || 0, src.width, src.height);
      ctx.drawImage(tmp, maskInfo.left || 0, maskInfo.top || 0);
    }
    return out;
  }

  static alphaToGrayMask(mask) {
    const out = Layer.makeCanvas(mask.width, mask.height);
    const ctx = out.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(mask, 0, 0);
    const img = ctx.getImageData(0, 0, mask.width, mask.height);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) { const a = d[i + 3]; d[i] = a; d[i + 1] = a; d[i + 2] = a; d[i + 3] = 255; }
    ctx.putImageData(img, 0, 0);
    return out;
  }

  async parse(file) {
    const m = await this.load();
    const buffer = await file.arrayBuffer();
    const psd = m.readPsd(buffer, { useImageData: false, skipThumbnail: true });
    const W = psd.width, H = psd.height;
    const e = this.engine;
    e.newDocument(file.name || 'Imported.psd', W, H, 'transparent');
    e.docName = file.name || 'Imported.psd';
    const res = psd.imageResources?.resolutionInfo;
    e.dpi = res?.horizontalResolution ? Math.round(res.horizontalResolution) : 72;
    e.layers = [];
    let count = 0;
    // ag-psd lists layers bottom → top, the same order as engine.layers.
    const add = (items, prefix = '') => (items || []).forEach(node => {
      if (Array.isArray(node.children)) { add(node.children, `${prefix}${node.name || 'Group'} / `); return; }
      const layer = new Layer(`${prefix}${node.name || 'Layer'}`, W, H);
      layer.opacity = typeof node.opacity === 'number' ? node.opacity : 1;
      layer.visible = !node.hidden;
      layer.blendMode = PsdWasmAdapter.toCanvasBlend(node.blendMode);
      const src = node.canvas;
      if (src && src.width && src.height) layer.ctx.drawImage(src, node.left || 0, node.top || 0);
      if (node.mask && node.mask.canvas) {
        layer.mask = PsdWasmAdapter.grayToAlphaMask(node.mask, W, H);
        layer.maskEnabled = !node.mask.disabled;
      }
      const t = node.text;
      if (t && typeof t.text === 'string') {
        const style = t.style || {};
        const size = Math.round((style.fontSize || 24) * (t.transform ? Math.abs(t.transform[3] || 1) : 1));
        layer.textData = {
          content: t.text.replace(/\r/g, '\n'),
          x: Math.round(t.transform?.[4] ?? node.left ?? 0),
          y: Math.round((t.transform?.[5] ?? (node.top || 0) + size) - size * 0.8),
          font: PsdWasmAdapter.cssFont(style.font?.name),
          size,
          color: PsdWasmAdapter.rgbToHex(style.fillColor),
          weight: style.fauxBold || /bold|black|heavy/i.test(style.font?.name || '') ? 700 : 400,
        };
      }
      e.layers.push(layer);
      count++;
    });
    add(psd.children);
    if (!e.layers.length) {
      // Flat PSD with only a composite image.
      const layer = new Layer('Background', W, H);
      if (psd.canvas) layer.ctx.drawImage(psd.canvas, 0, 0);
      e.layers.push(layer);
      count = 1;
    }
    e.activeLayerIndex = e.layers.length - 1;
    e.render();
    e.emit('layerChange');
    return { layers: e.layers, parsedLayerCount: count };
  }

  static cssFont(psName = '') {
    const n = psName.toLowerCase();
    if (n.includes('georgia')) return 'Georgia, serif';
    if (n.includes('times')) return "'Times New Roman', serif";
    if (n.includes('impact')) return 'Impact, sans-serif';
    if (n.includes('courier')) return "'Courier New', monospace";
    if (n.includes('segoe')) return "'Segoe UI', sans-serif";
    return 'Arial, sans-serif';
  }
  static psFont(css = '') {
    const n = css.toLowerCase();
    if (n.includes('georgia')) return 'Georgia';
    if (n.includes('times')) return 'TimesNewRomanPSMT';
    if (n.includes('impact')) return 'Impact';
    if (n.includes('courier')) return 'CourierNewPSMT';
    if (n.includes('segoe')) return 'SegoeUI';
    return 'ArialMT';
  }

  /** Build the PSD bytes for the current document. */
  async build() {
    const m = await this.load();
    const e = this.engine;
    e.render();
    const composite = Layer.makeCanvas(e.width, e.height);
    composite.getContext('2d').drawImage(e.displayCanvas, 0, 0);
    const dpi = e.dpi || 72;
    const psd = {
      width: e.width, height: e.height, canvas: composite, children: [],
      imageResources: { resolutionInfo: { horizontalResolution: dpi, horizontalResolutionUnit: 'PPI', widthUnit: 'Inches', verticalResolution: dpi, verticalResolutionUnit: 'PPI', heightUnit: 'Inches' } },
    };
    for (const layer of e.layers) {
      if (layer.group || layer.adjustment) continue;
      const node = {
        name: layer.name, left: layer.x, top: layer.y, opacity: layer.opacity, hidden: !layer.visible,
        blendMode: PsdWasmAdapter.fromCanvasBlend(layer.blendMode), canvas: layer.canvas,
      };
      if (layer.mask) node.mask = { canvas: PsdWasmAdapter.alphaToGrayMask(layer.mask), left: layer.x, top: layer.y, right: layer.x + layer.width, bottom: layer.y + layer.height, defaultColor: 0, disabled: !layer.maskEnabled };
      const t = layer.textData;
      if (t && t.content) {
        const size = t.size || 48;
        const lines = String(t.content).split('\n');
        const ctx = layer.ctx; ctx.save(); ctx.font = `${t.style || ''} ${t.weight || 700} ${size}px ${t.font || 'Arial'}`;
        const w = Math.max(...lines.map(l => ctx.measureText(l).width)); ctx.restore();
        const ax = t.align === 'center' ? (t.x || 0) - w / 2 : t.align === 'right' ? (t.x || 0) - w : (t.x || 0);
        node.text = {
          text: lines.join('\r'),
          transform: [1, 0, 0, 1, layer.x + ax, layer.y + (t.y || 0) + size * 0.8],
          style: { font: { name: PsdWasmAdapter.psFont(t.font) }, fontSize: size, fillColor: PsdWasmAdapter.hexToRgb(t.color), fauxBold: (t.weight || 400) >= 700 },
          paragraphStyle: { justification: t.align === 'center' ? 'center' : t.align === 'right' ? 'right' : 'left' },
        };
      }
      psd.children.push(node);
    }
    let bytes;
    try { bytes = m.writePsd(psd, { compress: true }); }
    catch (err) {
      // Fall back to plain pixel layers if any text/mask detail cannot be written.
      console.warn('PSD extras failed, writing pixel layers only', err);
      psd.children.forEach(n => { delete n.text; });
      bytes = m.writePsd(psd, { compress: true });
    }
    return { bytes, layers: psd.children.length };
  }

  async export(name = 'PhotoEarnAI.psd') {
    const { bytes, layers } = await this.build();
    const blob = new Blob([bytes], { type: 'image/vnd.adobe.photoshop' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    return { bytes: bytes.byteLength, layers, filename: name };
  }

  static toCanvasBlend(mode) { return ({ normal: 'source-over', multiply: 'multiply', screen: 'screen', overlay: 'overlay', darken: 'darken', lighten: 'lighten', 'color dodge': 'color-dodge', colorDodge: 'color-dodge', difference: 'difference', exclusion: 'exclusion' })[mode] || 'source-over'; }
  static fromCanvasBlend(mode) { return ({ 'source-over': 'normal', multiply: 'multiply', screen: 'screen', overlay: 'overlay', darken: 'darken', lighten: 'lighten', 'color-dodge': 'color dodge', difference: 'difference', exclusion: 'exclusion' })[mode] || 'normal'; }
}
window.PsdWasmAdapter = PsdWasmAdapter;

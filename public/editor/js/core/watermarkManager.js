class WatermarkManager {
  static async place(engine, history, registry, file, options = {}) {
    if (!file) throw new Error('Choose a logo or watermark file first');
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Could not read watermark file'));
      reader.readAsDataURL(file);
    });
    const image = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Watermark is not a supported image'));
      img.src = dataUrl;
    });
    // Undo steps record the state *before* the change.
    history.captureSnapshot('Place watermark');
    const layer = engine.addLayer(options.name || `Watermark · ${file.name}`);
    const scale = Math.max(0.05, Math.min(4, Number(options.scale) || 0.35));
    const opacity = Math.max(0.05, Math.min(1, Number(options.opacity) || 0.55));
    const drawWidth = Math.max(1, Math.round(image.naturalWidth * scale));
    const drawHeight = Math.max(1, Math.round(image.naturalHeight * scale));
    const x = Math.round(Number(options.x) || 24);
    const y = Math.round(Number(options.y) || 24);
    layer.opacity = opacity;
    layer.watermarkData = { fileName: file.name, scale, opacity, x, y, tiled: Boolean(options.tiled) };
    layer.ctx.save();
    layer.ctx.globalAlpha = 1;
    if (options.tiled) {
      for (let tileY = y; tileY < engine.height; tileY += drawHeight + 48) {
        for (let tileX = x; tileX < engine.width; tileX += drawWidth + 48) layer.ctx.drawImage(image, tileX, tileY, drawWidth, drawHeight);
      }
    } else {
      layer.ctx.drawImage(image, x, y, drawWidth, drawHeight);
    }
    layer.ctx.restore();
    registry.add('watermarks', { name: layer.name, fileName: file.name, scale, opacity, x, y, tiled: Boolean(options.tiled) });
    engine.render();
    engine.emit('layerChange');
    return layer;
  }
}
window.WatermarkManager = WatermarkManager;

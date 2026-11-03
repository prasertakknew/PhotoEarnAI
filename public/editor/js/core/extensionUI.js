document.addEventListener('DOMContentLoaded', () => {
  const engine = window.photoearnai?.engine;
  const history = window.photoearnai?.history;
  const tools = window.photoearnai?.tools;
  if (!engine || !history || !tools) return;

  const registry = new ExtensionRegistry();
  ProjectManager.attach(engine, registry);
  PhotoEarnI18n.init();

  const studio = document.getElementById('modal-studio');
  const openStudio = () => studio?.classList.add('open');
  const closeStudio = () => studio?.classList.remove('open');
  const toast = (message, tone = 'info') => {
    const node = document.createElement('div');
    node.className = `studio-toast studio-toast-${tone}`;
    node.textContent = message;
    document.body.appendChild(node);
    requestAnimationFrame(() => node.classList.add('show'));
    setTimeout(() => { node.classList.remove('show'); setTimeout(() => node.remove(), 220); }, 2600);
  };
  const activeLayer = () => engine.getActiveLayer();
  const safe = (value, fallback = '') => String(value ?? fallback).trim().slice(0, 160);

  document.getElementById('menu-open-studio')?.addEventListener('click', openStudio);
  document.getElementById('menu-watermark')?.addEventListener('click', () => { openStudio(); selectStudioTab('watermark'); });
  document.getElementById('menu-edit-text')?.addEventListener('click', () => { openStudio(); selectStudioTab('text'); syncTextForm(); });
  document.getElementById('studio-open')?.addEventListener('click', openStudio);

  function selectStudioTab(tab) {
    document.querySelectorAll('[data-studio-tab]').forEach((button) => button.classList.toggle('active', button.dataset.studioTab === tab));
    document.querySelectorAll('[data-studio-pane]').forEach((pane) => pane.classList.toggle('active', pane.dataset.studioPane === tab));
  }
  document.querySelectorAll('[data-studio-tab]').forEach((button) => button.addEventListener('click', () => selectStudioTab(button.dataset.studioTab)));
  document.querySelectorAll('.modal-close-btn, .modal-cancel-btn').forEach((button) => button.addEventListener('click', closeStudio));

  function renderTextLayer(layer) {
    if (!layer?.textData) return;
    const text = layer.textData;
    const size = text.size || 48;
    layer.ctx.clearRect(0, 0, layer.width, layer.height);
    layer.ctx.save();
    layer.ctx.fillStyle = text.color || '#ffffff';
    layer.ctx.font = `${text.style || ''} ${text.weight || 700} ${size}px ${text.font || 'Arial, sans-serif'}`.trim();
    layer.ctx.textBaseline = 'top';
    layer.ctx.textAlign = text.align || 'left';
    String(text.content || 'Text').split('\n').forEach((line, i) => layer.ctx.fillText(line, text.x || 0, (text.y || 0) + i * size * 1.2));
    layer.ctx.restore();
  }
  Object.assign(window.photoearnai, { renderTextLayer });

  function syncTextForm() {
    const layer = activeLayer();
    const text = layer?.textData;
    const content = document.getElementById('studio-text-content');
    if (content) content.value = text?.content || '';
    if (text) {
      document.getElementById('studio-text-font').value = text.font || 'Arial, sans-serif';
      document.getElementById('studio-text-size').value = text.size || 48;
      document.getElementById('studio-text-color').value = text.color || '#ffffff';
      document.getElementById('studio-text-weight').value = String(text.weight || 700);
    }
  }
  engine.on('layerChange', syncTextForm);

  const originalAddTextAt = ToolManager.prototype.addTextAt;
  ToolManager.prototype.addTextAt = function addPhotoEarnText(x, y) {
    const content = prompt(PhotoEarnI18n.translate('Text') + ':');
    if (!content) return;
    // Undo steps record the state *before* the change.
    this.history.captureSnapshot('Add editable text');
    const layer = this.engine.addLayer(`Text · ${content.slice(0, 24)}`);
    layer.textData = { content: safe(content), x, y, font: this.textFont || 'Arial, sans-serif', size: this.textSize || 48, color: this.engine.foregroundColor || '#ffffff', weight: 700 };
    renderTextLayer(layer);
    this.engine.render();
    this.engine.emit('layerChange');
  };
  // Keep a reference for debugging and clean-room traceability without invoking the old prompt path.
  window.photoearnaiOriginalAddTextAt = originalAddTextAt;

  document.getElementById('studio-apply-text')?.addEventListener('click', () => {
    const layer = activeLayer();
    if (!layer?.textData) { toast(PhotoEarnI18n.language === 'th' ? 'เลือกเลเยอร์ข้อความก่อน' : 'Select a text layer first', 'warn'); return; }
    history.captureSnapshot('Edit text layer');
    layer.textData = { ...layer.textData, content: safe(document.getElementById('studio-text-content').value, 'Text'), font: document.getElementById('studio-text-font').value, size: Math.max(8, Math.min(200, Number(document.getElementById('studio-text-size').value) || 48)), color: document.getElementById('studio-text-color').value, weight: Number(document.getElementById('studio-text-weight').value) || 700 };
    renderTextLayer(layer);
    engine.render();
    engine.emit('layerChange');
    toast(PhotoEarnI18n.language === 'th' ? 'แก้ไขข้อความแล้ว' : 'Text layer updated', 'success');
  });

  const applyOperation = (operation, layer = activeLayer()) => {
    if (!layer) throw new Error('No active layer');
    switch (operation) {
      case 'brightness': FilterEngine.applyBrightnessContrast(layer, 16, 8); break;
      case 'invert': FilterEngine.applyInvert(layer); break;
      case 'grayscale': FilterEngine.applyGrayscale(layer); break;
      case 'sepia': FilterEngine.applySepia(layer); break;
      case 'vignette': FilterEngine.applyVignette(layer); break;
      default: throw new Error('Unsupported filter operation');
    }
    engine.render();
    engine.emit('layerChange');
  };

  function renderRecords(type, targetId, actionLabel, action) {
    const target = document.getElementById(targetId);
    if (!target) return;
    target.innerHTML = '';
    registry.list(type).forEach((record) => {
      const item = document.createElement('div');
      item.className = 'studio-record';
      item.innerHTML = `<div><strong>${record.name}</strong><small>${record.description || record.category || record.fileName || record.operation || ''}</small></div>`;
      const button = document.createElement('button');
      button.className = 'opt-btn';
      button.textContent = actionLabel;
      button.addEventListener('click', () => action(record));
      item.appendChild(button);
      target.appendChild(item);
    });
  }

  function addToolButton(record) {
    if (document.querySelector(`[data-custom-tool="${record.id}"]`)) return;
    const button = document.createElement('button');
    button.className = 'tool-btn custom-tool-btn';
    button.dataset.customTool = record.id;
    button.title = `${record.name}${record.shortcut ? ` (${record.shortcut})` : ''}`;
    button.textContent = '✦';
    button.addEventListener('click', () => {
      if (record.action === 'focus-studio') openStudio();
      else if (record.action === 'paint-accent') { tools.setTool('brush'); toast(`${record.name}: ${PhotoEarnI18n.language === 'th' ? 'เลือกแปรงแล้ว' : 'Brush selected'}`); }
      else if (record.action === 'add-watermark') { openStudio(); selectStudioTab('watermark'); }
    });
    document.getElementById('tool-palette')?.appendChild(button);
  }

  document.getElementById('studio-add-tool')?.addEventListener('click', () => {
    try {
      const record = registry.add('tools', { name: safe(document.getElementById('studio-tool-name').value, 'Custom tool'), shortcut: safe(document.getElementById('studio-tool-shortcut').value), description: safe(document.getElementById('studio-tool-description').value, 'User-created PhotoEarnAI tool'), action: document.getElementById('studio-tool-action').value });
      addToolButton(record); renderAll(); toast(PhotoEarnI18n.language === 'th' ? 'เพิ่มเครื่องมือแล้ว' : 'Tool added', 'success');
    } catch (error) { toast(error.message, 'warn'); }
  });

  document.getElementById('studio-add-filter')?.addEventListener('click', () => {
    try { registry.add('filters', { name: safe(document.getElementById('studio-filter-name').value, 'Custom filter'), operation: document.getElementById('studio-filter-operation').value }); renderAll(); toast(PhotoEarnI18n.language === 'th' ? 'เพิ่มฟิลเตอร์แล้ว' : 'Filter added', 'success'); }
    catch (error) { toast(error.message, 'warn'); }
  });
  document.getElementById('studio-add-preset')?.addEventListener('click', () => {
    try { registry.add('presets', { name: safe(document.getElementById('studio-preset-name').value, 'Custom preset'), category: safe(document.getElementById('studio-preset-category').value, 'My presets'), operation: document.getElementById('studio-preset-filter').value }); renderAll(); toast(PhotoEarnI18n.language === 'th' ? 'เพิ่มพรีเซ็ตแล้ว' : 'Preset added', 'success'); }
    catch (error) { toast(error.message, 'warn'); }
  });

  document.getElementById('studio-plugin-file')?.addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const source = await file.text();
      const moduleUrl = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
      const module = await import(moduleUrl);
      URL.revokeObjectURL(moduleUrl);
      const record = registry.add('plugins', { name: safe(module.name || file.name.replace(/\.[^.]+$/, ''), file.name), fileName: file.name, capability: safe(module.capability, 'Local module'), localOnly: true });
      if (typeof module.activate === 'function') await module.activate({ engine, history, registry, toast });
      renderAll(); toast(`${record.name} · ${PhotoEarnI18n.translate('Local-only')}`, 'success');
    } catch (error) { toast(`Plug-in: ${error.message}`, 'warn'); }
    event.target.value = '';
  });

  document.getElementById('studio-font-file')?.addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const family = safe(file.name.replace(/\.(woff2?|ttf|otf)$/i, ''), 'PhotoEarnAI Font');
      const face = new FontFace(family, await file.arrayBuffer());
      await face.load();
      document.fonts.add(face);
      registry.add('fonts', { name: family, family, fileName: file.name, sessionOnly: true });
      [document.getElementById('opt-text-font'), document.getElementById('studio-text-font')].forEach((select) => {
        if (select && !Array.from(select.options).some((option) => option.value === family)) { const option = document.createElement('option'); option.value = family; option.textContent = family; select.appendChild(option); }
      });
      renderAll(); toast(`${family} loaded`, 'success');
    } catch (error) { toast(`Font: ${error.message}`, 'warn'); }
    event.target.value = '';
  });

  document.getElementById('studio-place-watermark')?.addEventListener('click', async () => {
    try {
      const file = document.getElementById('studio-watermark-file').files?.[0];
      await WatermarkManager.place(engine, history, registry, file, { scale: document.getElementById('studio-watermark-scale').value, opacity: document.getElementById('studio-watermark-opacity').value, x: document.getElementById('studio-watermark-x').value, y: document.getElementById('studio-watermark-y').value, tiled: document.getElementById('studio-watermark-tiled').checked });
      renderAll(); toast(PhotoEarnI18n.language === 'th' ? 'วางลายน้ำแล้ว' : 'Watermark placed', 'success');
    } catch (error) { toast(error.message, 'warn'); }
  });

  function renderAll() {
    renderRecords('tools', 'studio-tools-list', 'Use', (record) => { if (record.action === 'focus-studio') openStudio(); else if (record.action === 'paint-accent') tools.setTool('brush'); else { openStudio(); selectStudioTab('watermark'); } });
    renderRecords('presets', 'studio-presets-list', 'Apply', (record) => { try { history.captureSnapshot(`Preset: ${record.name}`); if (record.operation !== 'none') applyOperation(record.operation); toast(`${record.name} applied`, 'success'); } catch (error) { toast(error.message, 'warn'); } });
    renderRecords('filters', 'studio-filters-list', 'Apply', (record) => { try { history.captureSnapshot(`Filter: ${record.name}`); applyOperation(record.operation); toast(`${record.name} applied`, 'success'); } catch (error) { toast(error.message, 'warn'); } });
    renderRecords('plugins', 'studio-plugins-list', 'Info', (record) => toast(`${record.name} · ${record.capability}`, 'info'));
    renderRecords('fonts', 'studio-fonts-list', 'Loaded', (record) => toast(`${record.name} · ${PhotoEarnI18n.translate('Local-only')}`, 'info'));
    renderRecords('watermarks', 'studio-watermarks-list', 'Info', (record) => toast(`${record.name} · ${record.fileName}`, 'info'));
    registry.list('tools').forEach(addToolButton);
  }

  window.photoearnai = Object.assign(window.photoearnai || {}, { engine, history, tools, registry, openStudio, selectStudioTab, renderTextLayer });
  renderAll();
  window.addEventListener('photoearnai:language', () => renderAll());
});

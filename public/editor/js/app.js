/**
 * Application Entry Point - Photopea Clean-Room Reconstruction
 * Coordinates UI components, modals, shortcuts, and engine synchronization.
 */
document.addEventListener('DOMContentLoaded', () => {
  const canvasEl = document.getElementById('main-canvas');
  const stageEl = document.getElementById('canvas-stage');
  const viewportEl = document.getElementById('canvas-viewport');
  const historyListEl = document.getElementById('history-list');

  // Initialize Core Subsystems
  const engine = new CanvasEngine(canvasEl, stageEl, viewportEl);
  const history = new HistoryManager(engine, historyListEl);
  const tools = new ToolManager(engine, history);
  tools.setTool('move');

  // Global references for debugging & inspection
  window.photoearnai = { engine, history, tools, virtualModifiers: { ctrl: false, alt: false, shift: false } };

  // =========================================================================
  // Initialize Default Document with Sample Artwork
  // =========================================================================
  async function loadInitialDemo() {
    history.clear();
    engine.newDocument('neon_camera.psd', 1024, 1024, 'black');

    try {
      // Load sample image onto Background layer
      const sampleImg = new Image();
      sampleImg.src = 'assets/sample.jpg';
      await new Promise((res, rej) => {
        sampleImg.onload = res;
        sampleImg.onerror = rej;
      });

      const bgLayer = engine.layers[0];
      bgLayer.name = 'Neon Cyber-Camera';
      bgLayer.ctx.drawImage(sampleImg, 0, 0, engine.width, engine.height);

      // Create an accent Overlay glow layer
      const glowLayer = engine.addLayer('Cyan Lens Flare');
      glowLayer.blendMode = 'screen';
      glowLayer.opacity = 0.85;

      const gCtx = glowLayer.ctx;
      const grad = gCtx.createRadialGradient(420, 520, 10, 420, 520, 260);
      grad.addColorStop(0, 'rgba(6, 182, 212, 0.9)');
      grad.addColorStop(0.5, 'rgba(59, 130, 246, 0.4)');
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      gCtx.fillStyle = grad;
      gCtx.beginPath();
      gCtx.arc(420, 520, 260, 0, Math.PI * 2);
      gCtx.fill();

      // Create a Text Layer
      const textLayer = engine.addLayer('Cyber Title');
      textLayer.ctx.fillStyle = '#ffffff';
      textLayer.ctx.font = 'bold 36px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
      textLayer.ctx.shadowColor = '#06b6d4';
      textLayer.ctx.shadowBlur = 15;
      textLayer.ctx.fillText('NEON-OPTICS X-77', 60, 100);

      engine.setActiveLayer(engine.layers.length - 1);
      engine.render();
      history.captureSnapshot('Load Demo Project');
    } catch (err) {
      console.warn('Could not load sample image asset, starting blank:', err);
      history.captureSnapshot('New Document');
    }

    updateDocMetaDisplay();
  }

  loadInitialDemo();

  // =========================================================================
  // Document Metadata Display
  // =========================================================================
  function updateDocMetaDisplay() {
    const titleEl = document.getElementById('doc-title-display');
    const metaEl = document.getElementById('doc-meta-display');
    const dimsEl = document.getElementById('status-dims');
    const infoW = document.getElementById('info-doc-w');
    const infoH = document.getElementById('info-doc-h');
    const infoLayers = document.getElementById('info-layer-count');
    const zoomBadge = document.getElementById('zoom-badge');

    if (titleEl) titleEl.textContent = engine.docName;
    const metaStr = `${engine.width} × ${engine.height} px @ ${Math.round(engine.zoom * 100)}%`;
    if (metaEl) metaEl.textContent = metaStr;
    if (dimsEl) dimsEl.textContent = `${engine.width} × ${engine.height} px`;
    if (infoW) infoW.textContent = engine.width;
    if (infoH) infoH.textContent = engine.height;
    if (infoLayers) infoLayers.textContent = engine.layers.length;
    if (zoomBadge) zoomBadge.textContent = `${Math.round(engine.zoom * 100)}%`;
  }

  engine.on('viewportChange', () => updateDocMetaDisplay());

  // =========================================================================
  // Layer Palette Synchronization
  // =========================================================================
  const layersListEl = document.getElementById('layers-list');
  const blendSelectEl = document.getElementById('layer-blend-mode');
  const opacityInputEl = document.getElementById('layer-opacity-input');

  function renderLayersPanel() {
    if (!layersListEl) return;
    layersListEl.innerHTML = '';

    const activeLayer = engine.getActiveLayer();

    if (activeLayer) {
      if (blendSelectEl) blendSelectEl.value = activeLayer.blendMode;
      if (opacityInputEl) opacityInputEl.value = Math.round(activeLayer.opacity * 100);
    }

    // Render layers in reverse order (top layer at top of UI list)
    for (let i = engine.layers.length - 1; i >= 0; i--) {
      const layer = engine.layers[i];
      const isSelected = (i === engine.activeLayerIndex);

      const layerIdx = i;
      const itemEl = document.createElement('div');
      itemEl.className = 'layer-item' + (isSelected ? ' active' : '');

      // Eye Visibility Toggle Button
      const visBtn = document.createElement('button');
      visBtn.className = 'layer-vis-btn' + (layer.visible ? ' visible' : '');
      visBtn.title = 'Toggle Visibility';
      visBtn.innerHTML = layer.visible 
        ? `<svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>`
        : `<svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.44-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27z"/></svg>`;
      
      visBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        layer.visible = !layer.visible;
        engine.render();
        renderLayersPanel();
      });

      // Thumbnail
      const thumbEl = document.createElement('div');
      thumbEl.className = 'layer-thumbnail' + (layer.mask && !layer.editingMask && isSelected ? ' target' : '');
      const thumbImg = document.createElement('img');
      thumbImg.src = layer.getThumbnail(32, 32);
      thumbImg.alt = '';
      thumbEl.appendChild(thumbImg);
      thumbEl.title = 'Edit pixels';
      thumbEl.addEventListener('click', (e) => { e.stopPropagation(); layer.editingMask = false; engine.setActiveLayer(layerIdx); });
      let maskThumbEl = null;
      if (layer.mask) {
        maskThumbEl = document.createElement('div');
        maskThumbEl.className = 'layer-thumbnail mask-thumb' + (layer.editingMask && isSelected ? ' target' : '') + (layer.maskEnabled ? '' : ' disabled');
        maskThumbEl.title = 'Layer mask · click to paint on the mask (white shows, black hides) · Shift+click to turn it off/on';
        const maskImg = document.createElement('img');
        maskImg.src = layer.getMaskThumbnail(32, 32);
        maskImg.alt = 'Layer mask';
        maskThumbEl.appendChild(maskImg);
        maskThumbEl.addEventListener('click', (e) => {
          e.stopPropagation();
          if (e.shiftKey) { history.captureSnapshot(layer.maskEnabled ? 'Disable Mask' : 'Enable Mask'); layer.maskEnabled = !layer.maskEnabled; engine.render(); }
          else layer.editingMask = true;
          engine.setActiveLayer(layerIdx);
        });
      }

      // Layer Title
      const titleEl = document.createElement('span');
      titleEl.className = 'layer-title';
      titleEl.textContent = layer.name;
      titleEl.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        const newName = prompt('Rename Layer:', layer.name);
        if (newName) {
          layer.name = newName;
          renderLayersPanel();
        }
      });

      itemEl.appendChild(visBtn);
      itemEl.appendChild(thumbEl);
      if (maskThumbEl) itemEl.appendChild(maskThumbEl);
      itemEl.appendChild(titleEl);

      itemEl.addEventListener('click', () => {
        engine.setActiveLayer(layerIdx);
      });

      layersListEl.appendChild(itemEl);
    }

    updateDocMetaDisplay();
  }

  engine.on('layerChange', renderLayersPanel);
  engine.on('render', () => {
    // Optionally update thumbnails
  });

  // Layer Toolbar inputs
  if (blendSelectEl) {
    blendSelectEl.addEventListener('change', (e) => {
      const active = engine.getActiveLayer();
      if (active) {
        active.blendMode = e.target.value;
        engine.render();
      }
    });
  }

  if (opacityInputEl) {
    opacityInputEl.addEventListener('input', (e) => {
      const active = engine.getActiveLayer();
      if (active) {
        active.opacity = Math.max(0, Math.min(100, parseInt(e.target.value, 10) || 100)) / 100;
        engine.render();
      }
    });
  }

  // Layer footer buttons
  document.getElementById('btn-layer-new')?.addEventListener('click', () => {
    history.captureSnapshot('New Layer');
    engine.addLayer();
  });

  document.getElementById('btn-layer-dup')?.addEventListener('click', () => {
    history.captureSnapshot('Duplicate Layer');
    engine.duplicateLayer();
  });

  document.getElementById('btn-layer-delete')?.addEventListener('click', () => {
    history.captureSnapshot('Delete Layer');
    engine.deleteLayer();
  });

  document.getElementById('btn-layer-up')?.addEventListener('click', () => {
    if (engine.activeLayerIndex < engine.layers.length - 1) {
      history.captureSnapshot('Move Layer Up');
      engine.reorderLayer(engine.activeLayerIndex, engine.activeLayerIndex + 1);
    }
  });

  document.getElementById('btn-layer-down')?.addEventListener('click', () => {
    if (engine.activeLayerIndex > 0) {
      history.captureSnapshot('Move Layer Down');
      engine.reorderLayer(engine.activeLayerIndex, engine.activeLayerIndex - 1);
    }
  });

  // =========================================================================
  // Dock Panels Tabs
  // =========================================================================
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.dock-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      const targetPanel = document.getElementById(`panel-${btn.dataset.tab}`);
      if (targetPanel) targetPanel.classList.add('active');
    });
  });

  // =========================================================================
  // Options Sub-Bar Controls
  // =========================================================================
  const brushSizeInput = document.getElementById('opt-brush-size');
  const brushSizeVal = document.getElementById('opt-brush-size-val');
  if (brushSizeInput) {
    brushSizeInput.addEventListener('input', (e) => {
      engine.brushSize = parseInt(e.target.value, 10);
      if (brushSizeVal) brushSizeVal.textContent = `${engine.brushSize}px`;
    });
  }

  const brushOpacityInput = document.getElementById('opt-brush-opacity');
  const brushOpacityVal = document.getElementById('opt-brush-opacity-val');
  if (brushOpacityInput) {
    brushOpacityInput.addEventListener('input', (e) => {
      engine.brushOpacity = parseInt(e.target.value, 10) / 100;
      if (brushOpacityVal) brushOpacityVal.textContent = `${e.target.value}%`;
    });
  }

  const brushHardnessInput = document.getElementById('opt-brush-hardness');
  const brushHardnessVal = document.getElementById('opt-brush-hardness-val');
  brushHardnessInput?.addEventListener('input', (e) => {
    engine.brushHardness = parseInt(e.target.value, 10) / 100;
    if (brushHardnessVal) brushHardnessVal.textContent = `${e.target.value}%`;
  });
  if (brushSizeInput) brushSizeInput.addEventListener('input', () => tools.refreshSourceMarker());

  document.getElementById('opt-shape-type')?.addEventListener('change', (e) => {
    tools.shapeType = e.target.value;
  });

  document.getElementById('opt-shape-stroke-width')?.addEventListener('input', (e) => {
    tools.shapeStrokeWidth = parseInt(e.target.value, 10) || 0;
  });

  document.getElementById('opt-shape-fill')?.addEventListener('change', (e) => {
    tools.shapeFill = e.target.checked;
  });

  document.getElementById('opt-crop-mode')?.addEventListener('change', (e) => { tools.cropMode = e.target.value; });
  document.getElementById('opt-crop-source')?.addEventListener('change', (e) => { tools.cropSource = e.target.value; });

  document.getElementById('btn-zoom-fit')?.addEventListener('click', () => engine.centerAndFitViewport());
  document.getElementById('btn-zoom-100')?.addEventListener('click', () => engine.setZoom(1.0));

  // =========================================================================
  // Tool Palette Selection
  // =========================================================================
  document.querySelectorAll('.tool-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      tools.setTool(btn.dataset.tool);
    });
  });

  // Color Swatches & Swapping
  const fgSwatch = document.getElementById('swatch-fg');
  const bgSwatch = document.getElementById('swatch-bg');
  const hiddenColorPicker = document.getElementById('hidden-color-picker');
  let activePickingSwatch = 'fg';

  fgSwatch?.addEventListener('click', () => {
    activePickingSwatch = 'fg';
    hiddenColorPicker.value = engine.foregroundColor;
    hiddenColorPicker.click();
  });

  bgSwatch?.addEventListener('click', () => {
    activePickingSwatch = 'bg';
    hiddenColorPicker.value = engine.backgroundColor;
    hiddenColorPicker.click();
  });

  hiddenColorPicker?.addEventListener('input', (e) => {
    const val = e.target.value;
    if (activePickingSwatch === 'fg') {
      engine.foregroundColor = val;
      fgSwatch.style.backgroundColor = val;
      const hexInput = document.getElementById('color-hex-input');
      if (hexInput) hexInput.value = val;
    } else {
      engine.backgroundColor = val;
      bgSwatch.style.backgroundColor = val;
    }
  });

  document.getElementById('btn-swap-colors')?.addEventListener('click', () => {
    const temp = engine.foregroundColor;
    engine.foregroundColor = engine.backgroundColor;
    engine.backgroundColor = temp;
    fgSwatch.style.backgroundColor = engine.foregroundColor;
    bgSwatch.style.backgroundColor = engine.backgroundColor;
  });

  document.getElementById('btn-reset-colors')?.addEventListener('click', () => {
    engine.foregroundColor = '#0e8aef';
    engine.backgroundColor = '#ffffff';
    fgSwatch.style.backgroundColor = engine.foregroundColor;
    bgSwatch.style.backgroundColor = engine.backgroundColor;
  });

  document.getElementById('btn-virtual-keys')?.addEventListener('click', () => {
    const popover = document.getElementById('virtual-keys-popover');
    if (popover) popover.hidden = !popover.hidden;
  });
  const syncVirtualKeys = () => {
    const state = window.photoearnai.virtualModifiers;
    document.querySelectorAll('[data-modifier]').forEach(button => button.classList.toggle('active', !!state[button.dataset.modifier]));
    const active = Object.keys(state).filter(name => state[name]);
    const status = document.querySelector('.virtual-keys-status');
    if (status) status.textContent = active.length ? `${active.map(name => name[0].toUpperCase() + name.slice(1)).join(' + ')} active · latched` : 'NoTouch';
  };
  document.querySelectorAll('[data-modifier]').forEach((button) => button.addEventListener('click', () => {
    const key = button.dataset.modifier;
    window.photoearnai.virtualModifiers[key] = !window.photoearnai.virtualModifiers[key];
    syncVirtualKeys();
  }));
  document.getElementById('btn-no-touch')?.addEventListener('click', () => {
    window.photoearnai.virtualModifiers = { ctrl: false, alt: false, shift: false };
    syncVirtualKeys();
  });
  const physicalKeys = { Control: 'ctrl', Alt: 'alt', Shift: 'shift' };
  window.photoearnai.syncVirtualKeys = syncVirtualKeys;
  // preventDefault on Alt stops the browser from opening its menu bar (Windows),
  // which used to swallow the Clone Stamp Alt+click.
  window.addEventListener('keydown', event => { const key = physicalKeys[event.key]; if (key) { if (key === 'alt') event.preventDefault(); window.photoearnai.virtualModifiers[key] = true; syncVirtualKeys(); } });
  window.addEventListener('keyup', event => { const key = physicalKeys[event.key]; if (key) { if (key === 'alt') event.preventDefault(); window.photoearnai.virtualModifiers[key] = false; syncVirtualKeys(); } });
  syncVirtualKeys();

  // Color Palette Grid Swatches
  document.querySelectorAll('.color-tile').forEach(tile => {
    tile.addEventListener('click', () => {
      const color = tile.dataset.color;
      engine.foregroundColor = color;
      if (fgSwatch) fgSwatch.style.backgroundColor = color;
      const hexInput = document.getElementById('color-hex-input');
      if (hexInput) hexInput.value = color;
    });
  });

  // =========================================================================
  // Top Menu System
  // =========================================================================
  document.querySelectorAll('.menu-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const parent = btn.closest('.menu-item');
      const wasOpen = parent.classList.contains('open');
      document.querySelectorAll('.menu-item').forEach(m => m.classList.remove('open'));
      if (!wasOpen) parent.classList.add('open');
    });
  });

  window.addEventListener('click', () => {
    document.querySelectorAll('.menu-item').forEach(m => m.classList.remove('open'));
  });

  // --- File Actions ---
  const fileInput = document.getElementById('file-input-image');

  document.getElementById('menu-new-doc')?.addEventListener('click', () => {
    openModal('modal-new-doc');
  });

  document.getElementById('menu-open-file')?.addEventListener('click', () => {
    fileInput.click();
  });

  document.getElementById('menu-load-sample')?.addEventListener('click', () => {
    loadInitialDemo();
  });

  document.getElementById('menu-save-json')?.addEventListener('click', () => {
    const jsonStr = JSON.stringify(engine.toJSON(), null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = engine.docName.replace(/\.[^/.]+$/, '') + '.json';
    a.click();
    URL.revokeObjectURL(url);
  });

  document.getElementById('menu-export-png')?.addEventListener('click', () => {
    const dataUrl = engine.exportPNG();
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = engine.docName.replace(/\.[^/.]+$/, '') + '.png';
    a.click();
  });

  document.getElementById('menu-export-jpg')?.addEventListener('click', () => {
    const dataUrl = engine.exportJPG(0.95);
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = engine.docName.replace(/\.[^/.]+$/, '') + '.jpg';
    a.click();
  });

  document.getElementById('menu-close-doc')?.addEventListener('click', () => {
    engine.newDocument('Untitled.psd', 1024, 1024, 'transparent');
    history.clear();
    history.captureSnapshot('Close Document');
  });

  // Handle Opened File
  fileInput?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.name.endsWith('.json')) {
      const reader = new FileReader();
      reader.onload = async (re) => {
        try {
          const json = JSON.parse(re.target.result);
          await engine.loadFromJSON(json);
          history.clear();
          history.captureSnapshot('Open Project');
        } catch (err) {
          alert('Invalid project file: ' + err.message);
        }
      };
      reader.readAsText(file);
    } else {
      const reader = new FileReader();
      reader.onload = async (re) => {
        await engine.loadFromImage(re.target.result, file.name);
        history.clear();
        history.captureSnapshot('Open Image');
      };
      reader.readAsDataURL(file);
    }
  });

  // --- Edit Actions ---
  document.getElementById('menu-undo')?.addEventListener('click', () => history.undo());
  document.getElementById('menu-redo')?.addEventListener('click', () => history.redo());
  document.getElementById('btn-history-clear')?.addEventListener('click', () => history.clear('Current state'));

  document.getElementById('menu-clear-layer')?.addEventListener('click', () => {
    const active = engine.getActiveLayer();
    if (active) {
      history.captureSnapshot('Clear Layer');
      active.clear();
      engine.render();
      renderLayersPanel();
    }
  });

  document.getElementById('menu-fill-color')?.addEventListener('click', () => {
    const active = engine.getActiveLayer();
    if (active) {
      if (engine.selectionMgr?.has) { window.photoearnai.editOps?.fillSelection(); return; }
      history.captureSnapshot('Fill Layer');
      active.ctx.save();
      active.ctx.fillStyle = engine.foregroundColor;
      active.ctx.fillRect(0, 0, active.width, active.height);
      active.ctx.restore();
      engine.render();
      renderLayersPanel();
    }
  });

  // --- Image / Filter Actions ---
  document.getElementById('menu-filter-brightness')?.addEventListener('click', () => {
    openModal('modal-filter-bc');
  });

  document.getElementById('menu-filter-invert')?.addEventListener('click', () => {
    const active = engine.getActiveLayer();
    if (active) {
      history.captureSnapshot('Invert');
      FilterEngine.applyInvert(active);
      engine.render();
      renderLayersPanel();
    }
  });

  document.getElementById('menu-filter-grayscale')?.addEventListener('click', () => {
    const active = engine.getActiveLayer();
    if (active) {
      history.captureSnapshot('Grayscale');
      FilterEngine.applyGrayscale(active);
      engine.render();
      renderLayersPanel();
    }
  });

  document.getElementById('menu-filter-sepia')?.addEventListener('click', () => {
    const active = engine.getActiveLayer();
    if (active) {
      history.captureSnapshot('Sepia');
      FilterEngine.applySepia(active);
      engine.render();
      renderLayersPanel();
    }
  });

  document.getElementById('menu-filter-blur')?.addEventListener('click', () => {
    openModal('modal-filter-blur');
  });

  document.getElementById('menu-filter-sharpen')?.addEventListener('click', () => {
    const active = engine.getActiveLayer();
    if (active) {
      history.captureSnapshot('Sharpen');
      FilterEngine.applySharpen(active);
      engine.render();
      renderLayersPanel();
    }
  });

  document.getElementById('menu-filter-vignette')?.addEventListener('click', () => {
    const active = engine.getActiveLayer();
    if (active) {
      history.captureSnapshot('Vignette');
      FilterEngine.applyVignette(active);
      engine.render();
      renderLayersPanel();
    }
  });

  // --- Layer Menu Actions ---
  document.getElementById('menu-new-layer')?.addEventListener('click', () => {
    history.captureSnapshot('New Layer');
    engine.addLayer();
  });

  document.getElementById('menu-dup-layer')?.addEventListener('click', () => {
    history.captureSnapshot('Duplicate Layer');
    engine.duplicateLayer();
  });

  document.getElementById('menu-del-layer')?.addEventListener('click', () => {
    history.captureSnapshot('Delete Layer');
    engine.deleteLayer();
  });

  document.getElementById('menu-merge-down')?.addEventListener('click', () => {
    history.captureSnapshot('Merge Down');
    engine.mergeDown();
  });

  document.getElementById('menu-toggle-layer-vis')?.addEventListener('click', () => {
    const active = engine.getActiveLayer();
    if (active) {
      active.visible = !active.visible;
      engine.render();
      renderLayersPanel();
    }
  });

  // --- View Actions ---
  document.getElementById('menu-zoom-in')?.addEventListener('click', () => engine.setZoom(engine.zoom * 1.25));
  document.getElementById('menu-zoom-out')?.addEventListener('click', () => engine.setZoom(engine.zoom * 0.8));
  document.getElementById('menu-zoom-fit')?.addEventListener('click', () => engine.centerAndFitViewport());
  document.getElementById('menu-zoom-100')?.addEventListener('click', () => engine.setZoom(1.0));

  // --- Help Menu ---
  document.getElementById('menu-architecture-info')?.addEventListener('click', () => {
    alert(
      'PhotoEarnAI clean-room browser editor\n' +
      'Reverse-Engineered via REA Specification.\n\n' +
      'Key Findings from REA Analysis:\n' +
      '• Layered document model: independent canvas buffers and blend modes\n' +
      '• Rendering: HTML5 2D Canvas compositing pipeline\n' +
      '• Extensibility: local tools, presets, filters, fonts, plug-ins and watermark layers\n' +
      '• Architecture notes: docs/architecture.md'
    );
  });

  document.getElementById('menu-about')?.addEventListener('click', () => {
    alert('PhotoEarnAI\nBuilt with native HTML5 Canvas, Vanilla CSS & Modern JS.\nRuns locally in your browser.');
  });

  // =========================================================================
  // Modal Dialogs
  // =========================================================================
  function openModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.add('open');
  }

  function closeModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.remove('open');
  }

  document.querySelectorAll('.modal-close-btn, .modal-cancel-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const modal = e.target.closest('.modal-overlay');
      if (modal) modal.classList.remove('open');
    });
  });

  // Create Document Modal: wired in features/fileFeatures.js (presets, units, DPI, templates)

  // Brightness/Contrast Modal
  const brightRange = document.getElementById('bc-brightness');
  const contrastRange = document.getElementById('bc-contrast');
  brightRange?.addEventListener('input', (e) => {
    document.getElementById('bc-bright-val').textContent = e.target.value;
  });
  contrastRange?.addEventListener('input', (e) => {
    document.getElementById('bc-contrast-val').textContent = e.target.value;
  });

  document.getElementById('btn-apply-bc')?.addEventListener('click', () => {
    const b = parseInt(brightRange.value, 10);
    const c = parseInt(contrastRange.value, 10);
    const active = engine.getActiveLayer();
    if (active) {
      history.captureSnapshot('Brightness/Contrast');
      FilterEngine.applyBrightnessContrast(active, b, c);
      engine.render();
      renderLayersPanel();
    }
    closeModal('modal-filter-bc');
  });

  // Blur Modal
  const blurRange = document.getElementById('blur-radius');
  blurRange?.addEventListener('input', (e) => {
    document.getElementById('blur-radius-val').textContent = e.target.value;
  });

  document.getElementById('btn-apply-blur')?.addEventListener('click', () => {
    const r = parseInt(blurRange.value, 10);
    const active = engine.getActiveLayer();
    if (active) {
      history.captureSnapshot('Gaussian Blur');
      FilterEngine.applyBlur(active, r);
      engine.render();
      renderLayersPanel();
    }
    closeModal('modal-filter-blur');
  });

  // =========================================================================
  // Drag and Drop Files onto Viewport
  // =========================================================================
  viewportEl.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
  });

  viewportEl.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    // Like Photopea: pictures dropped on the canvas are placed as new layers in
    // the open project (PSD / video drops are handled in advancedFeatures.js).
    const images = [...(e.dataTransfer.files || [])].filter(f => f.type.startsWith('image/') && !/\.psd$/i.test(f.name));
    if (images.length) window.photoearnai.placeImageFiles?.(images);
  });

  // =========================================================================
  // Global Keyboard Shortcuts
  // =========================================================================
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;
    if (document.querySelector('.modal-overlay.open')) return;

    const ctrl = e.ctrlKey || e.metaKey;
    const ops = window.photoearnai.editOps;
    const key = e.key.toLowerCase();

    if (ctrl && key === 'a') { e.preventDefault(); ops?.selectAll(); return; }
    if (ctrl && key === 'd') { e.preventDefault(); ops?.deselect(); return; }
    if (ctrl && e.shiftKey && key === 'i') { e.preventDefault(); ops?.invertSelection(); return; }
    if (ctrl && key === 'j') { e.preventDefault(); ops?.layerViaCopy(); return; }
    if (!ctrl && (e.key === 'Delete' || e.key === 'Backspace')) { e.preventDefault(); ops?.deleteSelected(); return; }
    if (!ctrl && e.key === '[') { tools.setBrushSize(engine.brushSize - Math.max(1, Math.round(engine.brushSize * 0.15))); return; }
    if (!ctrl && e.key === ']') { tools.setBrushSize(engine.brushSize + Math.max(1, Math.round(engine.brushSize * 0.15))); return; }
    if (!ctrl && e.key === '\\') { ops?.toggleMaskEdit(); return; }
    if (!ctrl && key === 'w') { tools.setTool('wand'); return; }
    if (!ctrl && key === 'j') { tools.setTool('healing'); return; }

    if (ctrl && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) history.redo();
      else history.undo();
    } else if (ctrl && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      history.redo();
    } else if (ctrl && e.key.toLowerCase() === 'o') {
      e.preventDefault();
      if (e.shiftKey) document.getElementById('menu-place-image')?.click();
      else fileInput.click();
    } else if (ctrl && e.key.toLowerCase() === 'n') {
      e.preventDefault();
      if (window.photoearnai.openNewProject) window.photoearnai.openNewProject(); else openModal('modal-new-doc');
    } else if (ctrl && e.key.toLowerCase() === 's') {
      e.preventDefault();
      document.getElementById('menu-save-json')?.click();
    } else if (ctrl && e.key.toLowerCase() === 'e') {
      e.preventDefault();
      if (engine.activeLayerIndex > 0) { history.captureSnapshot('Merge Down'); engine.mergeDown(); }
    } else if (ctrl && !e.shiftKey && e.key.toLowerCase() === 'i') {
      e.preventDefault();
      document.getElementById('menu-filter-invert')?.click();
    } else if (ctrl && e.key === '0') {
      e.preventDefault();
      engine.centerAndFitViewport();
    } else if (ctrl && e.key === '1') {
      e.preventDefault();
      engine.setZoom(1.0);
    } else if (e.key.toLowerCase() === 'b') {
      tools.setTool(e.shiftKey ? 'brushAdvanced' : 'brush');
    } else if (e.key.toLowerCase() === 'l') {
      tools.setTool('lasso');
    } else if (e.key.toLowerCase() === 'c') {
      tools.setTool('crop');
    } else if (e.key.toLowerCase() === 's') {
      tools.setTool('clone');
    } else if (e.key.toLowerCase() === 'e') {
      tools.setTool('eraser');
    } else if (e.key.toLowerCase() === 'g') {
      tools.setTool('gradient');
    } else if (e.key.toLowerCase() === 'k') {
      tools.setTool('bucket');
    } else if (e.key.toLowerCase() === 'v') {
      tools.setTool('move');
    } else if (e.key.toLowerCase() === 'm') {
      tools.setTool('marquee');
    } else if (e.key.toLowerCase() === 'u') {
      tools.setTool('shape');
    } else if (e.key.toLowerCase() === 't') {
      tools.setTool('text');
    } else if (e.key.toLowerCase() === 'p') {
      tools.setTool('pen');
    } else if (e.key.toLowerCase() === 'i') {
      tools.setTool('eyedropper');
    } else if (e.key.toLowerCase() === 'h') {
      tools.setTool('hand');
    } else if (e.key.toLowerCase() === 'z') {
      tools.setTool('zoom');
    } else if (e.key.toLowerCase() === 'x') {
      document.getElementById('btn-swap-colors')?.click();
    } else if (e.key.toLowerCase() === 'd') {
      document.getElementById('btn-reset-colors')?.click();
    }
  });

  // Handle Window Resize
  window.addEventListener('resize', () => {
    engine.centerAndFitViewport();
  });
});

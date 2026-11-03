/**
 * Selection + layer mask commands and their menus / option-bar controls.
 * Exposes window.photoearnai.editOps so shortcuts in app.js can call them.
 */
document.addEventListener('DOMContentLoaded', () => {
  const app = window.photoearnai;
  if (!app) return;
  const { engine, history, tools } = app;
  const sel = () => engine.selectionMgr;
  const th = () => window.PhotoEarnI18n?.language === 'th';
  const say = (en, thText) => {
    const node = document.createElement('div');
    node.className = 'studio-toast studio-toast-info';
    node.textContent = th() ? thText : en;
    document.body.appendChild(node);
    requestAnimationFrame(() => node.classList.add('show'));
    setTimeout(() => { node.classList.remove('show'); setTimeout(() => node.remove(), 220); }, 2600);
  };
  const needSelection = () => { if (sel()?.has) return true; say('Make a selection first (Marquee, Lasso or Magic Wand)', 'เลือกพื้นที่ก่อน (กรอบสี่เหลี่ยม บ่วงบาศ หรือไม้กายสิทธิ์)'); return false; };
  const done = () => { engine.render(); engine.emit('layerChange'); };
  const layer = () => engine.getActiveLayer();

  const ops = {
    selectAll() { sel()?.selectAll(); },
    deselect() { sel()?.clear(); },
    invertSelection() { sel()?.invert(); },

    deleteSelected() {
      const l = layer(); if (!l) return;
      const t = tools.paintTarget(l);
      if (!sel()?.has) {
        history.captureSnapshot(t.isMask ? 'Clear Mask' : 'Clear Layer');
        t.ctx.clearRect(0, 0, t.canvas.width, t.canvas.height);
        done(); return;
      }
      history.captureSnapshot(t.isMask ? 'Hide Selection on Mask' : 'Delete Selected Pixels');
      t.ctx.save(); t.ctx.globalCompositeOperation = 'destination-out'; t.ctx.drawImage(sel().maskForLayer(l), 0, 0); t.ctx.restore();
      done();
    },

    layerViaCopy() {
      const l = layer(); if (!l) return;
      if (!sel()?.has) { history.captureSnapshot('Duplicate Layer'); engine.duplicateLayer(); return; }
      history.captureSnapshot('Layer via Copy');
      const copy = new Layer(`${l.name} (copy)`, l.width, l.height);
      copy.x = l.x; copy.y = l.y;
      copy.ctx.drawImage(l.getRenderSource(), 0, 0);
      copy.ctx.globalCompositeOperation = 'destination-in';
      copy.ctx.drawImage(sel().maskForLayer(l), 0, 0);
      copy.ctx.globalCompositeOperation = 'source-over';
      engine.layers.splice(engine.activeLayerIndex + 1, 0, copy);
      engine.activeLayerIndex += 1;
      done();
    },

    fillSelection() {
      const l = layer(); if (!l || !needSelection()) return;
      history.captureSnapshot('Fill Selection');
      const m = sel().maskForLayer(l);
      const tmp = document.createElement('canvas'); tmp.width = l.width; tmp.height = l.height;
      const tctx = tmp.getContext('2d');
      tctx.fillStyle = engine.foregroundColor; tctx.fillRect(0, 0, l.width, l.height);
      tctx.globalCompositeOperation = 'destination-in'; tctx.drawImage(m, 0, 0);
      l.ctx.drawImage(tmp, 0, 0);
      done();
    },

    addMask() {
      const l = layer(); if (!l) return;
      if (l.adjustment) { say('Adjustment layers cannot have a mask yet', 'เลเยอร์ปรับแต่งยังใส่มาสก์ไม่ได้'); return; }
      if (l.mask) { l.editingMask = true; done(); return; }
      history.captureSnapshot('Add Layer Mask');
      if (sel()?.has) l.addMask('selection', sel().mask); else l.addMask('reveal');
      say('Mask added · paint black to hide, white to show', 'เพิ่มมาสก์แล้ว · ระบายสีดำเพื่อซ่อน สีขาวเพื่อแสดง');
      done();
    },

    maskFromSelection() {
      const l = layer(); if (!l || !needSelection()) return;
      history.captureSnapshot('Mask from Selection');
      l.addMask('selection', sel().mask);
      done();
    },

    toggleMaskEdit() {
      const l = layer(); if (!l) return;
      if (!l.mask) { ops.addMask(); return; }
      l.editingMask = !l.editingMask;
      say(l.editingMask ? 'Now painting on the mask' : 'Now painting on the pixels', l.editingMask ? 'กำลังระบายบนมาสก์' : 'กำลังระบายบนพิกเซล');
      done();
    },

    toggleMask() { const l = layer(); if (!l?.mask) return; history.captureSnapshot(l.maskEnabled ? 'Disable Mask' : 'Enable Mask'); l.maskEnabled = !l.maskEnabled; done(); },
    invertMask() { const l = layer(); if (!l?.mask) return; history.captureSnapshot('Invert Mask'); l.invertMask(); done(); },
    applyMask() { const l = layer(); if (!l?.mask) return; history.captureSnapshot('Apply Mask'); l.applyMask(); done(); },
    deleteMask() { const l = layer(); if (!l?.mask) return; history.captureSnapshot('Delete Mask'); l.removeMask(); done(); }
  };
  app.editOps = ops;

  const bind = (id, fn) => document.getElementById(id)?.addEventListener('click', fn);
  bind('menu-select-all', ops.selectAll);
  bind('menu-deselect', ops.deselect);
  bind('menu-select-inverse', ops.invertSelection);
  bind('menu-select-delete', ops.deleteSelected);
  bind('menu-select-copy-layer', ops.layerViaCopy);
  bind('menu-select-fill', ops.fillSelection);
  bind('menu-mask-add', ops.addMask);
  bind('menu-mask-from-selection', ops.maskFromSelection);
  bind('menu-mask-edit', ops.toggleMaskEdit);
  bind('menu-mask-toggle', ops.toggleMask);
  bind('menu-mask-invert', ops.invertMask);
  bind('menu-mask-apply', ops.applyMask);
  bind('menu-mask-delete', ops.deleteMask);
  bind('btn-sel-deselect', ops.deselect);
  bind('btn-sel-invert', ops.invertSelection);
  bind('btn-sel-delete', ops.deleteSelected);
  bind('btn-sel-copy', ops.layerViaCopy);
  bind('btn-sel-mask', ops.maskFromSelection);
  bind('menu-open-history', () => {
    document.querySelector('.tab-btn[data-tab="history"]')?.click();
    app.openDock?.();
  });

  // Clone options
  document.getElementById('opt-clone-mode')?.addEventListener('change', (e) => tools.setCloneMode(e.target.value));
  bind('btn-clone-smaller', () => tools.setBrushSize(engine.brushSize - Math.max(1, Math.round(engine.brushSize * 0.2))));
  bind('btn-clone-bigger', () => tools.setBrushSize(engine.brushSize + Math.max(1, Math.round(engine.brushSize * 0.2))));

  // Magic wand options
  const tol = document.getElementById('opt-wand-tolerance');
  tol?.addEventListener('input', () => { tools.wandTolerance = Number(tol.value); const v = document.getElementById('opt-wand-tolerance-val'); if (v) v.textContent = tol.value; });
  document.getElementById('opt-wand-contiguous')?.addEventListener('change', (e) => { tools.wandContiguous = e.target.checked; });

  // Undo / redo availability in the Edit menu
  const syncUndo = () => {
    document.getElementById('menu-undo')?.classList.toggle('disabled', !history.canUndo);
    document.getElementById('menu-redo')?.classList.toggle('disabled', !history.canRedo);
  };
  engine.on('historyChange', syncUndo);
  syncUndo();

  // Thai labels for new tool names and menus
  if (window.PhotoEarnI18n) {
    Object.assign(PhotoEarnI18n.keyMap, {
      'Select': ['เลือก', 'Select'], 'AI': ['AI', 'AI'],
      'Select All': ['เลือกทั้งหมด', 'Select All'], 'Deselect': ['ยกเลิกการเลือก', 'Deselect'], 'Inverse': ['กลับพื้นที่เลือก', 'Inverse'],
      'Delete Selected Pixels': ['ลบพิกเซลที่เลือก', 'Delete Selected Pixels'], 'Layer via Copy': ['คัดลอกไปเลเยอร์ใหม่', 'Layer via Copy'], 'Fill Selection': ['เติมสีพื้นที่เลือก', 'Fill Selection'],
      'Add Layer Mask': ['เพิ่มเลเยอร์มาสก์', 'Add Layer Mask'], 'Mask from Selection': ['สร้างมาสก์จากพื้นที่เลือก', 'Mask from Selection'],
      'Edit Mask / Edit Pixels': ['สลับ แก้มาสก์ / แก้พิกเซล', 'Edit Mask / Edit Pixels'], 'Disable / Enable Mask': ['ปิด / เปิดมาสก์', 'Disable / Enable Mask'],
      'Invert Mask': ['กลับมาสก์', 'Invert Mask'], 'Apply Mask': ['ใช้มาสก์ถาวร', 'Apply Mask'], 'Delete Mask': ['ลบมาสก์', 'Delete Mask'],
      'History (multi-step undo)': ['ประวัติ (ย้อนกลับหลายขั้น)', 'History (multi-step undo)'],
      'Generate Image from Text...': ['สร้างภาพจากข้อความ...', 'Generate Image from Text...'], 'Remove Background': ['ลบพื้นหลัง', 'Remove Background'],
      'AI Edit (describe a change)...': ['แก้ภาพด้วย AI (พิมพ์สิ่งที่ต้องการ)...', 'AI Edit (describe a change)...'], 'Auto Enhance': ['แต่งภาพอัตโนมัติ', 'Auto Enhance'],
      'Magic Wand Tool': ['ไม้กายสิทธิ์', 'Magic Wand Tool'], 'Healing Brush Tool': ['แปรงซ่อมภาพ', 'Healing Brush Tool'], 'Clone Stamp Tool': ['ตราประทับโคลน', 'Clone Stamp Tool'],
      'Rectangular Marquee': ['กรอบเลือกสี่เหลี่ยม', 'Rectangular Marquee'], 'Lasso Tool': ['บ่วงบาศ', 'Lasso Tool'], 'Move Tool': ['เครื่องมือย้าย', 'Move Tool'],
      'Crop Tool': ['ครอป', 'Crop Tool'], 'Gradient Tool': ['ไล่สี', 'Gradient Tool'], 'Blur Tool': ['เบลอ', 'Blur Tool'], 'Pen Tool': ['ปากกา', 'Pen Tool']
    });
    PhotoEarnI18n.refresh();
    window.addEventListener('photoearnai:language', () => tools.setTool(tools.activeTool));
  }
});

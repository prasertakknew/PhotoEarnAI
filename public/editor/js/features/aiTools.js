/**
 * AI tools: text-to-image, background removal, AI edit (via the app's /api/ai/*
 * routes, which call the Lovable AI Gateway) and an instant local Auto Enhance.
 */
(function () {
  // ------------------------------------------------------------ SSE image client
  async function streamImage(endpoint, input, onFrame) {
    const send = (stream) => {
      let body; const headers = {};
      if (input instanceof FormData) {
        body = new FormData();
        input.forEach((value, name) => body.append(name, value));
        body.set('stream', String(stream));
      } else {
        body = JSON.stringify({ ...input, stream });
        headers['Content-Type'] = 'application/json';
      }
      return fetch(endpoint, { method: 'POST', headers, body });
    };
    const readError = async (res) => {
      const text = await res.text().catch(() => '');
      try { const j = JSON.parse(text); return j?.error?.message || j?.message || text; } catch { return text || `Request failed (${res.status})`; }
    };

    const res = await send(true);
    if (!res.ok || !res.body) { const err = new Error(await readError(res)); err.status = res.status; throw err; }

    let sawAny = false; let sawCompleted = false; let streamError = null;
    const handle = (eventName, data) => {
      let payload; try { payload = JSON.parse(data); } catch { payload = undefined; }
      if (eventName === 'error' || payload?.type === 'error') { sawAny = true; streamError = payload?.error?.message || 'Image generation failed'; return; }
      const type = eventName || payload?.type;
      if (!['image_generation.partial_image', 'image_generation.completed', 'image_edit.partial_image', 'image_edit.completed'].includes(type)) return;
      sawAny = true;
      if (!payload?.b64_json) { streamError = 'The AI returned no picture'; return; }
      const isFinal = type.endsWith('.completed');
      onFrame(`data:image/png;base64,${payload.b64_json}`, isFinal);
      if (isFinal) sawCompleted = true;
    };

    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = '';
    const flush = (block) => {
      let ev = ''; const data = [];
      for (const raw of block.split('\n')) {
        const line = raw.replace(/\r$/, '');
        if (!line || line.startsWith(':')) continue;
        const i = line.indexOf(':'); const field = i < 0 ? line : line.slice(0, i); let value = i < 0 ? '' : line.slice(i + 1); if (value.startsWith(' ')) value = value.slice(1);
        if (field === 'event') ev = value; else if (field === 'data') data.push(value);
      }
      if (data.length) handle(ev, data.join('\n'));
    };
    try {
      while (true) {
        let chunk;
        try { chunk = await reader.read(); } catch (error) { if (sawAny) throw error; break; }
        if (chunk.done) break;
        buffer += chunk.value;
        let idx;
        while ((idx = buffer.search(/\r?\n\r?\n/)) >= 0) {
          const block = buffer.slice(0, idx); buffer = buffer.slice(idx).replace(/^\r?\n\r?\n/, '');
          flush(block);
        }
      }
      if (buffer.trim()) flush(buffer);
    } finally { reader.cancel().catch(() => {}); }

    if (streamError) throw new Error(streamError);
    if (!sawAny) {
      const replay = await send(false);
      if (!replay.ok) { const err = new Error(await readError(replay)); err.status = replay.status; throw err; }
      const json = await replay.json();
      const b64 = json?.data?.[0]?.b64_json;
      if (!b64) throw new Error('The AI returned no picture');
      onFrame(`data:image/png;base64,${b64}`, true);
      return;
    }
    if (!sawCompleted) throw new Error('The picture was not finished. Please try again.');
  }

  // ------------------------------------------------------------ canvas helpers
  const loadImage = (src) => new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = () => reject(new Error('Could not read the AI picture')); img.src = src; });

  /** Fit a canvas into the closest supported AI size; remember where it went. */
  function letterbox(source, fill = '#ffffff') {
    const r = source.width / source.height;
    const [W, H] = r > 1.25 ? [1536, 1024] : r < 0.8 ? [1024, 1536] : [1024, 1024];
    const scale = Math.min(W / source.width, H / source.height);
    const w = Math.round(source.width * scale); const h = Math.round(source.height * scale);
    const rect = { x: Math.round((W - w) / 2), y: Math.round((H - h) / 2), w, h };
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    if (fill) { ctx.fillStyle = fill; ctx.fillRect(0, 0, W, H); }
    ctx.drawImage(source, rect.x, rect.y, w, h);
    return { canvas: c, size: `${W}x${H}`, rect, W, H };
  }

  /** Map an AI result back onto the original area (undo the letterbox). */
  function unletterbox(img, box, outW, outH) {
    const sx = img.width / box.W; const sy = img.height / box.H;
    const c = document.createElement('canvas'); c.width = outW; c.height = outH;
    c.getContext('2d').drawImage(img, box.rect.x * sx, box.rect.y * sy, box.rect.w * sx, box.rect.h * sy, 0, 0, outW, outH);
    return c;
  }

  const toBlob = (canvas) => new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));

  function hasTransparency(canvas) {
    const d = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, canvas.width, canvas.height).data;
    let clear = 0; for (let i = 3; i < d.length; i += 16) if (d[i] < 32) clear++;
    return clear > (d.length / 16) * 0.02;
  }

  // ------------------------------------------------------------ Auto Enhance (local)
  function autoEnhance(layer, selectionMask) {
    const { width: w, height: h } = layer;
    const img = layer.ctx.getImageData(0, 0, w, h); const d = img.data;
    const hist = [new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)];
    let count = 0;
    for (let i = 0; i < d.length; i += 4) { if (d[i + 3] < 8) continue; hist[0][d[i]]++; hist[1][d[i + 1]]++; hist[2][d[i + 2]]++; count++; }
    if (!count) return false;
    const clip = count * 0.005;
    const bounds = hist.map((hst) => { let lo = 0, hi = 255, acc = 0; while (lo < 255 && (acc += hst[lo]) < clip) lo++; acc = 0; while (hi > 0 && (acc += hst[hi]) < clip) hi--; if (hi - lo < 16) { lo = 0; hi = 255; } return [lo, hi]; });
    const luts = bounds.map(([lo, hi]) => { const lut = new Uint8ClampedArray(256); for (let v = 0; v < 256; v++) lut[v] = ((v - lo) / (hi - lo)) * 255; return lut; });
    const sat = 1.12;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 8) continue;
      let r = luts[0][d[i]], g = luts[1][d[i + 1]], b = luts[2][d[i + 2]];
      const l = 0.299 * r + 0.587 * g + 0.114 * b;
      d[i] = l + (r - l) * sat; d[i + 1] = l + (g - l) * sat; d[i + 2] = l + (b - l) * sat;
    }
    if (selectionMask) {
      const tmp = document.createElement('canvas'); tmp.width = w; tmp.height = h;
      const t = tmp.getContext('2d'); t.putImageData(img, 0, 0);
      t.globalCompositeOperation = 'destination-in'; t.drawImage(selectionMask, 0, 0);
      layer.ctx.drawImage(tmp, 0, 0);
    } else layer.ctx.putImageData(img, 0, 0);
    return true;
  }

  // ------------------------------------------------------------ UI
  document.addEventListener('DOMContentLoaded', () => {
    const app = window.photoearnai;
    if (!app) return;
    const { engine, history } = app;
    const th = () => window.PhotoEarnI18n?.language === 'th';
    const $ = (id) => document.getElementById(id);
    const modal = $('modal-ai');
    const statusEl = $('ai-status');
    const preview = $('ai-preview'); const previewImg = $('ai-preview-img');
    const runBtn = $('ai-run');
    let mode = 'generate'; let busy = false;

    const T = {
      generate: { title: ['สร้างภาพจากข้อความ', 'Generate Image from Text'], help: ['พิมพ์อธิบายภาพที่ต้องการ ภาพที่ได้จะถูกเพิ่มเป็นเลเยอร์ใหม่', 'Describe the picture you want. It is added as a new layer.'], label: ['อธิบายภาพ', 'Describe the picture'], run: ['สร้างภาพ', 'Generate'], ph: ['เช่น กล้องถ่ายรูปสไตล์นีออนบนโต๊ะไม้ แสงยามเย็น', 'e.g. a neon-lit retro camera on a wooden desk, golden hour'] },
      edit: { title: ['แก้ภาพด้วย AI', 'AI Edit'], help: ['AI จะแก้เลเยอร์ที่เลือกตามที่คุณพิมพ์ ผลลัพธ์จะเป็นเลเยอร์ใหม่ด้านบน (ภาพเดิมยังอยู่)', 'AI changes the selected layer as you describe. The result is a new layer on top (the original stays).'], label: ['ต้องการเปลี่ยนอะไร', 'What should change?'], run: ['แก้ภาพ', 'Apply AI edit'], ph: ['เช่น เปลี่ยนท้องฟ้าเป็นตอนพระอาทิตย์ตก', 'e.g. make the sky a sunset'] },
      removebg: { title: ['ลบพื้นหลัง', 'Remove Background'], help: ['AI จะตัดพื้นหลังของเลเยอร์ที่เลือกออก', 'AI cuts the background away from the selected layer.'], run: ['ลบพื้นหลัง', 'Remove background'] }
    };
    const pick = (pair) => (th() ? pair[0] : pair[1]);
    const setStatus = (text, tone = '') => { statusEl.textContent = text; statusEl.dataset.tone = tone; };

    function open(nextMode) {
      if (busy) { modal.classList.add('open'); return; }
      mode = nextMode;
      const t = T[mode];
      $('ai-title').textContent = pick(t.title);
      $('ai-help').textContent = pick(t.help);
      $('ai-prompt-row').hidden = mode === 'removebg';
      $('ai-size-row').hidden = mode !== 'generate';
      $('ai-mask-row').hidden = mode !== 'removebg';
      if (t.label) $('ai-prompt-label').textContent = pick(t.label);
      if (t.ph) $('ai-prompt').placeholder = pick(t.ph);
      $('ai-mask-label').textContent = th() ? 'เก็บพิกเซลเดิมไว้ (ตัดด้วยเลเยอร์มาสก์ แก้ไขต่อได้)' : 'Keep original pixels (cut out with an editable layer mask)';
      $('ai-cancel').textContent = th() ? 'ปิด' : 'Close';
      $('ai-size-label').textContent = th() ? 'รูปทรงภาพ' : 'Shape';
      runBtn.textContent = pick(t.run);
      preview.hidden = true; previewImg.removeAttribute('src');
      setStatus('');
      modal.classList.add('open');
      if (mode !== 'removebg') setTimeout(() => $('ai-prompt').focus(), 50);
    }

    const friendly = (error) => {
      const s = error?.status;
      if (s === 402) return th() ? 'เครดิต AI หมดแล้ว กรุณาเติมเครดิตแล้วลองใหม่' : (error.message || 'AI credits have run out. Please add credits and try again.');
      if (s === 429) return th() ? 'ใช้ AI ถี่เกินไป กรุณารอสักครู่แล้วลองใหม่' : (error.message || 'Too many requests. Please wait a moment and try again.');
      return (th() ? 'AI ทำไม่สำเร็จ: ' : 'AI could not finish: ') + (error?.message || 'unknown error');
    };

    async function run() {
      if (busy) return;
      const layer = engine.getActiveLayer();
      const prompt = $('ai-prompt').value.trim();
      if (mode !== 'generate' && (!layer || layer.adjustment)) { setStatus(th() ? 'เลือกเลเยอร์รูปภาพก่อน' : 'Select a picture layer first', 'error'); return; }
      if (mode !== 'removebg' && prompt.length < 3) { setStatus(th() ? 'กรุณาพิมพ์อธิบายอย่างน้อย 3 ตัวอักษร' : 'Please type at least 3 characters', 'error'); return; }

      busy = true; runBtn.disabled = true;
      setStatus(th() ? 'AI กำลังทำงาน… อาจใช้เวลาประมาณ 20–60 วินาที' : 'AI is working… this can take about 20–60 seconds', 'busy');
      preview.hidden = false; previewImg.classList.add('partial'); previewImg.removeAttribute('src');
      let finalSrc = null;
      const onFrame = (src, isFinal) => { previewImg.src = src; previewImg.classList.toggle('partial', !isFinal); if (isFinal) finalSrc = src; };

      try {
        if (mode === 'generate') {
          await streamImage('/api/ai/generate-image', { prompt, size: $('ai-size').value }, onFrame);
          const img = await loadImage(finalSrc);
          history.captureSnapshot('AI Generate Image');
          const l = engine.addLayer(`AI · ${prompt.slice(0, 28)}`);
          const scale = Math.min(engine.width / img.width, engine.height / img.height);
          const w = img.width * scale, h = img.height * scale;
          l.ctx.drawImage(img, (engine.width - w) / 2, (engine.height - h) / 2, w, h);
        } else {
          const box = letterbox(layer.canvas, mode === 'removebg' ? '#ffffff' : '#808080');
          const form = new FormData();
          form.append('image', await toBlob(box.canvas), 'layer.png');
          form.append('size', box.size);
          if (mode === 'removebg') {
            form.append('prompt', 'Remove the background completely and make it fully transparent. Keep the main subject exactly as it is: same position, size, shape, edges, colours and details. Do not add, move or redraw anything.');
            form.append('background', 'transparent');
          } else {
            form.append('prompt', `${prompt}. Keep everything else in the picture unchanged, with the same framing and composition.`);
          }
          await streamImage('/api/ai/edit-image', form, onFrame);
          const img = await loadImage(finalSrc);
          const mapped = unletterbox(img, box, layer.width, layer.height);
          if (mode === 'removebg') {
            if (!hasTransparency(mapped)) throw new Error(th() ? 'AI ไม่ได้ตัดพื้นหลังออก ลองอีกครั้ง' : 'The AI did not remove the background. Please try again.');
            history.captureSnapshot('AI Remove Background');
            if ($('ai-as-mask').checked) {
              layer.mask = mapped; layer.maskEnabled = true; layer.editingMask = false;
            } else {
              layer.clear(); layer.ctx.drawImage(mapped, 0, 0);
            }
          } else {
            history.captureSnapshot('AI Edit');
            const idx = engine.layers.indexOf(layer);
            const l = new Layer(`AI edit · ${prompt.slice(0, 24)}`, layer.width, layer.height);
            l.x = layer.x; l.y = layer.y;
            l.ctx.drawImage(mapped, 0, 0);
            engine.layers.splice(idx + 1, 0, l);
            engine.activeLayerIndex = idx + 1;
          }
        }
        engine.render(); engine.emit('layerChange');
        setStatus(th() ? 'เสร็จแล้ว ✓ (ย้อนกลับได้ด้วย Ctrl+Z)' : 'Done ✓ (Ctrl+Z to undo)', 'ok');
      } catch (error) {
        console.error(error);
        previewImg.classList.remove('partial');
        if (!finalSrc) preview.hidden = true;
        setStatus(friendly(error), 'error');
      } finally {
        busy = false; runBtn.disabled = false;
      }
    }

    runBtn?.addEventListener('click', run);
    modal?.querySelectorAll('.modal-close-btn, .modal-cancel-btn').forEach((b) => b.addEventListener('click', () => modal.classList.remove('open')));
    $('menu-ai-generate')?.addEventListener('click', () => open('generate'));
    $('menu-ai-edit')?.addEventListener('click', () => open('edit'));
    $('menu-ai-remove-bg')?.addEventListener('click', () => open('removebg'));
    $('menu-ai-enhance')?.addEventListener('click', () => {
      const layer = engine.getActiveLayer();
      if (!layer || layer.adjustment) return;
      history.captureSnapshot('Auto Enhance');
      const ok = autoEnhance(layer, engine.selectionMgr?.has ? engine.selectionMgr.maskForLayer(layer) : null);
      if (!ok) { history.discardLast(); return; }
      engine.render(); engine.emit('layerChange');
    });

    app.ai = { streamImage, letterbox, unletterbox, autoEnhance };
  });
})();

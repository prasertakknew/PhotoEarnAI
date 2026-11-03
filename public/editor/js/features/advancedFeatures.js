document.addEventListener('DOMContentLoaded', () => {
  const app = window.photoearnai;
  if (!app) return;
  const { engine } = app;
  const psd = new PsdWasmAdapter(engine);
  const video = new FfmpegWasmAdapter(engine);
  const psdInput = document.getElementById('file-input-psd');
  const videoInput = document.getElementById('file-input-video');
  const notice = (message) => { const toast = document.createElement('div'); toast.className = 'feature-toast'; toast.textContent = message; document.body.appendChild(toast); setTimeout(() => toast.remove(), 5200); };
  const run = async (promise, success) => { try { const result = await promise; notice(success(result)); } catch (error) { console.error(error); alert(`PhotoEarnAI feature error: ${error.message}`); } };
  const th = () => window.PhotoEarnI18n?.language === 'th';
  app.psd = psd;
  const openPsd = (file) => {
    notice(th() ? 'กำลังเปิดไฟล์ PSD...' : 'Opening PSD...');
    run(psd.parse(file).then(r => { app.history?.clear(); app.history?.captureSnapshot('Open PSD'); return r; }), r => th() ? `เปิด PSD แล้ว: ${r.layers.length} เลเยอร์` : `PSD opened: ${r.layers.length} layers`);
  };
  app.openPsdFile = openPsd;

  document.getElementById('menu-open-psd')?.addEventListener('click', () => psdInput?.click());
  document.getElementById('menu-export-psd')?.addEventListener('click', () => run(psd.export(`${engine.docName.replace(/\.[^/.]+$/, '')}.psd`), r => th() ? `บันทึก ${r.filename} แล้ว (${r.layers} เลเยอร์)` : `${r.filename} saved (${r.layers} layers)`));
  psdInput?.addEventListener('change', e => { const file = e.target.files?.[0]; if (!file) return; openPsd(file); e.target.value = ''; });

  const openVideo = () => videoInput?.click();
  document.getElementById('menu-open-video')?.addEventListener('click', openVideo);
  document.getElementById('btn-video-open')?.addEventListener('click', openVideo);
  videoInput?.addEventListener('change', e => { const file = e.target.files?.[0]; if (!file) return; notice('Parsing video at 2 fps; each frame becomes a layer...'); run(video.importVideo(file, 2), r => `${r.frames} video frames loaded as layers (${r.backend})`); e.target.value = ''; });
  const exportVideo = format => run(video.export(format), result => `${result.filename} downloaded (${result.backend})`);
  document.getElementById('menu-export-video')?.addEventListener('click', () => exportVideo('mp4'));
  document.getElementById('menu-export-gif')?.addEventListener('click', () => exportVideo('gif'));
  document.getElementById('btn-video-export-mp4')?.addEventListener('click', () => exportVideo('mp4'));
  document.getElementById('btn-video-export-gif')?.addEventListener('click', () => exportVideo('gif'));

  const stage = document.getElementById('canvas-viewport');
  stage?.addEventListener('dragover', e => { e.preventDefault(); stage.classList.add('drop-active'); });
  stage?.addEventListener('dragleave', () => stage.classList.remove('drop-active'));
  stage?.addEventListener('drop', e => { e.preventDefault(); stage.classList.remove('drop-active'); const file = e.dataTransfer.files?.[0]; if (!file) return; if (/\.psd$/i.test(file.name)) { openPsd(file); } else if (/\.(mp4|webm|mkv|mov)$/i.test(file.name)) { notice('Parsing video at 2 fps...'); run(video.importVideo(file, 2), r => `${r.frames} video frames loaded as layers`); } });
  app.video = video;

  const featurePanel = document.getElementById('brush-panel');
  if (featurePanel) {
    featurePanel.insertAdjacentHTML('beforeend', '<hr><button class="secondary-btn" id="btn-smart-object">Convert Active Layer to Smart Object</button><label>Smart scale <input id="smart-scale" type="range" min="0.25" max="3" step="0.05" value="1"></label><select id="adjustment-type"><option value="curves">Curves</option><option value="levels">Levels</option><option value="hsl">HSL</option></select><button class="secondary-btn" id="btn-add-adjustment">Add Adjustment Layer</button><button class="secondary-btn" id="btn-add-style">Add Drop Shadow + Bevel</button>');
  }
  AdvancedBrushTool.bind(engine, app.tools); BrushPanel.bind(); SmartObjectPanel.bind(app); AdjustmentPanel.bind(app); LayerStylePanel.bind(app);
});

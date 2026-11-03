class LayerStylePanel { static bind(app) { document.getElementById('btn-add-style')?.addEventListener('dblclick', () => { const layer = app.engine.getActiveLayer(); if (!layer) return; layer.styles = layer.styles || {}; layer.styles.bevel = { enabled: true, size: 6, highlight: 'rgba(255,255,255,.5)' }; app.engine.render(); }); } }
window.LayerStylePanel = LayerStylePanel;

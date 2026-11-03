class BrushPanel { static bind() { const panel = document.getElementById('brush-panel'); if (!panel) return; panel.querySelectorAll('input').forEach(input => input.addEventListener('change', () => window.BrushEngine?.configure({ [input.dataset.brushKey]: Number(input.value) / 100 }))); } }
window.BrushPanel = BrushPanel;

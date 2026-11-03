class SmartObject {
  static create(layer, sourceName = layer.name) { layer.smartObject = { sourceName, sourceLayerId: layer.id, transform: { x: layer.x, y: layer.y, scaleX: 1, scaleY: 1, rotation: 0 }, filters: [], linked: false, revision: 1 }; layer.name = `SO · ${layer.name}`; return layer.smartObject; }
  static updateTransform(layer, transform) { if (!layer.smartObject) SmartObject.create(layer); Object.assign(layer.smartObject.transform, transform); layer.x = transform.x ?? layer.x; layer.y = transform.y ?? layer.y; layer.transform = { ...layer.smartObject.transform }; }
  static addFilter(layer, filter) { if (!layer.smartObject) SmartObject.create(layer); layer.smartObject.filters.push({ ...filter, id: `sf_${Date.now()}` }); }
}
window.SmartObject = SmartObject;

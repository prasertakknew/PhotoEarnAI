class ProjectManager {
  static attach(engine, registry) {
    const originalToJSON = engine.toJSON.bind(engine);
    engine.toJSON = () => {
      const project = originalToJSON();
      project.type = 'photoearnai-project';
      project.version = '1.1';
      project.extensions = registry.export();
      project.layers = project.layers.map((layer, index) => ({ ...layer, textData: engine.layers[index]?.textData || null }));
      return project;
    };
    const originalLoad = engine.loadFromJSON.bind(engine);
    engine.loadFromJSON = async (json) => {
      await originalLoad(json);
      if (json.extensions) {
        try { registry.import(json.extensions); } catch (error) { console.warn('Extension metadata skipped:', error); }
      }
      (json.layers || []).forEach((savedLayer, index) => {
        if (engine.layers[index] && savedLayer.textData) engine.layers[index].textData = savedLayer.textData;
      });
      engine.render();
      engine.emit('layerChange');
    };
  }
  static downloadJSON(engine) {
    const blob = new Blob([JSON.stringify(engine.toJSON(), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = engine.docName.replace(/\.[^/.]+$/, '') + '.photoearnai.json';
    link.click();
    URL.revokeObjectURL(url);
  }
}
window.ProjectManager = ProjectManager;

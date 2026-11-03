class I18n {
  static keyMap = {
    'File': ['เมนูไฟล์', 'File'], 'Edit': ['แก้ไข', 'Edit'], 'Image': ['รูปภาพ', 'Image'], 'Filter': ['ฟิลเตอร์', 'Filter'],
    'Layer': ['เลเยอร์', 'Layer'], 'View': ['มุมมอง', 'View'], 'Studio': ['สตูดิโอ', 'Studio'], 'Help': ['ช่วยเหลือ', 'Help'],
    'Layers': ['เลเยอร์', 'Layers'], 'History': ['ประวัติ', 'History'], 'Color': ['สี', 'Color'], 'Info': ['ข้อมูล', 'Info'],
    'New Project...': ['โปรเจกต์ใหม่...', 'New Project...'], 'Open Image...': ['เปิดรูปภาพ...', 'Open Image...'],
    'Save Project (.json)': ['บันทึกโปรเจกต์ (.json)', 'Save Project (.json)'], 'Export as PNG': ['ส่งออกเป็น PNG', 'Export as PNG'],
    'Export as JPG...': ['ส่งออกเป็น JPG...', 'Export as JPG...'], 'Close Document': ['ปิดเอกสาร', 'Close Document'],
    'Undo': ['เลิกทำ', 'Undo'], 'Redo': ['ทำซ้ำ', 'Redo'], 'Clear Active Layer': ['ล้างเลเยอร์ที่เลือก', 'Clear Active Layer'],
    'Fill with Foreground': ['เติมด้วยสีด้านหน้า', 'Fill with Foreground'], 'Brightness / Contrast...': ['ความสว่าง / คอนทราสต์...', 'Brightness / Contrast...'],
    'Invert': ['กลับสี', 'Invert'], 'Grayscale (Desaturate)': ['ขาวดำ (ลดความอิ่มสี)', 'Grayscale (Desaturate)'],
    'Sepia Vintage': ['ซีเปียวินเทจ', 'Sepia Vintage'], 'Gaussian Blur...': ['เบลอแบบเกาส์...', 'Gaussian Blur...'],
    'Sharpen': ['เพิ่มความคม', 'Sharpen'], 'Vignette': ['ขอบมืด', 'Vignette'], 'New Layer': ['เลเยอร์ใหม่', 'New Layer'],
    'Duplicate Layer': ['ทำสำเนาเลเยอร์', 'Duplicate Layer'], 'Delete Layer': ['ลบเลเยอร์', 'Delete Layer'],
    'Merge Down': ['รวมลงด้านล่าง', 'Merge Down'], 'Toggle Visibility': ['สลับการแสดงผล', 'Toggle Visibility'],
    'Zoom In': ['ซูมเข้า', 'Zoom In'], 'Zoom Out': ['ซูมออก', 'Zoom Out'], 'Fit to Screen': ['พอดีหน้าจอ', 'Fit to Screen'],
    '100% Actual Pixels': ['พิกเซลจริง 100%', '100% Actual Pixels'], 'Brush Tool': ['เครื่องมือแปรง', 'Brush Tool'],
    'Eraser Tool': ['เครื่องมือลบ', 'Eraser Tool'], 'Paint Bucket Tool': ['ถังสี', 'Paint Bucket Tool'],
    'Shape Tool': ['เครื่องมือรูปร่าง', 'Shape Tool'], 'Text Tool': ['เครื่องมือข้อความ', 'Text Tool'],
    'Eyedropper Tool': ['หลอดดูดสี', 'Eyedropper Tool'], 'Hand Tool': ['เครื่องมือมือ', 'Hand Tool'], 'Zoom Tool': ['เครื่องมือซูม', 'Zoom Tool'],
    'Fit': ['พอดี', 'Fit'], 'New Tool': ['เพิ่มเครื่องมือ', 'New Tool'], 'New Preset': ['เพิ่มพรีเซ็ต', 'New Preset'],
    'New Filter': ['เพิ่มฟิลเตอร์', 'New Filter'], 'Add Plug-in': ['เพิ่มปลั๊กอิน', 'Add Plug-in'], 'Add Font': ['เพิ่มฟอนต์', 'Add Font'],
    'Place Watermark / Logo': ['วางลายน้ำ / โลโก้', 'Place Watermark / Logo'], 'Edit Text Layer': ['แก้ไขเลเยอร์ข้อความ', 'Edit Text Layer'],
    'Extensions': ['ส่วนขยาย', 'Extensions'], 'Local-only': ['ใช้งานเฉพาะเครื่องนี้', 'Local-only'], 'English': ['English', 'English'], 'ไทย': ['ไทย', 'Thai'],
    'Open Studio': ['เปิดสตูดิโอ', 'Open Studio'], 'Apply': ['ใช้งาน', 'Apply'], 'Cancel': ['ยกเลิก', 'Cancel'],
    'Name': ['ชื่อ', 'Name'], 'Description': ['คำอธิบาย', 'Description'], 'Category': ['หมวดหมู่', 'Category'],
    'Save': ['บันทึก', 'Save'], 'Add': ['เพิ่ม', 'Add'], 'Upload': ['อัปโหลด', 'Upload'], 'Text': ['ข้อความ', 'Text'],
    'Font': ['ฟอนต์', 'Font'], 'Size': ['ขนาด', 'Size'], 'Color': ['สี', 'Color'], 'Weight': ['น้ำหนัก', 'Weight'],
    'Watermark settings': ['ตั้งค่าลายน้ำ', 'Watermark settings'], 'Plugin file': ['ไฟล์ปลั๊กอิน', 'Plugin file'],
    'Custom tools, presets, filters, fonts and plug-ins stay in this browser.': ['เครื่องมือ พรีเซ็ต ฟิลเตอร์ ฟอนต์ และปลั๊กอินที่เพิ่มเองจะอยู่ในเบราว์เซอร์นี้', 'Custom tools, presets, filters, fonts and plug-ins stay in this browser.']
  };
  static language = localStorage.getItem('photoearnai.language') || 'th';
  static translate(text) {
    const pair = I18n.keyMap[text];
    if (!pair) return text;
    return I18n.language === 'th' ? pair[0] : pair[1];
  }
  static setLanguage(language) {
    I18n.language = language === 'en' ? 'en' : 'th';
    localStorage.setItem('photoearnai.language', I18n.language);
    document.documentElement.lang = I18n.language === 'th' ? 'th' : 'en';
    I18n.refresh();
    window.dispatchEvent(new CustomEvent('photoearnai:language', { detail: I18n.language }));
  }
  static refresh() {
    // Never overwrite an element that wraps a control (e.g. a <label> around a slider):
    // setting textContent would delete the slider/select inside it.
    const hasControl = (el) => !!el.querySelector('input, select, button, textarea');
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      if (hasControl(el)) return;
      el.textContent = I18n.translate(el.dataset.i18n);
    });
    document.querySelectorAll('[data-i18n-title]').forEach((el) => {
      el.title = I18n.translate(el.dataset.i18nTitle);
    });
    document.querySelectorAll('.item-label').forEach((el) => {
      el.textContent = I18n.translate(el.dataset.i18n || el.textContent.trim());
    });
    document.querySelectorAll('.menu-btn, .tab-btn, .tool-option-group label, .layer-toolbar label, .info-group h4').forEach((el) => {
      if (hasControl(el)) return;
      const raw = el.dataset.i18n || el.textContent.trim().replace(/:$/, '');
      if (raw) el.dataset.i18n = raw;
      const translated = I18n.translate(raw);
      if (translated !== raw) el.textContent = translated;
    });
    const langButton = document.getElementById('language-toggle');
    if (langButton) langButton.textContent = I18n.language === 'th' ? 'EN' : 'ไทย';
  }
  static init() {
    document.querySelectorAll('.item-label').forEach((el) => { el.dataset.i18n = el.textContent.trim(); });
    document.querySelectorAll('.menu-btn, .tab-btn').forEach((el) => { el.dataset.i18n = el.textContent.trim(); });
    I18n.refresh();
    document.getElementById('language-toggle')?.addEventListener('click', () => I18n.setLanguage(I18n.language === 'th' ? 'en' : 'th'));
  }
}
window.PhotoEarnI18n = I18n;

/**
 * FilterEngine - Pixel manipulation routines operating on Layer ImageData.
 * High-performance TypedArray pixel algorithms matching Photopea filter operations.
 */
class FilterEngine {
  /**
   * Adjust Brightness and Contrast on active layer.
   * brightness: -100 to 100
   * contrast: -100 to 100
   */
  static applyBrightnessContrast(layer, brightness, contrast) {
    const ctx = layer.ctx;
    const imgData = ctx.getImageData(0, 0, layer.width, layer.height);
    const d = imgData.data;

    // Contrast factor: [-100..100] -> [0..2]
    const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));
    const bOffset = brightness * 2.55;

    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] === 0) continue; // Skip fully transparent pixels

      // Brightness then contrast
      let r = d[i] + bOffset;
      let g = d[i + 1] + bOffset;
      let b = d[i + 2] + bOffset;

      r = factor * (r - 128) + 128;
      g = factor * (g - 128) + 128;
      b = factor * (b - 128) + 128;

      d[i] = Math.max(0, Math.min(255, r));
      d[i + 1] = Math.max(0, Math.min(255, g));
      d[i + 2] = Math.max(0, Math.min(255, b));
    }

    ctx.putImageData(imgData, 0, 0);
  }

  /**
   * Invert colors (Photoshop Ctrl+I).
   */
  static applyInvert(layer) {
    const ctx = layer.ctx;
    const imgData = ctx.getImageData(0, 0, layer.width, layer.height);
    const d = imgData.data;

    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] === 0) continue;
      d[i] = 255 - d[i];
      d[i + 1] = 255 - d[i + 1];
      d[i + 2] = 255 - d[i + 2];
    }

    ctx.putImageData(imgData, 0, 0);
  }

  /**
   * Grayscale / Desaturate (Photoshop Ctrl+Shift+U).
   */
  static applyGrayscale(layer) {
    const ctx = layer.ctx;
    const imgData = ctx.getImageData(0, 0, layer.width, layer.height);
    const d = imgData.data;

    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] === 0) continue;
      // Standard luminance weights (ITU-R BT.601)
      const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      d[i] = lum;
      d[i + 1] = lum;
      d[i + 2] = lum;
    }

    ctx.putImageData(imgData, 0, 0);
  }

  /**
   * Sepia tone vintage filter.
   */
  static applySepia(layer) {
    const ctx = layer.ctx;
    const imgData = ctx.getImageData(0, 0, layer.width, layer.height);
    const d = imgData.data;

    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] === 0) continue;
      const r = d[i], g = d[i + 1], b = d[i + 2];
      d[i] = Math.min(255, (r * 0.393) + (g * 0.769) + (b * 0.189));
      d[i + 1] = Math.min(255, (r * 0.349) + (g * 0.686) + (b * 0.168));
      d[i + 2] = Math.min(255, (r * 0.272) + (g * 0.534) + (b * 0.131));
    }

    ctx.putImageData(imgData, 0, 0);
  }

  /**
   * Fast Separable Gaussian / Box Blur.
   */
  static applyBlur(layer, radius = 4) {
    const ctx = layer.ctx;
    const w = layer.width;
    const h = layer.height;
    const imgData = ctx.getImageData(0, 0, w, h);
    const src = imgData.data;
    const target = new Uint8ClampedArray(src.length);

    radius = Math.round(radius);
    if (radius < 1) return;

    // Horizontal pass
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let r = 0, g = 0, b = 0, a = 0, count = 0;
        for (let kx = -radius; kx <= radius; kx++) {
          const px = Math.min(w - 1, Math.max(0, x + kx));
          const idx = (y * w + px) * 4;
          r += src[idx];
          g += src[idx + 1];
          b += src[idx + 2];
          a += src[idx + 3];
          count++;
        }
        const outIdx = (y * w + x) * 4;
        target[outIdx] = r / count;
        target[outIdx + 1] = g / count;
        target[outIdx + 2] = b / count;
        target[outIdx + 3] = a / count;
      }
    }

    // Vertical pass back into src
    for (let x = 0; x < w; x++) {
      for (let y = 0; y < h; y++) {
        let r = 0, g = 0, b = 0, a = 0, count = 0;
        for (let ky = -radius; ky <= radius; ky++) {
          const py = Math.min(h - 1, Math.max(0, y + ky));
          const idx = (py * w + x) * 4;
          r += target[idx];
          g += target[idx + 1];
          b += target[idx + 2];
          a += target[idx + 3];
          count++;
        }
        const outIdx = (y * w + x) * 4;
        src[outIdx] = r / count;
        src[outIdx + 1] = g / count;
        src[outIdx + 2] = b / count;
        src[outIdx + 3] = a / count;
      }
    }

    ctx.putImageData(imgData, 0, 0);
  }

  /**
   * Sharpen filter using a 3x3 convolution kernel.
   */
  static applySharpen(layer) {
    const ctx = layer.ctx;
    const w = layer.width;
    const h = layer.height;
    const imgData = ctx.getImageData(0, 0, w, h);
    const src = imgData.data;
    const out = new Uint8ClampedArray(src.length);

    // Kernel:
    // [  0, -1,  0 ]
    // [ -1,  5, -1 ]
    // [  0, -1,  0 ]
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4;
        out[idx + 3] = src[idx + 3]; // preserve alpha

        if (x === 0 || x === w - 1 || y === 0 || y === h - 1) {
          out[idx] = src[idx];
          out[idx + 1] = src[idx + 1];
          out[idx + 2] = src[idx + 2];
          continue;
        }

        for (let c = 0; c < 3; c++) {
          const top = src[((y - 1) * w + x) * 4 + c];
          const bottom = src[((y + 1) * w + x) * 4 + c];
          const left = src[(y * w + (x - 1)) * 4 + c];
          const right = src[(y * w + (x + 1)) * 4 + c];
          const center = src[idx + c];

          const val = 5 * center - top - bottom - left - right;
          out[idx + c] = Math.max(0, Math.min(255, val));
        }
      }
    }

    imgData.data.set(out);
    ctx.putImageData(imgData, 0, 0);
  }

  /**
   * Vignette effect around canvas border.
   */
  static applyVignette(layer) {
    const ctx = layer.ctx;
    const cx = layer.width / 2;
    const cy = layer.height / 2;
    const radius = Math.sqrt(cx * cx + cy * cy);

    const grad = ctx.createRadialGradient(cx, cy, radius * 0.35, cx, cy, radius);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.65)');

    ctx.save();
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, layer.width, layer.height);
    ctx.restore();
  }

  // ---- Tone adjustments & filter gallery (from the uploaded photopea-clone archive) ----
  /**
   * Levels Tone Adjustment (Photoshop Ctrl+L)
   */
  static applyLevels(layer, inBlack = 0, inGamma = 1.0, inWhite = 255, outBlack = 0, outWhite = 255) {
    const ctx = layer.ctx;
    const imgData = ctx.getImageData(0, 0, layer.width, layer.height);
    const d = imgData.data;

    inBlack = Math.max(0, Math.min(254, inBlack));
    inWhite = Math.max(inBlack + 1, Math.min(255, inWhite));
    inGamma = Math.max(0.1, Math.min(10.0, inGamma));
    const inRange = inWhite - inBlack;
    const outRange = outWhite - outBlack;
    const invGamma = 1.0 / inGamma;

    // Precalculate 256-entry lookup table for speed
    const lut = new Uint8ClampedArray(256);
    for (let i = 0; i < 256; i++) {
      let v = (Math.max(inBlack, Math.min(inWhite, i)) - inBlack) / inRange;
      v = Math.pow(v, invGamma);
      lut[i] = Math.max(0, Math.min(255, outBlack + v * outRange));
    }

    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] === 0) continue;
      d[i] = lut[d[i]];
      d[i + 1] = lut[d[i + 1]];
      d[i + 2] = lut[d[i + 2]];
    }

    ctx.putImageData(imgData, 0, 0);
  }

  /**
   * Curves Tone Mapping with 256-entry curve lookup table
   */
  static applyCurves(layer, lut) {
    if (!lut || lut.length !== 256) return;
    const ctx = layer.ctx;
    const imgData = ctx.getImageData(0, 0, layer.width, layer.height);
    const d = imgData.data;

    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] === 0) continue;
      d[i] = lut[d[i]];
      d[i + 1] = lut[d[i + 1]];
      d[i + 2] = lut[d[i + 2]];
    }

    ctx.putImageData(imgData, 0, 0);
  }

  /**
   * Hue / Saturation / Lightness (Photoshop Ctrl+U)
   */
  static applyHueSaturation(layer, hueDelta = 0, satDelta = 0, lightDelta = 0, colorize = false) {
    const ctx = layer.ctx;
    const imgData = ctx.getImageData(0, 0, layer.width, layer.height);
    const d = imgData.data;

    const hOffset = (hueDelta % 360) / 360;
    const sFactor = (satDelta + 100) / 100;
    const lFactor = (lightDelta + 100) / 100;

    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] === 0) continue;
      let r = d[i] / 255;
      let g = d[i + 1] / 255;
      let b = d[i + 2] / 255;

      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      let h = 0, s = 0, l = (max + min) / 2;

      if (max !== min) {
        const delta = max - min;
        s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);
        switch (max) {
          case r: h = (g - b) / delta + (g < b ? 6 : 0); break;
          case g: h = (b - r) / delta + 2; break;
          case b: h = (r - g) / delta + 4; break;
        }
        h /= 6;
      }

      if (colorize) {
        h = (hueDelta % 360) / 360;
        if (h < 0) h += 1;
        s = Math.max(0, Math.min(1, Math.max(0.1, satDelta / 100)));
        l = Math.max(0, Math.min(1, l * lFactor));
      } else {
        h = (h + hOffset) % 1;
        if (h < 0) h += 1;
        s = Math.max(0, Math.min(1, s * sFactor));
        l = Math.max(0, Math.min(1, l * lFactor));
      }

      // Convert HSL back to RGB
      if (s === 0) {
        r = g = b = l;
      } else {
        const hue2rgb = (p, q, t) => {
          if (t < 0) t += 1;
          if (t > 1) t -= 1;
          if (t < 1/6) return p + (q - p) * 6 * t;
          if (t < 1/2) return q;
          if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
          return p;
        };
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        r = hue2rgb(p, q, h + 1/3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1/3);
      }

      d[i] = Math.round(r * 255);
      d[i + 1] = Math.round(g * 255);
      d[i + 2] = Math.round(b * 255);
    }

    ctx.putImageData(imgData, 0, 0);
  }

  /**
   * Color Balance (Cyan/Red, Magenta/Green, Yellow/Blue)
   */
  static applyColorBalance(layer, cr = 0, mg = 0, yb = 0) {
    const ctx = layer.ctx;
    const imgData = ctx.getImageData(0, 0, layer.width, layer.height);
    const d = imgData.data;

    const rShift = cr * 1.25;
    const gShift = mg * 1.25;
    const bShift = yb * 1.25;

    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] === 0) continue;
      d[i] = Math.max(0, Math.min(255, d[i] + rShift));
      d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + gShift));
      d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + bShift));
    }

    ctx.putImageData(imgData, 0, 0);
  }

  /**
   * Binary Threshold
   */
  static applyThreshold(layer, threshold = 128) {
    const ctx = layer.ctx;
    const imgData = ctx.getImageData(0, 0, layer.width, layer.height);
    const d = imgData.data;

    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] === 0) continue;
      const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      const val = lum >= threshold ? 255 : 0;
      d[i] = val;
      d[i + 1] = val;
      d[i + 2] = val;
    }

    ctx.putImageData(imgData, 0, 0);
  }

  /**
   * Posterize (reduces color tonal steps per channel)
   */
  static applyPosterize(layer, levels = 4) {
    levels = Math.max(2, Math.min(32, Math.round(levels)));
    const step = 255 / (levels - 1);
    const ctx = layer.ctx;
    const imgData = ctx.getImageData(0, 0, layer.width, layer.height);
    const d = imgData.data;

    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] === 0) continue;
      d[i] = Math.round(Math.round(d[i] / step) * step);
      d[i + 1] = Math.round(Math.round(d[i + 1] / step) * step);
      d[i + 2] = Math.round(Math.round(d[i + 2] / step) * step);
    }

    ctx.putImageData(imgData, 0, 0);
  }

  /**
   * Motion Blur with angle and distance
   */
  static applyMotionBlur(layer, angleDeg = 0, distance = 12) {
    const ctx = layer.ctx;
    const w = layer.width;
    const h = layer.height;
    const imgData = ctx.getImageData(0, 0, w, h);
    const src = imgData.data;
    const out = new Uint8ClampedArray(src.length);

    distance = Math.max(1, Math.min(60, Math.round(distance)));
    const rad = (angleDeg * Math.PI) / 180;
    const dx = Math.cos(rad);
    const dy = Math.sin(rad);
    const steps = distance * 2 + 1;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let r = 0, g = 0, b = 0, a = 0, count = 0;
        for (let s = -distance; s <= distance; s++) {
          const sampleX = Math.round(Math.min(w - 1, Math.max(0, x + s * dx)));
          const sampleY = Math.round(Math.min(h - 1, Math.max(0, y + s * dy)));
          const sIdx = (sampleY * w + sampleX) * 4;
          r += src[sIdx];
          g += src[sIdx + 1];
          b += src[sIdx + 2];
          a += src[sIdx + 3];
          count++;
        }
        const oIdx = (y * w + x) * 4;
        out[oIdx] = r / count;
        out[oIdx + 1] = g / count;
        out[oIdx + 2] = b / count;
        out[oIdx + 3] = a / count;
      }
    }

    imgData.data.set(out);
    ctx.putImageData(imgData, 0, 0);
  }

  /**
   * Radial / Spin Blur
   */
  static applyRadialBlur(layer, amount = 10) {
    const ctx = layer.ctx;
    const w = layer.width;
    const h = layer.height;
    const cx = w / 2;
    const cy = h / 2;
    const imgData = ctx.getImageData(0, 0, w, h);
    const src = imgData.data;
    const out = new Uint8ClampedArray(src.length);

    const steps = 10;
    const maxAngle = (amount * Math.PI) / 180 / 10;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const relX = x - cx;
        const relY = y - cy;
        const dist = Math.sqrt(relX * relX + relY * relY);
        const baseAngle = Math.atan2(relY, relX);

        let r = 0, g = 0, b = 0, a = 0;
        for (let s = -steps; s <= steps; s++) {
          const ang = baseAngle + (s / steps) * maxAngle;
          const sx = Math.round(Math.min(w - 1, Math.max(0, cx + Math.cos(ang) * dist)));
          const sy = Math.round(Math.min(h - 1, Math.max(0, cy + Math.sin(ang) * dist)));
          const sIdx = (sy * w + sx) * 4;
          r += src[sIdx];
          g += src[sIdx + 1];
          b += src[sIdx + 2];
          a += src[sIdx + 3];
        }
        const total = steps * 2 + 1;
        const oIdx = (y * w + x) * 4;
        out[oIdx] = r / total;
        out[oIdx + 1] = g / total;
        out[oIdx + 2] = b / total;
        out[oIdx + 3] = a / total;
      }
    }

    imgData.data.set(out);
    ctx.putImageData(imgData, 0, 0);
  }

  /**
   * Pixelate / Mosaic Filter
   */
  static applyMosaic(layer, blockSize = 12) {
    blockSize = Math.max(2, Math.min(64, Math.round(blockSize)));
    const ctx = layer.ctx;
    const w = layer.width;
    const h = layer.height;
    const imgData = ctx.getImageData(0, 0, w, h);
    const d = imgData.data;

    for (let by = 0; by < h; by += blockSize) {
      for (let bx = 0; bx < w; bx += blockSize) {
        const bw = Math.min(blockSize, w - bx);
        const bh = Math.min(blockSize, h - by);

        let r = 0, g = 0, b = 0, a = 0, count = 0;
        for (let y = 0; y < bh; y++) {
          for (let x = 0; x < bw; x++) {
            const idx = ((by + y) * w + (bx + x)) * 4;
            r += d[idx];
            g += d[idx + 1];
            b += d[idx + 2];
            a += d[idx + 3];
            count++;
          }
        }
        const avgR = r / count;
        const avgG = g / count;
        const avgB = b / count;
        const avgA = a / count;

        for (let y = 0; y < bh; y++) {
          for (let x = 0; x < bw; x++) {
            const idx = ((by + y) * w + (bx + x)) * 4;
            d[idx] = avgR;
            d[idx + 1] = avgG;
            d[idx + 2] = avgB;
            d[idx + 3] = avgA;
          }
        }
      }
    }

    ctx.putImageData(imgData, 0, 0);
  }

  /**
   * Add Noise Filter (Uniform / Gaussian)
   */
  static applyNoise(layer, amount = 20, gaussian = false, monochromatic = true) {
    const ctx = layer.ctx;
    const imgData = ctx.getImageData(0, 0, layer.width, layer.height);
    const d = imgData.data;
    const factor = amount * 1.5;

    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] === 0) continue;

      let nR, nG, nB;
      if (gaussian) {
        // Box-Muller transform
        const u1 = Math.random() || 0.0001;
        const u2 = Math.random() || 0.0001;
        const norm = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
        nR = norm * factor;
        const g2 = () => Math.sqrt(-2.0 * Math.log(Math.random() || 0.0001)) * Math.cos(2.0 * Math.PI * Math.random());
        nG = monochromatic ? nR : g2() * factor;
        nB = monochromatic ? nR : g2() * factor;
      } else {
        nR = (Math.random() * 2 - 1) * factor;
        nG = monochromatic ? nR : (Math.random() * 2 - 1) * factor;
        nB = monochromatic ? nR : (Math.random() * 2 - 1) * factor;
      }

      d[i] = Math.max(0, Math.min(255, d[i] + nR));
      d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + nG));
      d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + nB));
    }

    ctx.putImageData(imgData, 0, 0);
  }

  /**
   * High Pass filter: isolates high-frequency texture/edges
   */
  static applyHighPass(layer, radius = 4) {
    const ctx = layer.ctx;
    const w = layer.width;
    const h = layer.height;
    const origData = ctx.getImageData(0, 0, w, h);
    const orig = new Uint8ClampedArray(origData.data);

    // Apply blur to get low frequencies
    FilterEngine.applyBlur(layer, radius);
    const blurred = ctx.getImageData(0, 0, w, h).data;

    // HighPass = Original - Blurred + 128
    for (let i = 0; i < orig.length; i += 4) {
      if (orig[i + 3] === 0) continue;
      origData.data[i] = Math.max(0, Math.min(255, orig[i] - blurred[i] + 128));
      origData.data[i + 1] = Math.max(0, Math.min(255, orig[i + 1] - blurred[i + 1] + 128));
      origData.data[i + 2] = Math.max(0, Math.min(255, orig[i + 2] - blurred[i + 2] + 128));
      origData.data[i + 3] = orig[i + 3];
    }

    ctx.putImageData(origData, 0, 0);
  }

  /**
   * Emboss filter
   */
  static applyEmboss(layer) {
    const ctx = layer.ctx;
    const w = layer.width;
    const h = layer.height;
    const imgData = ctx.getImageData(0, 0, w, h);
    const src = imgData.data;
    const out = new Uint8ClampedArray(src.length);

    // Emboss kernel:
    // [-2, -1,  0]
    // [-1,  1,  1]
    // [ 0,  1,  2]
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const idx = (y * w + x) * 4;
        out[idx + 3] = src[idx + 3];

        for (let c = 0; c < 3; c++) {
          const tl = src[((y - 1) * w + (x - 1)) * 4 + c];
          const tm = src[((y - 1) * w + x) * 4 + c];
          const ml = src[(y * w + (x - 1)) * 4 + c];
          const mm = src[idx + c];
          const mr = src[(y * w + (x + 1)) * 4 + c];
          const bm = src[((y + 1) * w + x) * 4 + c];
          const br = src[((y + 1) * w + (x + 1)) * 4 + c];

          const val = -2 * tl - tm - ml + mm + mr + bm + 2 * br + 128;
          out[idx + c] = Math.max(0, Math.min(255, val));
        }
      }
    }

    imgData.data.set(out);
    ctx.putImageData(imgData, 0, 0);
  }

  /**
   * Find Edges / Sobel filter
   */
  static applyFindEdges(layer) {
    const ctx = layer.ctx;
    const w = layer.width;
    const h = layer.height;
    const imgData = ctx.getImageData(0, 0, w, h);
    const src = imgData.data;
    const out = new Uint8ClampedArray(src.length);

    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const idx = (y * w + x) * 4;
        out[idx + 3] = src[idx + 3];

        for (let c = 0; c < 3; c++) {
          const tl = src[((y - 1) * w + (x - 1)) * 4 + c];
          const tc = src[((y - 1) * w + x) * 4 + c];
          const tr = src[((y - 1) * w + (x + 1)) * 4 + c];
          const ml = src[(y * w + (x - 1)) * 4 + c];
          const mr = src[(y * w + (x + 1)) * 4 + c];
          const bl = src[((y + 1) * w + (x - 1)) * 4 + c];
          const bc = src[((y + 1) * w + x) * 4 + c];
          const br = src[((y + 1) * w + (x + 1)) * 4 + c];

          const gx = -tl - 2 * ml - bl + tr + 2 * mr + br;
          const gy = -tl - 2 * tc - tr + bl + 2 * bc + br;
          const mag = Math.sqrt(gx * gx + gy * gy);
          out[idx + c] = Math.max(0, Math.min(255, mag));
        }
      }
    }

    imgData.data.set(out);
    ctx.putImageData(imgData, 0, 0);
  }
}

window.FilterEngine = FilterEngine;

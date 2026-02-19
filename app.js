(() => {
  'use strict';

  const LOGICAL_WIDTH = 160;
  const LOGICAL_HEIGHT = 180;
  const ASPECT_HEIGHTS = {
    '16:9': 135,
    '4:3': 180,
    '1:1': 240,
  };

  const BAYER_4 = [
    [0, 8, 2, 10],
    [12, 4, 14, 6],
    [3, 11, 1, 9],
    [15, 7, 13, 5],
  ];

  const BAYER_8 = [
    [0, 48, 12, 60, 3, 51, 15, 63],
    [32, 16, 44, 28, 35, 19, 47, 31],
    [8, 56, 4, 52, 11, 59, 7, 55],
    [40, 24, 36, 20, 43, 27, 39, 23],
    [2, 50, 14, 62, 1, 49, 13, 61],
    [34, 18, 46, 30, 33, 17, 45, 29],
    [10, 58, 6, 54, 9, 57, 5, 53],
    [42, 26, 38, 22, 41, 25, 37, 21],
  ];

  const PRESETS = {
    neon: {
      label: 'VCS NEON (Cyan/Magenta/Yellow)',
      palette: ['#000000', '#ffffff', '#1e00ff', '#00e5ff', '#ff00b3', '#ffd400', '#7a00ff', '#00ff6a', '#ff2a00', '#ff6a00', '#00a2ff', '#2b2b2b', '#6b6b6b', '#00ffd4', '#ff4df0', '#ffe86b'],
      settings: {
        scaleX: 6,
        scaleY: 4,
        ditherMatrix: 8,
        ditherEnabled: true,
        ditherStrength: 0.65,
        bleedEnabled: true,
        bleedStrength: 0.35,
        scanlineEnabled: true,
        scanlineStrength: 0.22,
        jitterEnabled: true,
        jitterStrength: 0.1,
        perScanlineColorLimit: 4,
        autoClampColors: true,
      },
    },
    rune: {
      label: 'RUNE BLUE/RED (Cinematic)',
      palette: ['#000000', '#ffffff', '#001a8f', '#003bff', '#00c8ff', '#6b00ff', '#ff0050', '#ff2a00', '#ffb000', '#7bff00', '#1a6b00', '#4a2a00', '#2a2a2a', '#6a6aff', '#ff7ab8', '#ffe0a8'],
      settings: {
        scaleX: 6,
        scaleY: 4,
        ditherMatrix: 4,
        ditherEnabled: true,
        ditherStrength: 0.45,
        bleedEnabled: true,
        bleedStrength: 0.28,
        scanlineEnabled: true,
        scanlineStrength: 0.18,
        jitterEnabled: true,
        jitterStrength: 0.06,
        perScanlineColorLimit: 5,
        autoClampColors: true,
      },
    },
    et: {
      label: 'E.T PURPLE SKY (Noisy Horizon)',
      palette: ['#000000', '#ffffff', '#2b004f', '#5a00d6', '#8a00ff', '#ff2a00', '#ff6a00', '#ffd400', '#7bff00', '#2b7a00', '#005a2b', '#00e5ff', '#0046ff', '#2b2b2b', '#6b6b6b', '#b58cff'],
      settings: {
        scaleX: 6,
        scaleY: 4,
        ditherMatrix: 8,
        ditherEnabled: true,
        ditherStrength: 0.75,
        bleedEnabled: true,
        bleedStrength: 0.4,
        scanlineEnabled: true,
        scanlineStrength: 0.25,
        jitterEnabled: true,
        jitterStrength: 0.12,
        perScanlineColorLimit: 4,
        autoClampColors: true,
      },
    },
  };

  const state = {
    width: LOGICAL_WIDTH,
    height: LOGICAL_HEIGHT,
    pixels: new Uint8Array(LOGICAL_WIDTH * LOGICAL_HEIGHT),
    paletteHex: [],
    paletteRgb: [],
    settings: null,
    selectedColor: 3,
    tool: 'pen',
    penSize: 1,
    isDrawing: false,
    previousCell: null,
    activePreset: 'neon',
    canvasAspect: '4:3',
    needsRender: true,
    history: [],
    future: [],
    maxHistory: 80,
    didMutate: false,
    actionDepth: 0,
  };

  const ui = {
    displayCanvas: document.getElementById('displayCanvas'),
    palette: document.getElementById('palette'),
    presetSelect: document.getElementById('presetSelect'),
    canvasAspectSelect: document.getElementById('canvasAspectSelect'),
    toolSelect: document.getElementById('toolSelect'),
    penSize: document.getElementById('penSize'),
    undoBtn: document.getElementById('undoBtn'),
    redoBtn: document.getElementById('redoBtn'),
    ditherEnabled: document.getElementById('ditherEnabled'),
    bleedEnabled: document.getElementById('bleedEnabled'),
    scanlineEnabled: document.getElementById('scanlineEnabled'),
    jitterEnabled: document.getElementById('jitterEnabled'),
    ditherStrength: document.getElementById('ditherStrength'),
    bleedStrength: document.getElementById('bleedStrength'),
    scanlineStrength: document.getElementById('scanlineStrength'),
    jitterStrength: document.getElementById('jitterStrength'),
    ditherValue: document.getElementById('ditherValue'),
    bleedValue: document.getElementById('bleedValue'),
    scanlineValue: document.getElementById('scanlineValue'),
    jitterValue: document.getElementById('jitterValue'),
    lineColorLimit: document.getElementById('lineColorLimit'),
    autoClamp: document.getElementById('autoClamp'),
    lineWarning: document.getElementById('lineWarning'),
    clearBtn: document.getElementById('clearBtn'),
    exportBtn: document.getElementById('exportBtn'),
    exportMode: document.getElementById('exportMode'),
    saveBtn: document.getElementById('saveBtn'),
    loadInput: document.getElementById('loadInput'),
  };

  const displayCtx = ui.displayCanvas.getContext('2d');
  const offscreenCanvas = document.createElement('canvas');
  const offscreenCtx = offscreenCanvas.getContext('2d');

  const isFormFocus = () => {
    const active = document.activeElement;
    return active && /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName);
  };

  function parseHexColor(hex) {
    const clean = hex.replace('#', '');
    return {
      r: parseInt(clean.substring(0, 2), 16),
      g: parseInt(clean.substring(2, 4), 16),
      b: parseInt(clean.substring(4, 6), 16),
    };
  }

  function deepCloneSettings(settings) {
    return JSON.parse(JSON.stringify(settings));
  }

  function updateUndoRedoUI() {
    ui.undoBtn.disabled = state.history.length === 0;
    ui.redoBtn.disabled = state.future.length === 0;
  }

  function beginAction() {
    if (state.actionDepth > 0) return;
    state.actionDepth = 1;
    state.didMutate = false;
    state.history.push(state.pixels.slice());
    state.future.length = 0;
    if (state.history.length > state.maxHistory) state.history.shift();
    updateUndoRedoUI();
  }

  function endAction() {
    if (state.actionDepth === 0) return;
    state.actionDepth = 0;
    if (!state.didMutate) {
      state.history.pop();
    } else {
      scheduleRender();
    }
    updateUndoRedoUI();
  }

  function undo() {
    if (state.history.length === 0) return;
    state.future.push(state.pixels.slice());
    state.pixels = state.history.pop();
    scheduleRender();
    updateUndoRedoUI();
  }

  function redo() {
    if (state.future.length === 0) return;
    state.history.push(state.pixels.slice());
    state.pixels = state.future.pop();
    scheduleRender();
    updateUndoRedoUI();
  }

  function applyPreset(presetId, clearPixels = false) {
    const preset = PRESETS[presetId];
    if (!preset) return;
    state.activePreset = presetId;
    state.paletteHex = [...preset.palette];
    state.paletteRgb = state.paletteHex.map(parseHexColor);
    state.settings = deepCloneSettings(preset.settings);
    state.settings.scaleX = 6;
    state.settings.scaleY = 4;
    if (clearPixels) state.pixels.fill(0);
    syncUIFromState();
    resizeDisplayCanvas();
    renderPalette();
    scheduleRender();
  }

  function syncUIFromState() {
    const s = state.settings;
    ui.presetSelect.value = state.activePreset;
    ui.canvasAspectSelect.value = state.canvasAspect;
    ui.toolSelect.value = state.tool;
    ui.penSize.value = String(state.penSize);
    ui.ditherEnabled.checked = s.ditherEnabled;
    ui.bleedEnabled.checked = s.bleedEnabled;
    ui.scanlineEnabled.checked = s.scanlineEnabled;
    ui.jitterEnabled.checked = s.jitterEnabled;
    ui.ditherStrength.value = s.ditherStrength;
    ui.bleedStrength.value = s.bleedStrength;
    ui.scanlineStrength.value = s.scanlineStrength;
    ui.jitterStrength.value = s.jitterStrength;
    ui.lineColorLimit.value = s.perScanlineColorLimit;
    ui.autoClamp.checked = s.autoClampColors;
    ui.ditherValue.textContent = Number(s.ditherStrength).toFixed(2);
    ui.bleedValue.textContent = Number(s.bleedStrength).toFixed(2);
    ui.scanlineValue.textContent = Number(s.scanlineStrength).toFixed(2);
    ui.jitterValue.textContent = Number(s.jitterStrength).toFixed(2);
  }

  function resizeDisplayCanvas() {
    const { scaleX, scaleY } = state.settings;
    ui.displayCanvas.width = state.width * scaleX;
    ui.displayCanvas.height = state.height * scaleY;
    ui.displayCanvas.style.width = `${ui.displayCanvas.width}px`;
    ui.displayCanvas.style.height = `${ui.displayCanvas.height}px`;
    displayCtx.imageSmoothingEnabled = false;

    offscreenCanvas.width = state.width;
    offscreenCanvas.height = state.height;
    offscreenCtx.imageSmoothingEnabled = false;
  }

  function renderPalette() {
    ui.palette.innerHTML = '';
    state.paletteHex.forEach((color, index) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'palette-chip';
      chip.style.background = color;
      chip.title = `${index}: ${color}`;
      if (index === state.selectedColor) chip.classList.add('active');
      chip.addEventListener('click', () => {
        state.selectedColor = index;
        renderPalette();
      });
      ui.palette.appendChild(chip);
    });
  }

  function scheduleRender() {
    state.needsRender = true;
  }

  const getPixelIndex = (x, y) => y * state.width + x;

  function setPixel(x, y, colorIndex) {
    if (x < 0 || y < 0 || x >= state.width || y >= state.height) return;
    const idx = getPixelIndex(x, y);
    if (state.pixels[idx] === colorIndex) return;
    state.pixels[idx] = colorIndex;
    state.didMutate = true;
  }

  function paintBrush(cx, cy, colorIndex) {
    const size = state.penSize;
    const half = Math.floor(size / 2);
    for (let y = cy - half; y < cy - half + size; y += 1) {
      for (let x = cx - half; x < cx - half + size; x += 1) {
        setPixel(x, y, colorIndex);
      }
    }
  }

  function rasterLine(x0, y0, x1, y1, painter) {
    let dx = Math.abs(x1 - x0);
    let dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    while (true) {
      painter(x0, y0);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 > -dy) {
        err -= dy;
        x0 += sx;
      }
      if (e2 < dx) {
        err += dx;
        y0 += sy;
      }
    }
  }

  function floodFill(startX, startY, targetColor, replacementColor) {
    if (targetColor === replacementColor) return;
    const stack = [[startX, startY]];
    while (stack.length > 0) {
      const [x, y] = stack.pop();
      if (x < 0 || y < 0 || x >= state.width || y >= state.height) continue;
      const idx = getPixelIndex(x, y);
      if (state.pixels[idx] !== targetColor) continue;
      state.pixels[idx] = replacementColor;
      state.didMutate = true;
      stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
  }

  function clearPixels(colorIndex = 0) {
    for (let i = 0; i < state.pixels.length; i += 1) {
      if (state.pixels[i] !== colorIndex) {
        state.pixels[i] = colorIndex;
        state.didMutate = true;
      }
    }
  }

  function screenToCell(clientX, clientY) {
    const rect = ui.displayCanvas.getBoundingClientRect();
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    const x = Math.floor((px / rect.width) * state.width);
    const y = Math.floor((py / rect.height) * state.height);
    return {
      x: Math.max(0, Math.min(state.width - 1, x)),
      y: Math.max(0, Math.min(state.height - 1, y)),
    };
  }

  function applyToolAt(x, y) {
    const color = state.tool === 'eraser' ? 0 : state.selectedColor;
    paintBrush(x, y, color);
  }

  function setBodyScrollLock(locked) {
    document.body.style.overflow = locked ? 'hidden' : '';
  }

  function handlePointerDown(event) {
    event.preventDefault();
    ui.displayCanvas.setPointerCapture(event.pointerId);
    const cell = screenToCell(event.clientX, event.clientY);

    if (state.tool === 'bucket') {
      beginAction();
      const target = state.pixels[getPixelIndex(cell.x, cell.y)];
      const replacement = state.selectedColor;
      floodFill(cell.x, cell.y, target, replacement);
      endAction();
      return;
    }

    beginAction();
    state.isDrawing = true;
    setBodyScrollLock(true);
    state.previousCell = cell;
    applyToolAt(cell.x, cell.y);
    scheduleRender();
  }

  function handlePointerMove(event) {
    if (state.isDrawing) event.preventDefault();
    if (!state.isDrawing) return;
    const cell = screenToCell(event.clientX, event.clientY);
    const prev = state.previousCell;
    const color = state.tool === 'eraser' ? 0 : state.selectedColor;

    if (!prev) {
      paintBrush(cell.x, cell.y, color);
      state.previousCell = cell;
      scheduleRender();
      return;
    }

    rasterLine(prev.x, prev.y, cell.x, cell.y, (x, y) => paintBrush(x, y, color));
    state.previousCell = cell;
    scheduleRender();
  }

  function handlePointerUp(event) {
    event.preventDefault();
    if (ui.displayCanvas.hasPointerCapture(event.pointerId)) {
      ui.displayCanvas.releasePointerCapture(event.pointerId);
    }
    if (state.isDrawing) {
      endAction();
    }
    state.isDrawing = false;
    state.previousCell = null;
    setBodyScrollLock(false);
  }

  function resizeLogicalCanvas(newHeight) {
    if (newHeight === state.height) return;
    beginAction();
    const newPixels = new Uint8Array(LOGICAL_WIDTH * newHeight);
    const overlapW = Math.min(state.width, LOGICAL_WIDTH);
    const overlapH = Math.min(state.height, newHeight);

    for (let y = 0; y < overlapH; y += 1) {
      for (let x = 0; x < overlapW; x += 1) {
        const oldIdx = y * state.width + x;
        const newIdx = y * LOGICAL_WIDTH + x;
        const value = state.pixels[oldIdx];
        newPixels[newIdx] = value;
        if (value !== 0 && oldIdx !== newIdx) state.didMutate = true;
      }
    }

    if (state.height !== newHeight) state.didMutate = true;
    state.width = LOGICAL_WIDTH;
    state.height = newHeight;
    state.pixels = newPixels;
    resizeDisplayCanvas();
    endAction();
  }

  function buildColorMapWithConstraints() {
    const out = new Uint8Array(state.pixels);
    const warningLines = [];
    const limit = Number(state.settings.perScanlineColorLimit);

    for (let y = 0; y < state.height; y += 1) {
      const used = new Set();
      const overflow = [];

      for (let x = 0; x < state.width; x += 1) {
        const idx = getPixelIndex(x, y);
        const color = out[idx];
        if (!used.has(color)) {
          if (used.size < limit) used.add(color);
          else overflow.push(idx);
        }
      }

      if (overflow.length > 0) {
        if (state.settings.autoClampColors) {
          const allowed = Array.from(used.values());
          overflow.forEach((idx) => {
            const original = state.paletteRgb[out[idx]];
            let bestColor = allowed[0];
            let bestDist = Infinity;
            allowed.forEach((candidate) => {
              const c = state.paletteRgb[candidate];
              const dist = (c.r - original.r) ** 2 + (c.g - original.g) ** 2 + (c.b - original.b) ** 2;
              if (dist < bestDist) {
                bestDist = dist;
                bestColor = candidate;
              }
            });
            out[idx] = bestColor;
          });
        } else {
          warningLines.push(y);
        }
      }
    }

    ui.lineWarning.textContent = warningLines.length
      ? `Color limit exceeded on ${warningLines.length} lines (e.g. y=${warningLines.slice(0, 5).join(', ')})`
      : '';

    return out;
  }

  function renderImageData(indexedPixels) {
    const image = offscreenCtx.createImageData(state.width, state.height);
    const data = image.data;
    const { ditherEnabled, ditherStrength, ditherMatrix, bleedEnabled, bleedStrength, scanlineEnabled, scanlineStrength } = state.settings;

    for (let y = 0; y < state.height; y += 1) {
      for (let x = 0; x < state.width; x += 1) {
        const idx = getPixelIndex(x, y);
        const color = state.paletteRgb[indexedPixels[idx]];
        let r = color.r;
        let g = color.g;
        let b = color.b;

        if (ditherEnabled && ditherStrength > 0) {
          const matrix = ditherMatrix === 4 ? BAYER_4 : BAYER_8;
          const mSize = ditherMatrix;
          const mValue = matrix[y % mSize][x % mSize] / (mSize * mSize - 1);
          const delta = (mValue - 0.5) * 120 * ditherStrength;
          r = Math.max(0, Math.min(255, r + delta));
          g = Math.max(0, Math.min(255, g + delta));
          b = Math.max(0, Math.min(255, b + delta));
        }

        if (bleedEnabled && bleedStrength > 0) {
          const leftIndex = indexedPixels[getPixelIndex(Math.max(0, x - 1), y)];
          const rightIndex = indexedPixels[getPixelIndex(Math.min(state.width - 1, x + 1), y)];
          const left = state.paletteRgb[leftIndex];
          const right = state.paletteRgb[rightIndex];
          const edgeL = Math.abs(r - left.r) + Math.abs(g - left.g) + Math.abs(b - left.b);
          const edgeR = Math.abs(r - right.r) + Math.abs(g - right.g) + Math.abs(b - right.b);
          const edgeWeight = Math.min(1, (edgeL + edgeR) / 400);
          const mix = bleedStrength * edgeWeight * 0.35;
          r = r * (1 - mix) + ((left.r + right.r) * 0.5) * mix;
          g = g * (1 - mix) + ((left.g + right.g) * 0.5) * mix;
          b = b * (1 - mix) + ((left.b + right.b) * 0.5) * mix;
        }

        if (scanlineEnabled && scanlineStrength > 0 && y % 2 === 1) {
          const darken = 1 - scanlineStrength * 0.5;
          r *= darken;
          g *= darken;
          b *= darken;
        }

        const out = idx * 4;
        data[out] = r;
        data[out + 1] = g;
        data[out + 2] = b;
        data[out + 3] = 255;
      }
    }

    return image;
  }

  function buildJitterMap() {
    const map = new Int8Array(state.height);
    if (!state.settings.jitterEnabled || state.settings.jitterStrength <= 0) return map;
    const chance = state.settings.jitterStrength * 0.55;
    for (let y = 0; y < state.height; y += 1) {
      if (Math.random() < chance) map[y] = Math.random() > 0.5 ? 1 : -1;
    }
    return map;
  }

  function renderToDisplay() {
    const indexed = buildColorMapWithConstraints();
    const image = renderImageData(indexed);
    offscreenCtx.putImageData(image, 0, 0);

    displayCtx.save();
    displayCtx.clearRect(0, 0, ui.displayCanvas.width, ui.displayCanvas.height);
    displayCtx.imageSmoothingEnabled = false;

    const sx = state.settings.scaleX;
    const sy = state.settings.scaleY;
    const jitterMap = buildJitterMap();

    for (let y = 0; y < state.height; y += 1) {
      const jitter = jitterMap[y] * state.settings.jitterStrength * sx;
      displayCtx.drawImage(offscreenCanvas, 0, y, state.width, 1, jitter, y * sy, state.width * sx, sy);
    }

    displayCtx.restore();
  }

  function frame() {
    if (state.needsRender) {
      renderToDisplay();
      state.needsRender = false;
    }
    requestAnimationFrame(frame);
  }

  function exportPNG(mode) {
    const link = document.createElement('a');
    link.download = `retro-paint-${Date.now()}.png`;

    if (mode === 'raw') {
      const rawCanvas = document.createElement('canvas');
      rawCanvas.width = state.width;
      rawCanvas.height = state.height;
      const rawCtx = rawCanvas.getContext('2d');
      const image = rawCtx.createImageData(state.width, state.height);
      for (let i = 0; i < state.pixels.length; i += 1) {
        const p = state.paletteRgb[state.pixels[i]];
        image.data[i * 4] = p.r;
        image.data[i * 4 + 1] = p.g;
        image.data[i * 4 + 2] = p.b;
        image.data[i * 4 + 3] = 255;
      }
      rawCtx.putImageData(image, 0, 0);
      link.href = rawCanvas.toDataURL('image/png');
    } else {
      renderToDisplay();
      link.href = ui.displayCanvas.toDataURL('image/png');
    }

    link.click();
  }

  function pixelsToBase64(uint8) {
    let binary = '';
    for (let i = 0; i < uint8.length; i += 1) binary += String.fromCharCode(uint8[i]);
    return btoa(binary);
  }

  function base64ToPixels(base64) {
    const binary = atob(base64);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
    return out;
  }

  function saveJSON() {
    const payload = {
      W: state.width,
      H: state.height,
      palette: state.paletteHex,
      settings: state.settings,
      pixels: pixelsToBase64(state.pixels),
      presetId: state.activePreset,
      canvasAspect: state.canvasAspect,
    };
    const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `retro-paint-${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function aspectFromHeight(h) {
    if (h === 135) return '16:9';
    if (h === 240) return '1:1';
    return '4:3';
  }

  function loadJSON(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const payload = JSON.parse(reader.result);
        if (!payload.W || !payload.H || !payload.palette || !payload.settings || !payload.pixels) {
          throw new Error('Invalid save data');
        }

        state.width = payload.W;
        state.height = payload.H;
        state.pixels = base64ToPixels(payload.pixels);
        state.paletteHex = payload.palette;
        state.paletteRgb = state.paletteHex.map(parseHexColor);
        state.settings = payload.settings;
        state.settings.scaleX = 6;
        state.settings.scaleY = 4;
        state.activePreset = payload.presetId || state.activePreset;
        state.canvasAspect = payload.canvasAspect || aspectFromHeight(state.height);
        state.selectedColor = Math.min(state.selectedColor, state.paletteHex.length - 1);

        syncUIFromState();
        renderPalette();
        resizeDisplayCanvas();
        scheduleRender();
        state.history = [];
        state.future = [];
        updateUndoRedoUI();
      } catch (error) {
        alert(`Load failed: ${error.message}`);
      }
    };
    reader.readAsText(file);
  }

  function bindUI() {
    Object.entries(PRESETS).forEach(([id, preset]) => {
      const option = document.createElement('option');
      option.value = id;
      option.textContent = preset.label;
      ui.presetSelect.appendChild(option);
    });

    ui.presetSelect.addEventListener('change', () => applyPreset(ui.presetSelect.value, false));

    ui.canvasAspectSelect.addEventListener('change', () => {
      const aspect = ui.canvasAspectSelect.value;
      state.canvasAspect = aspect;
      resizeLogicalCanvas(ASPECT_HEIGHTS[aspect]);
      syncUIFromState();
    });

    ui.toolSelect.addEventListener('change', () => {
      state.tool = ui.toolSelect.value;
    });

    ui.penSize.addEventListener('change', () => {
      state.penSize = Number(ui.penSize.value);
    });

    const bindSetting = (key, input, output) => {
      input.addEventListener('input', () => {
        state.settings[key] = Number(input.value);
        output.textContent = Number(input.value).toFixed(2);
        scheduleRender();
      });
    };

    bindSetting('ditherStrength', ui.ditherStrength, ui.ditherValue);
    bindSetting('bleedStrength', ui.bleedStrength, ui.bleedValue);
    bindSetting('scanlineStrength', ui.scanlineStrength, ui.scanlineValue);
    bindSetting('jitterStrength', ui.jitterStrength, ui.jitterValue);

    ui.ditherEnabled.addEventListener('change', () => {
      state.settings.ditherEnabled = ui.ditherEnabled.checked;
      scheduleRender();
    });
    ui.bleedEnabled.addEventListener('change', () => {
      state.settings.bleedEnabled = ui.bleedEnabled.checked;
      scheduleRender();
    });
    ui.scanlineEnabled.addEventListener('change', () => {
      state.settings.scanlineEnabled = ui.scanlineEnabled.checked;
      scheduleRender();
    });
    ui.jitterEnabled.addEventListener('change', () => {
      state.settings.jitterEnabled = ui.jitterEnabled.checked;
      scheduleRender();
    });

    ui.lineColorLimit.addEventListener('change', () => {
      const val = Math.max(2, Math.min(6, Number(ui.lineColorLimit.value)));
      state.settings.perScanlineColorLimit = val;
      ui.lineColorLimit.value = String(val);
      scheduleRender();
    });

    ui.autoClamp.addEventListener('change', () => {
      state.settings.autoClampColors = ui.autoClamp.checked;
      scheduleRender();
    });

    ui.clearBtn.addEventListener('click', () => {
      beginAction();
      clearPixels(0);
      endAction();
    });

    ui.undoBtn.addEventListener('click', undo);
    ui.redoBtn.addEventListener('click', redo);
    ui.exportBtn.addEventListener('click', () => exportPNG(ui.exportMode.value));
    ui.saveBtn.addEventListener('click', saveJSON);
    ui.loadInput.addEventListener('change', () => {
      const file = ui.loadInput.files[0];
      if (file) loadJSON(file);
      ui.loadInput.value = '';
    });

    const activeOpts = { passive: false };
    ui.displayCanvas.addEventListener('pointerdown', handlePointerDown, activeOpts);
    ui.displayCanvas.addEventListener('pointermove', handlePointerMove, activeOpts);
    ui.displayCanvas.addEventListener('pointerup', handlePointerUp, activeOpts);
    ui.displayCanvas.addEventListener('pointerleave', handlePointerUp, activeOpts);
    ui.displayCanvas.addEventListener('pointercancel', handlePointerUp, activeOpts);

    ui.displayCanvas.addEventListener('touchstart', (e) => e.preventDefault(), activeOpts);
    ui.displayCanvas.addEventListener('touchmove', (e) => e.preventDefault(), activeOpts);
    ui.displayCanvas.addEventListener('touchend', (e) => e.preventDefault(), activeOpts);

    window.addEventListener('keydown', (event) => {
      if (isFormFocus()) return;

      const key = event.key.toLowerCase();
      const cmdOrCtrl = event.metaKey || event.ctrlKey;
      if (cmdOrCtrl && key === 'z') {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
        return;
      }
      if (cmdOrCtrl && key === 'y') {
        event.preventDefault();
        redo();
        return;
      }

      if (event.key === '[' || event.key === ']') {
        const sizes = [1, 2, 4];
        const i = sizes.indexOf(state.penSize);
        const next = event.key === '[' ? Math.max(0, i - 1) : Math.min(sizes.length - 1, i + 1);
        state.penSize = sizes[next];
        ui.penSize.value = String(state.penSize);
      }

      if (event.key >= '1' && event.key <= '8') {
        const index = Number(event.key) - 1;
        if (index < state.paletteHex.length) {
          state.selectedColor = index;
          renderPalette();
        }
      }

      if (key === 'p') {
        state.tool = 'pen';
        ui.toolSelect.value = 'pen';
      }
      if (key === 'e') {
        state.tool = 'eraser';
        ui.toolSelect.value = 'eraser';
      }
      if (key === 'g') {
        state.tool = 'bucket';
        ui.toolSelect.value = 'bucket';
      }
    });
  }

  function init() {
    bindUI();
    applyPreset('neon', true);
    state.canvasAspect = '4:3';
    syncUIFromState();
    resizeDisplayCanvas();
    updateUndoRedoUI();
    frame();
  }

  init();
})();

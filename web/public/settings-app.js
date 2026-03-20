/* settings-app.js — Color Scale Settings for Homeo-Magic */

const STORAGE_KEY = 'homeo-magic-color-scale';

const PRESETS = {
  default: {
    name: 'Default (Amber-Red)',
    colors: ['#fef3c7', '#fed7aa', '#fca5a5', '#f87171'],
    mode: 'lab',
    steps: 4,
  },
  warm: {
    name: 'Warm',
    colors: ['#fde68a', '#f97316'],
    mode: 'lch',
    steps: 4,
  },
  cool: {
    name: 'Cool',
    colors: ['#bfdbfe', '#3b82f6'],
    mode: 'lch',
    steps: 4,
  },
  viridis: {
    name: 'Viridis-like',
    colors: ['#440154', '#31688e', '#35b779', '#fde725'],
    mode: 'lab',
    steps: 6,
  },
  diverging: {
    name: 'Diverging',
    colors: ['#3b82f6', '#fef3c7', '#ef4444'],
    mode: 'lab',
    steps: 5,
  },
  teal: {
    name: 'Teal',
    colors: ['#D3DCDE', '#065774'],
    mode: 'lch',
    steps: 4,
  },
};

let state = {
  colors: ['#fef3c7', '#f87171'],
  mode: 'lab',
  steps: 4,
  activePreset: null,
};

// ── Initialization ──

function init() {
  const saved = loadFromStorage();
  if (saved) {
    state.colors = saved.colors;
    state.mode = saved.mode;
    state.steps = saved.steps;
    state.activePreset = saved.activePreset || null;
  } else {
    applyPreset('default', false);
  }

  document.getElementById('interpMode').value = state.mode;
  document.getElementById('stepsCount').value = state.steps;

  renderPresets();
  renderColorStops();
  updatePreview();
}

// ── Storage ──

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (Array.isArray(data.colors) && data.colors.length >= 2) return data;
  } catch (e) { /* ignore */ }
  return null;
}

function saveToStorage() {
  const scale = getScaleHexArray();
  const payload = {
    colors: state.colors,
    mode: state.mode,
    steps: state.steps,
    activePreset: state.activePreset,
    scale, // the final computed hex array for the main page to read
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  toast('Saved to localStorage');
}

// ── Scale computation ──

function getScaleHexArray() {
  try {
    const scale = chroma.scale(state.colors).mode(state.mode).colors(state.steps);
    return scale;
  } catch {
    return state.colors;
  }
}

// ── Presets ──

function renderPresets() {
  const container = document.getElementById('presets');
  container.innerHTML = Object.entries(PRESETS).map(([key, p]) => {
    const grad = chroma.scale(p.colors).mode(p.mode).colors(6);
    const bg = `linear-gradient(90deg, ${grad.join(', ')})`;
    const active = state.activePreset === key ? ' active' : '';
    return `<button class="preset-btn${active}" onclick="applyPreset('${key}')">
      <span class="preset-swatch" style="background: ${bg}"></span>
      ${p.name}
    </button>`;
  }).join('');
}

function applyPreset(key, render = true) {
  const p = PRESETS[key];
  if (!p) return;
  state.colors = [...p.colors];
  state.mode = p.mode;
  state.steps = p.steps;
  state.activePreset = key;
  if (render) {
    document.getElementById('interpMode').value = state.mode;
    document.getElementById('stepsCount').value = state.steps;
    renderPresets();
    renderColorStops();
    updatePreview();
  }
}

// ── Color stops ──

function renderColorStops() {
  const container = document.getElementById('colorStops');
  const canRemove = state.colors.length > 2;
  container.innerHTML = state.colors.map((c, i) => `
    <div class="color-stop">
      <input type="color" value="${normalizeHex(c)}" oninput="updateStopColor(${i}, this.value)" title="Pick color">
      <input type="text" value="${c}" oninput="updateStopHex(${i}, this)" placeholder="#hex" spellcheck="false">
      <div class="stop-actions">
        <button class="icon-btn remove" onclick="removeStop(${i})" ${canRemove ? '' : 'disabled'} title="Remove stop">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
    </div>
  `).join('');
}

function normalizeHex(c) {
  try { return chroma(c).hex(); } catch { return '#000000'; }
}

function updateStopColor(i, value) {
  state.colors[i] = value;
  state.activePreset = null;
  renderColorStops();
  renderPresets();
  updatePreview();
}

function updateStopHex(i, input) {
  const val = input.value.trim();
  try {
    chroma(val); // validate
    input.classList.remove('invalid');
    state.colors[i] = val;
    state.activePreset = null;
    // Sync native picker
    const picker = input.parentElement.querySelector('input[type="color"]');
    picker.value = normalizeHex(val);
    renderPresets();
    updatePreview();
  } catch {
    input.classList.add('invalid');
  }
}

function addStop() {
  if (state.colors.length >= 10) return;
  // Insert a color midway between the last two
  const len = state.colors.length;
  const mid = chroma.mix(state.colors[len - 2], state.colors[len - 1], 0.5, state.mode).hex();
  state.colors.splice(len - 1, 0, mid);
  state.activePreset = null;
  renderPresets();
  renderColorStops();
  updatePreview();
}

function removeStop(i) {
  if (state.colors.length <= 2) return;
  state.colors.splice(i, 1);
  state.activePreset = null;
  renderPresets();
  renderColorStops();
  updatePreview();
}

// ── Settings changes ──

function onModeChange(value) {
  state.mode = value;
  state.activePreset = null;
  renderPresets();
  updatePreview();
}

function onStepsChange(value) {
  let n = parseInt(value, 10);
  if (isNaN(n)) return;
  n = Math.max(3, Math.min(10, n));
  state.steps = n;
  document.getElementById('stepsCount').value = n;
  state.activePreset = null;
  renderPresets();
  updatePreview();
}

// ── Preview ──

function updatePreview() {
  const hexArr = getScaleHexArray();

  // Gradient bar
  const gradBar = document.getElementById('gradientBar');
  gradBar.style.background = `linear-gradient(90deg, ${hexArr.join(', ')})`;

  // Swatches
  const swatchContainer = document.getElementById('swatches');
  swatchContainer.innerHTML = hexArr.map((c, i) => {
    const textColor = chroma(c).luminance() > 0.45 ? '#374151' : '#ffffff';
    return `<div class="swatch" style="background: ${c}">
      <span class="swatch-label" style="color: ${textColor}; background: ${chroma(c).luminance() > 0.45 ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.2)'}">${c}</span>
    </div>`;
  }).join('');

  // Grade preview (simulated matrix cells)
  const gradeContainer = document.getElementById('gradePreview');
  gradeContainer.innerHTML = hexArr.map((c, i) => {
    const textColor = chroma(c).luminance() > 0.45 ? '#1f2937' : '#ffffff';
    return `<div class="grade-preview-item">
      <div class="grade-cell" style="background: ${c}; color: ${textColor}">${i + 1}</div>
      <span class="grade-label">Grade ${i + 1}</span>
    </div>`;
  }).join('');

  // JSON output
  const jsonEl = document.getElementById('jsonOutput');
  jsonEl.textContent = JSON.stringify(hexArr, null, 2);
}

// ── Export ──

function copyJSON() {
  const hexArr = getScaleHexArray();
  const text = JSON.stringify(hexArr);
  navigator.clipboard.writeText(text).then(() => {
    toast('Copied to clipboard');
  }).catch(() => {
    // Fallback: select the text
    const el = document.getElementById('jsonOutput');
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    toast('Select and copy manually');
  });
}

// ── Toast ──

let toastTimeout;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => el.classList.remove('show'), 2000);
}

// ── Boot ──
document.addEventListener('DOMContentLoaded', init);

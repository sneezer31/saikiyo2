/** さいきよ2 - 設定モジュール（表示項目・並び順・配色・文字サイズ5段階・扉ロック・全画面） */

const CONFIG_KEY = 'saikiyo2_config';
const TITLE_KEY = 'saikiyo2_title';
const SETUP_DONE_KEY = 'saikiyo2_setup_done';
const PASSPHRASE_KEY = 'saikiyo2_passphrase';
const MASTER_KEY = 'よきいさ';

const PRESET_PALETTES = {
  kinari:     { main: '#1A1A1A', sub: '#EAE6DF', bg: '#FDFBF6' },
  ginnezumi:  { main: '#595857', sub: '#F0EBE1', bg: '#FFFCF5' },
  monochrome: { main: '#111111', sub: '#E0E0E0', bg: '#FFFFFF' },
  sumi:       { main: '#EAE6DF', sub: '#2A2C2F', bg: '#1C1D1F' }
};

const DEFAULT_DISPLAY_PREFS = {
  showDate: false,
  showCheck: true,
  showTags: true,
  showMemo: false,
  oneLine: false,
  sortOrder: 'asc'
};

const DEFAULT_CONFIG = {
  theme: 'kinari',
  customColors: null,
  size: '1',            // '1'(1.0x) 〜 '5'(1.4x)
  font: 'gothic',
  radius: 'none',
  displayPrefs: { ...DEFAULT_DISPLAY_PREFS }
};

const CUSTOM_CSS_VARS = [
  '--bg-color',
  '--text-color',
  '--muted-color',
  '--header-bg',
  '--footer-bg',
  '--console-bg',
  '--surface-bg',
  '--border-subtle'
];

function parseHex(hex) {
  const clean = String(hex || '').replace('#', '');
  if (clean.length !== 6) return { r: 26, g: 26, b: 26 };
  return {
    r: parseInt(clean.slice(0, 2), 16) || 0,
    g: parseInt(clean.slice(2, 4), 16) || 0,
    b: parseInt(clean.slice(4, 6), 16) || 0
  };
}

function toHex(n) {
  return Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
}

function mixHex(hexA, hexB, ratioB) {
  const a = parseHex(hexA);
  const b = parseHex(hexB);
  const r = a.r * (1 - ratioB) + b.r * ratioB;
  const g = a.g * (1 - ratioB) + b.g * ratioB;
  const bl = a.b * (1 - ratioB) + b.b * ratioB;
  return `#${toHex(r)}${toHex(g)}${toHex(bl)}`;
}

function hexToRgba(hex, alpha) {
  const { r, g, b } = parseHex(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function migrateSizeValue(raw) {
  if (['1', '2', '3', '4', '5'].includes(String(raw))) return String(raw);
  if (raw === 'large') return '3';
  return '1';
}

export function initSettingsModule({ onDisplayPrefsChanged } = {}) {
  let config = {
    ...DEFAULT_CONFIG,
    displayPrefs: { ...DEFAULT_DISPLAY_PREFS }
  };

  const DOM = {
    btnTop: document.getElementById('btn-top'),
    colorAutoPicker: document.getElementById('color-auto-picker'),
    colorManualMain: document.getElementById('color-manual-main'),
    colorManualSub: document.getElementById('color-manual-sub'),
    colorManualBg: document.getElementById('color-manual-bg'),
    inputAppTitle: document.getElementById('config-app-title'),
    btnSaveAppTitle: document.getElementById('btn-save-app-title'),
    inputPassphrase: document.getElementById('config-passphrase'),
    btnSavePassphrase: document.getElementById('btn-save-passphrase'),
    btnToggleFullscreen: document.getElementById('btn-toggle-fullscreen'),
    btnResetConfig: document.getElementById('btn-reset-config'),
    panelAuth: document.getElementById('panel-auth'),
    authInput: document.getElementById('auth-input'),
    btnAuthUnlock: document.getElementById('btn-auth-unlock'),
    panelFirstBoot: document.getElementById('panel-first-boot'),
    firstBootChoices: document.getElementById('first-boot-choices'),
    btnFirstBootSkip: document.getElementById('btn-first-boot-skip'),
    btnFirstBootUse: document.getElementById('btn-first-boot-use'),
    firstBootInputArea: document.getElementById('first-boot-input-area'),
    firstBootPassInput: document.getElementById('first-boot-pass-input'),
    btnFirstBootSave: document.getElementById('btn-first-boot-save')
  };

  function saveConfig() {
    try {
      localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
    } catch (_) {}
  }

  function clearCustomColorVars() {
    CUSTOM_CSS_VARS.forEach(v => document.body.style.removeProperty(v));
  }

  function applyCustomColorVars(main, sub, bg) {
    const style = document.body.style;
    style.setProperty('--text-color', main);
    style.setProperty('--header-bg', sub);
    style.setProperty('--bg-color', bg);
    style.setProperty('--footer-bg', hexToRgba(sub, 0.92));
    style.setProperty('--console-bg', hexToRgba(

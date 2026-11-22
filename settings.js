/** さいきよ2 - 設定・カスタム配色パレット・パスワード扉・全画面切替モジュール */

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

const DEFAULT_CONFIG = {
  theme: 'kinari',      // 'kinari' | 'ginnezumi' | 'monochrome' | 'sumi' | 'custom'
  customColors: null,   // { main, sub, bg }
  size: 'medium',       // 'small' | 'medium' | 'large'
  font: 'gothic',       // 'gothic' | 'mincho'
  radius: 'none'        // 'none' | 'soft'
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

export function initSettingsModule() {
  let config = { ...DEFAULT_CONFIG };

  const DOM = {
    btnTop: document.getElementById('btn-top'),
    // カラーパレット
    colorAutoPicker: document.getElementById('color-auto-picker'),
    colorManualMain: document.getElementById('color-manual-main'),
    colorManualSub: document.getElementById('color-manual-sub'),
    colorManualBg: document.getElementById('color-manual-bg'),
    // アプリ名・合言葉・全画面・リセット
    inputAppTitle: document.getElementById('config-app-title'),
    btnSaveAppTitle: document.getElementById('btn-save-app-title'),
    inputPassphrase: document.getElementById('config-passphrase'),
    btnSavePassphrase: document.getElementById('btn-save-passphrase'),
    btnToggleFullscreen: document.getElementById('btn-toggle-fullscreen'),
    btnResetConfig: document.getElementById('btn-reset-config'),
    // ロック画面＆初回セットアップ
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
    style.setProperty('--footer-bg', hexToRgba(sub, 0.90));
    style.setProperty('--console-bg', hexToRgba(bg, 0.98));
    style.setProperty('--surface-bg', mixHex(bg, '#FFFFFF', 0.35));
    style.setProperty('--muted-color', mixHex(main, bg, 0.45));
    style.setProperty('--border-subtle', mixHex(main, bg, 0.72));
  }

  function syncColorPickers(main, sub, bg) {
    if (DOM.colorAutoPicker) DOM.colorAutoPicker.value = main.slice(0, 7);
    if (DOM.colorManualMain) DOM.colorManualMain.value = main.slice(0, 7);
    if (DOM.colorManualSub) DOM.colorManualSub.value = sub.slice(0, 7);
    if (DOM.colorManualBg) DOM.colorManualBg.value = bg.slice(0, 7);
  }

  function applyConfig() {
    document.body.dataset.size = config.size;
    document.body.dataset.font = config.font;
    document.body.dataset.radius = config.radius;

    if (config.theme === 'custom' && config.customColors) {
      document.body.dataset.theme = 'custom';
      const { main, sub, bg } = config.customColors;
      applyCustomColorVars(main, sub, bg);
      syncColorPickers(main, sub, bg);
    } else {
      const presetKey = PRESET_PALETTES[config.theme] ? config.theme : 'kinari';
      config.theme = presetKey;
      clearCustomColorVars();
      document.body.dataset.theme = presetKey;
      const p = PRESET_PALETTES[presetKey];
      syncColorPickers(p.main, p.sub, p.bg);
    }

    document.querySelectorAll('[data-config-theme]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.configTheme === config.theme);
    });
    document.querySelectorAll('[data-config-size]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.configSize === config.size);
    });
    document.querySelectorAll('[data-config-font]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.configFont === config.font);
    });
    document.querySelectorAll('[data-config-radius]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.configRadius === config.radius);
    });
  }

  function applyAppTitle() {
    const title = localStorage.getItem(TITLE_KEY) || 'さいきよ2';
    document.title = title;
    if (DOM.btnTop) DOM.btnTop.textContent = title;
    if (DOM.inputAppTitle) DOM.inputAppTitle.value = title;
  }

  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(CONFIG_KEY));
      if (saved) config = { ...DEFAULT_CONFIG, ...saved };
    } catch (_) {}
    applyConfig();
    applyAppTitle();

    const savedPass = localStorage.getItem(PASSPHRASE_KEY) || '';
    if (DOM.inputPassphrase) DOM.inputPassphrase.value = savedPass;

    // 起動時の扉チェック
    if (!localStorage.getItem(SETUP_DONE_KEY)) {
      if (DOM.panelFirstBoot) DOM.panelFirstBoot.style.display = 'flex';
    } else if (savedPass) {
      if (DOM.panelAuth) {
        DOM.panelAuth.style.display = 'flex';
        setTimeout(() => DOM.authInput && DOM.authInput.focus(), 100);
      }
    }
  }

  // --- テーマ・サイズ・書体・角丸イベント ---
  document.querySelectorAll('[data-config-theme]').forEach(btn => {
    btn.addEventListener('click', () => {
      config.theme = btn.dataset.configTheme;
      config.customColors = null;
      applyConfig();
      saveConfig();
    });
  });

  document.querySelectorAll('[data-config-size]').forEach(btn => {
    btn.addEventListener('click', () => {
      config.size = btn.dataset.configSize;
      applyConfig();
      saveConfig();
    });
  });

  document.querySelectorAll('[data-config-font]').forEach(btn => {
    btn.addEventListener('click', () => {
      config.font = btn.dataset.configFont;
      applyConfig();
      saveConfig();
    });
  });

  document.querySelectorAll('[data-config-radius]').forEach(btn => {
    btn.addEventListener('click', () => {
      config.radius = btn.dataset.configRadius;
      applyConfig();
      saveConfig();
    });
  });

  // --- 1色で自動生成パレット（初代アルゴリズム：85%・95%白混色） ---
  if (DOM.colorAutoPicker) {
    DOM.colorAutoPicker.addEventListener('input', (e) => {
      const main = e.target.value;
      const sub = mixHex(main, '#FFFFFF', 0.85);
      const bg = mixHex(main, '#FFFFFF', 0.95);
      config.theme = 'custom';
      config.customColors = { main, sub, bg };
      applyConfig();
      saveConfig();
    });
  }

  // --- 3色を自作パレット ---
  function handleManualColorInput() {
    if (!DOM.colorManualMain || !DOM.colorManualSub || !DOM.colorManualBg) return;
    config.theme = 'custom';
    config.customColors = {
      main: DOM.colorManualMain.value,
      sub: DOM.colorManualSub.value,
      bg: DOM.colorManualBg.value
    };
    applyConfig();
    saveConfig();
  }

  if (DOM.colorManualMain) DOM.colorManualMain.addEventListener('input', handleManualColorInput);
  if (DOM.colorManualSub) DOM.colorManualSub.addEventListener('input', handleManualColorInput);
  if (DOM.colorManualBg) DOM.colorManualBg.addEventListener('input', handleManualColorInput);

  // --- アプリ名変更 ---
  if (DOM.btnSaveAppTitle) {
    DOM.btnSaveAppTitle.addEventListener('click', () => {
      const next = DOM.inputAppTitle ? DOM.inputAppTitle.value.trim() : '';
      const finalTitle = next || 'さいきよ2';
      localStorage.setItem(TITLE_KEY, finalTitle);
      applyAppTitle();
      alert(`アプリ名を「${finalTitle}」に変更しました。`);
    });
  }

  // --- 合言葉の設定・解除 ---
  if (DOM.btnSavePassphrase) {
    DOM.btnSavePassphrase.addEventListener('click', () => {
      const pass = DOM.inputPassphrase ? DOM.inputPassphrase.value.trim() : '';
      localStorage.setItem(SETUP_DONE_KEY, 'true');
      if (pass) {
        localStorage.setItem(PASSPHRASE_KEY, pass);
        alert('合言葉を設定しました。次回の起動時から扉が有効になります。');
      } else {
        localStorage.removeItem(PASSPHRASE_KEY);
        alert('合言葉を解除しました。');
      }
    });
  }

  // --- 扉の開門処理 ---
  function tryUnlock() {
    if (!DOM.authInput || !DOM.panelAuth) return;
    const entered = DOM.authInput.value.trim();
    const expected = localStorage.getItem(PASSPHRASE_KEY);
    if (entered === expected || entered === MASTER_KEY) {
      DOM.panelAuth.style.display = 'none';
      DOM.authInput.value = '';
    } else {
      alert('合言葉が違います。');
      DOM.authInput.value = '';
      DOM.authInput.focus();
    }
  }

  if (DOM.btnAuthUnlock) DOM.btnAuthUnlock.addEventListener('click', tryUnlock);
  if (DOM.authInput) {
    DOM.authInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') tryUnlock();
    });
  }

  // --- 初回セットアップ ---
  if (DOM.btnFirstBootSkip) {
    DOM.btnFirstBootSkip.addEventListener('click', () => {
      localStorage.setItem(SETUP_DONE_KEY, 'true');
      if (DOM.panelFirstBoot) DOM.panelFirstBoot.style.display = 'none';
    });
  }

  if (DOM.btnFirstBootUse) {
    DOM.btnFirstBootUse.addEventListener('click', () => {
      if (DOM.firstBootChoices) DOM.firstBootChoices.style.display = 'none';
      if (DOM.firstBootInputArea) DOM.firstBootInputArea.style.display = 'flex';
      if (DOM.firstBootPassInput) DOM.firstBootPassInput.focus();
    });
  }

  function saveFirstBootPassphrase() {
    const pass = DOM.firstBootPassInput ? DOM.firstBootPassInput.value.trim() : '';
    if (!pass) {
      alert('合言葉を入力してください。');
      return;
    }
    localStorage.setItem(PASSPHRASE_KEY, pass);
    localStorage.setItem(SETUP_DONE_KEY, 'true');
    if (DOM.inputPassphrase) DOM.inputPassphrase.value = pass;
    if (DOM.panelFirstBoot) DOM.panelFirstBoot.style.display = 'none';
    alert('合言葉を設定しました（忘れた場合は設定画面または救済キーで解除できます）。');
  }

  if (DOM.btnFirstBootSave) DOM.btnFirstBootSave.addEventListener('click', saveFirstBootPassphrase);
  if (DOM.firstBootPassInput) {
    DOM.firstBootPassInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') saveFirstBootPassphrase();
    });
  }

  // --- 全画面切替 ---
  if (DOM.btnToggleFullscreen) {
    DOM.btnToggleFullscreen.addEventListener('click', () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {
          alert('このブラウザでは全画面表示を利用できません。');
        });
      } else {
        document.exitFullscreen().catch(() => {});
      }
    });
  }

  // --- 設定の初期化 ---
  if (DOM.btnResetConfig) {
    DOM.btnResetConfig.addEventListener('click', () => {
      if (!confirm('表示設定（配色・文字サイズ・書体・角丸）を初期状態に戻しますか？\n※カードや合言葉は消えません。')) {
        return;
      }
      config = { ...DEFAULT_CONFIG };
      localStorage.removeItem(CONFIG_KEY);
      applyConfig();
    });
  }

  return {
    load
  };
}

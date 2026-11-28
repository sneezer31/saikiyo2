/** さいきよ2 - メイン司令塔（常時ヘッダー / 表示条件記憶・非表示タグ・全貫通検索・タイムマシン一時解除 / 工房 / 内蔵机） */

import {
  initDB,
  saveCard,
  loadAllCards,
  getCard,
  bulkSaveCards,
  saveShelf
} from './db.js';
import { createTankaCard, updateSelectionBarUI, formatDateWithWeekday } from './ui.js';
import { initShelfModule, downloadTextFile } from './shelf.js';
import { initDataManagerModule } from './dataManager.js';
import { initSearchModule } from './search.js';
import { initSettingsModule } from './settings.js';
import { initDeskModule } from './desk.js';

const SCROLL_POS_KEY = 'saikiyo2_scroll_pos';
const DISPLAY_FILTER_KEY = 'saikiyo2_display_filter';
const HELPER_TAGS_KEY = 'saikiyo2_helper_tags';
const DEFAULT_HELPER_TAGS = ['#メモ', '#控', '#保留', '#済'];

const state = {
  filterDateFrom: '',
  filterDateTo: '',
  filterTagQuery: '',
  hiddenTagQuery: '',
  timeMachineActive: false,
  helperTags: [...DEFAULT_HELPER_TAGS],
  tagEditScope: 'filtered',     // 'filtered'（表示期間対象） | 'all'（全期間対象）
  jsonExportTarget: 'displayed', // 'displayed'（表示中） | 'selected'（選択中）
  selectedIds: new Set(),
  lastRenderedIds: [],
  editingCardId: null,
  batchOriginalTags: new Set(),
  activeWing: null              // null | 'display' | 'shelf'
};

const DOM = {
  timeline: document.getElementById('timeline'),
  btnOpenDisplay: document.getElementById('btn-open-display'),
  btnTop: document.getElementById('btn-top'),
  btnOpenShelf: document.getElementById('btn-open-shelf'),
  btnFab: document.getElementById('btn-fab'),
  // 右端選択ドック
  selectionDock: document.getElementById('selection-dock'),
  selectionCount: document.getElementById('selection-count'),
  btnSelectAll: document.getElementById('btn-select-all'),
  btnBatchEdit: document.getElementById('btn-batch-edit'),
  btnToDesk: document.getElementById('btn-to-desk'),
  btnCancelSelection: document.getElementById('btn-cancel-selection'),
  // 入力コンソール
  consoleArea: document.getElementById('console-area'),
  inputContent: document.getElementById('input-content'),
  inputTags: document.getElementById('input-tags'),
  btnSearch: document.getElementById('btn-search'),
  btnSend: document.getElementById('btn-send'),
  // カード編集パネル
  panelEdit: document.getElementById('panel-edit'),
  editPanelTitle: document.getElementById('edit-panel-title'),
  editTimestampGroup: document.getElementById('edit-timestamp-group'),
  editTimestamp: document.getElementById('edit-timestamp'),
  editContentView: document.getElementById('edit-content-view'),
  editMemo: document.getElementById('edit-memo'),
  editTags: document.getElementById('edit-tags'),
  editTagsHint: document.getElementById('edit-tags-hint'),
  editHelperTags: document.getElementById('edit-helper-tags'),
  btnDeleteEdit: document.getElementById('btn-delete-edit'),
  btnCopyEdit: document.getElementById('btn-copy-edit'),
  btnShelfEdit: document.getElementById('btn-shelf-edit'),
  btnSaveEdit: document.getElementById('btn-save-edit'),
  // 机パネル
  panelDesk: document.getElementById('panel-desk'),
  // ウィングパネル
  panelDisplay: document.getElementById('panel-display'),
  panelShelf: document.getElementById('panel-shelf'),
  // 表示パネル内コントロール
  btnDisplayReset: document.getElementById('btn-display-reset'),
  displayStatus: document.getElementById('display-status'),
  filterDateFrom: document.getElementById('filter-date-from'),
  filterDateTo: document.getElementById('filter-date-to'),
  btnClearDate: document.getElementById('btn-clear-date'),
  filterTagInput: document.getElementById('filter-tag-input'),
  btnClearTag: document.getElementById('btn-clear-tag'),
  filterHelperTags: document.getElementById('filter-helper-tags'),
  hiddenTagInput: document.getElementById('hidden-tag-input'),
  btnClearHiddenTag: document.getElementById('btn-clear-hidden-tag'),
  hiddenHelperTags: document.getElementById('hidden-helper-tags'),
  timemachineDate: document.getElementById('timemachine-date'),
  btnTimemachineGo: document.getElementById('btn-timemachine-go'),
  btnTimemachineBack: document.getElementById('btn-timemachine-back'),
  // 工房内コントロール
  workshopNewHelperTag: document.getElementById('workshop-new-helper-tag'),
  btnWorkshopAddHelperTag: document.getElementById('btn-workshop-add-helper-tag'),
  workshopHelperTagList: document.getElementById('workshop-helper-tag-list'),
  tagEditFrom: document.getElementById('tag-edit-from'),
  tagEditTo: document.getElementById('tag-edit-to'),
  btnTagReplace: document.getElementById('btn-tag-replace'),
  tagEditAdd: document.getElementById('tag-edit-add'),
  btnTagAdd: document.getElementById('btn-tag-add'),
  btnTagClearAll: document.getElementById('btn-tag-clear-all'),
  tagEditActiveList: document.getElementById('tag-edit-active-list'),
  btnWorkshopExportShare: document.getElementById('btn-workshop-export-share'),
  btnWorkshopExportFile: document.getElementById('btn-workshop-export-file')
};

// --- ユーティリティ ---
function normalizeTagToken(raw) {
  const t = String(raw || '').trim();
  if (!t) return '';
  return t.startsWith('#') ? t : '#' + t;
}

function makeTimestampStr() {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const hm = `${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
  return `${ymd}_${hm}`;
}

function loadDisplayFilterState() {
  try {
    const saved = JSON.parse(localStorage.getItem(DISPLAY_FILTER_KEY));
    if (saved && typeof saved === 'object') {
      state.filterDateFrom = typeof saved.filterDateFrom === 'string' ? saved.filterDateFrom : '';
      state.filterDateTo = typeof saved.filterDateTo === 'string' ? saved.filterDateTo : '';
      state.filterTagQuery = typeof saved.filterTagQuery === 'string' ? saved.filterTagQuery : '';
      state.hiddenTagQuery = typeof saved.hiddenTagQuery === 'string' ? saved.hiddenTagQuery : '';
    }
  } catch (_) {}
}

function saveDisplayFilterState() {
  try {
    localStorage.setItem(DISPLAY_FILTER_KEY, JSON.stringify({
      filterDateFrom: state.filterDateFrom,
      filterDateTo: state.filterDateTo,
      filterTagQuery: state.filterTagQuery,
      hiddenTagQuery: state.hiddenTagQuery
    }));
  } catch (_) {}
}

function loadHelperTags() {
  try {
    const saved = JSON.parse(localStorage.getItem(HELPER_TAGS_KEY));
    if (Array.isArray(saved)) {
      state.helperTags = Array.from(new Set(saved.map(normalizeTagToken).filter(Boolean)));
      return;
    }
  } catch (_) {}
  state.helperTags = [...DEFAULT_HELPER_TAGS];
}

function saveHelperTags() {
  try {
    localStorage.setItem(HELPER_TAGS_KEY, JSON.stringify(state.helperTags));
  } catch (_) {}
}

// --- サブモジュール初期化 ---
const settingsModule = initSettingsModule({
  onDisplayPrefsChanged: async (opts) => {
    await renderTimeline(opts);
  }
});

const shelfModule = initShelfModule({
  onTimelineUpdated: () => renderTimeline({ forceBottom: true }),
  onShelfCountChanged: () => dataManagerModule.updateStats(),
  onCloseWings: closeAllWings
});

const dataManagerModule = initDataManagerModule({
  onDataChanged: async () => {
    await renderTimeline({ preserveScroll: true });
    await shelfModule.renderList();
  },
  onCardsDeleted: async (deletedIdSet) => {
    deletedIdSet.forEach(id => state.selectedIds.delete(id));
    updateSelectionBar();
    await renderTimeline({ preserveScroll: true });
  }
});

const searchModule = initSearchModule({
  getVisibleCardIds: () => state.lastRenderedIds,
  onClearInputs: () => adjustTimelinePadding({ allowAutoScroll: false }),
  onSearchStateChanged: async (opts = {}) => {
    await renderTimeline(opts);
    if (state.activeWing === 'display') await renderDisplayPanel();
  }
});

const deskModule = initDeskModule({
  onSavedToShelf: async () => {
    state.selectedIds.clear();
    DOM.timeline.querySelectorAll('.card-check').forEach(chk => { chk.checked = false; });
    updateSelectionBar();
    await shelfModule.renderList();
    await dataManagerModule.updateStats();
  }
});

// --- 全貫通検索判定 ---
function isFullPenetrationSearchActive() {
  const mode = searchModule.getMode();
  if (mode === 'suiko') return true;
  if (mode === 'searching') {
    const cVal = DOM.inputContent ? DOM.inputContent.value.trim() : '';
    const tVal = DOM.inputTags ? DOM.inputTags.value.trim() : '';
    return Boolean(cVal || tVal);
  }
  return false;
}

// --- スクロール位置判定・記憶 ---
function getSortOrder() {
  return settingsModule.getDisplayPrefs().sortOrder || 'asc';
}

function isTimelineAtLatest() {
  if (getSortOrder() === 'desc') {
    return DOM.timeline.scrollTop <= 40;
  }
  return (DOM.timeline.scrollHeight - DOM.timeline.scrollTop) <= (DOM.timeline.clientHeight + 40);
}

let scrollSaveTimer = null;
DOM.timeline.addEventListener('scroll', () => {
  if (hasActiveFilter() || state.timeMachineActive) return;
  clearTimeout(scrollSaveTimer);
  scrollSaveTimer = setTimeout(() => {
    try {
      localStorage.setItem(SCROLL_POS_KEY, String(DOM.timeline.scrollTop));
    } catch (_) {}
  }, 120);
});

// --- パネル・ウィング制御（ヘッダー常時表示・戻る全廃対応） ---
function hasActiveFilter() {
  return Boolean(
    isFullPenetrationSearchActive() ||
    state.filterDateFrom ||
    state.filterDateTo ||
    state.filterTagQuery.trim() ||
    state.hiddenTagQuery.trim()
  );
}

function isFullPanelOpen() {
  return (
    (DOM.panelEdit && DOM.panelEdit.classList.contains('active')) ||
    (DOM.panelDesk && DOM.panelDesk.classList.contains('active'))
  );
}

function closeFullPanels() {
  if (DOM.panelEdit) DOM.panelEdit.classList.remove('active');
  if (DOM.editMemo) DOM.editMemo.disabled = false;
  if (DOM.panelDesk) DOM.panelDesk.classList.remove('active');
}

function updateHeaderButtons() {
  DOM.btnOpenDisplay.classList.toggle('is-active', state.activeWing === 'display' && !isFullPanelOpen());
  DOM.btnOpenShelf.classList.toggle('is-active', state.activeWing === 'shelf' && !isFullPanelOpen());
}

async function openWing(wingName) {
  closeFullPanels();
  DOM.panelDisplay.classList.remove('active');
  DOM.panelShelf.classList.remove('active');
  state.activeWing = wingName;

  if (wingName === 'display') {
    DOM.panelDisplay.classList.add('active');
    await renderDisplayPanel();
  } else if (wingName === 'shelf') {
    DOM.panelShelf.classList.add('active');
    await shelfModule.open();
    await dataManagerModule.updateStats();
  }
  updateHeaderButtons();
}

function closeAllWings() {
  openWing(null);
}

DOM.btnOpenDisplay.addEventListener('click', () => {
  if (isFullPanelOpen()) {
    openWing('display');
    return;
  }
  if (state.activeWing === 'display') closeAllWings();
  else openWing('display');
});

DOM.btnOpenShelf.addEventListener('click', () => {
  if (isFullPanelOpen()) {
    openWing('shelf');
    return;
  }
  if (state.activeWing === 'shelf') closeAllWings();
  else openWing('shelf');
});

DOM.btnTop.addEventListener('click', () => {
  const wasOverlayOpen = isFullPanelOpen() || Boolean(state.activeWing);
  closeAllWings();
  if (!wasOverlayOpen) {
    const targetTop = getSortOrder() === 'desc' ? 0 : DOM.timeline.scrollHeight;
    DOM.timeline.scrollTo({ top: targetTop, behavior: 'smooth' });
  }
});

// --- トグル式ヘルプタグ共通処理 ---
function parseTokensFromInput(value) {
  return String(value || '')
    .replace(/[｜│❘]/g, '|')
    .replace(/ /g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function hasTokenInInput(value, targetToken, { allowBare = false } = {}) {
  const tokens = parseTokensFromInput(value);
  const lowerTarget = targetToken.toLowerCase();
  return tokens.some(tok => {
    const lt = tok.toLowerCase();
    if (lt === lowerTarget) return true;
    if (allowBare && lowerTarget.startsWith('#') && ('#' + lt) === lowerTarget) return true;
    return false;
  });
}

function toggleTokenInInput(value, targetToken, { allowBare = false } = {}) {
  const tokens = parseTokensFromInput(value);
  const lowerTarget = targetToken.toLowerCase();
  const exists = hasTokenInInput(value, targetToken, { allowBare });

  let nextTokens;
  if (exists) {
    nextTokens = tokens.filter(tok => {
      const lt = tok.toLowerCase();
      if (lt === lowerTarget) return false;
      if (allowBare && lowerTarget.startsWith('#') && ('#' + lt) === lowerTarget) return false;
      return true;
    });
    // 孤立した | を整理
    const cleaned = [];
    nextTokens.forEach(tok => {
      if (tok === '|' && (cleaned.length === 0 || cleaned[cleaned.length - 1] === '|')) return;
      cleaned.push(tok);
    });
    if (cleaned[cleaned.length - 1] === '|') cleaned.pop();
    nextTokens = cleaned;
  } else {
    nextTokens = [...tokens, targetToken];
  }
  return nextTokens.join(' ');
}

function renderEditHelperTags() {
  if (!DOM.editHelperTags) return;
  DOM.editHelperTags.innerHTML = '';

  state.helperTags.forEach(tag => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'helper-tag';
    btn.textContent = tag;
    if (hasTokenInInput(DOM.editTags.value, tag, { allowBare: true })) {
      btn.classList.add('is-active');
    }
    btn.addEventListener('click', () => {
      DOM.editTags.value = toggleTokenInInput(DOM.editTags.value, tag, { allowBare: true });
      syncEditHelperTagStates();
    });
    DOM.editHelperTags.appendChild(btn);
  });
}

function syncEditHelperTagStates() {
  if (!DOM.editHelperTags) return;
  DOM.editHelperTags.querySelectorAll('.helper-tag').forEach(btn => {
    const active = hasTokenInInput(DOM.editTags.value, btn.textContent, { allowBare: true });
    btn.classList.toggle('is-active', active);
  });
}

function renderFilterAndHiddenHelperTags() {
  if (DOM.filterHelperTags) {
    DOM.filterHelperTags.innerHTML = '';
    const filterList = [...state.helperTags, 'タグ無し'];
    filterList.forEach(tag => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'filter-chip';
      btn.textContent = tag;
      const allowBare = tag !== 'タグ無し';
      if (hasTokenInInput(state.filterTagQuery, tag, { allowBare })) {
        btn.classList.add('active');
      }
      btn.addEventListener('click', async () => {
        state.timeMachineActive = false;
        state.filterTagQuery = toggleTokenInInput(DOM.filterTagInput.value, tag, { allowBare });
        DOM.filterTagInput.value = state.filterTagQuery;
        saveDisplayFilterState();
        await applyFilterAndRefresh();
      });
      DOM.filterHelperTags.appendChild(btn);
    });
  }

  if (DOM.hiddenHelperTags) {
    DOM.hiddenHelperTags.innerHTML = '';
    state.helperTags.forEach(tag => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'filter-chip';
      btn.textContent = tag;
      if (hasTokenInInput(state.hiddenTagQuery, tag, { allowBare: true })) {
        btn.classList.add('active');
      }
      btn.addEventListener('click', async () => {
        state.timeMachineActive = false;
        state.hiddenTagQuery = toggleTokenInInput(DOM.hiddenTagInput.value, tag, { allowBare: true });
        DOM.hiddenTagInput.value = state.hiddenTagQuery;
        saveDisplayFilterState();
        await applyFilterAndRefresh();
      });
      DOM.hiddenHelperTags.appendChild(btn);
    });
  }
}

function renderWorkshopHelperTagList() {
  if (!DOM.workshopHelperTagList) return;
  DOM.workshopHelperTagList.innerHTML = '';

  if (state.helperTags.length === 0) {
    DOM.workshopHelperTagList.innerHTML = '<span style="color:var(--muted-color); font-size:var(--ui-small);">ヘルプタグはありません。</span>';
    return;
  }

  state.helperTags.forEach(tag => {
    const wrap = document.createElement('span');
    wrap.className = 'helper-tag-chip-wrap';

    const label = document.createElement('span');
    label.className = 'helper-tag-chip-label';
    label.textContent = tag;

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'helper-tag-chip-del';
    del.textContent = '×';
    del.title = `${tag} を削除`;
    del.addEventListener('click', () => {
      state.helperTags = state.helperTags.filter(t => t !== tag);
      saveHelperTags();
      renderAllHelperTagUIs();
    });

    wrap.appendChild(label);
    wrap.appendChild(del);
    DOM.workshopHelperTagList.appendChild(wrap);
  });
}

function renderAllHelperTagUIs() {
  renderWorkshopHelperTagList();
  renderFilterAndHiddenHelperTags();
  renderEditHelperTags();
}

function addWorkshopHelperTag() {
  if (!DOM.workshopNewHelperTag) return;
  const raw = DOM.workshopNewHelperTag.value.trim().split(/\s+/)[0] || '';
  const tag = normalizeTagToken(raw);
  if (!tag) {
    alert('タグを入力してください。');
    return;
  }
  if (!state.helperTags.includes(tag)) {
    state.helperTags.push(tag);
    saveHelperTags();
  }
  DOM.workshopNewHelperTag.value = '';
  renderAllHelperTagUIs();
}

if (DOM.btnWorkshopAddHelperTag) {
  DOM.btnWorkshopAddHelperTag.addEventListener('click', addWorkshopHelperTag);
}
if (DOM.workshopNewHelperTag) {
  DOM.workshopNewHelperTag.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addWorkshopHelperTag();
    }
  });
}

// --- 期間・表示タグ・非表示タグ絞り込みロジック（AND / OR / タグ無し / 名指し貫通 / 全貫通検索） ---
function extractExplicitFilterTags(rawQuery) {
  const tokens = parseTokensFromInput(rawQuery);
  const explicitSet = new Set();
  tokens.forEach(tok => {
    if (tok === '|' || tok === 'タグ無し' || tok === 'タグなし') return;
    explicitSet.add((tok.startsWith('#') ? tok : '#' + tok).toLowerCase());
  });
  return explicitSet;
}

function extractHiddenTags(rawQuery) {
  const tokens = parseTokensFromInput(rawQuery);
  const hiddenSet = new Set();
  tokens.forEach(tok => {
    if (tok === '|') return;
    hiddenSet.add((tok.startsWith('#') ? tok : '#' + tok).toLowerCase());
  });
  return hiddenSet;
}

function matchTagQuery(card, rawQuery) {
  const normalized = (rawQuery || '')
    .replace(/[｜│❘]/g, '|')
    .replace(/ /g, ' ')
    .trim();
  if (!normalized) return true;

  const orGroups = normalized
    .split('|')
    .map(g => g.trim().split(/\s+/).filter(Boolean))
    .filter(terms => terms.length > 0);
  if (orGroups.length === 0) return true;

  const cardTags = Array.isArray(card.tags) ? card.tags : [];
  const lowerTags = cardTags.map(t => t.toLowerCase());

  return orGroups.some(andTerms =>
    andTerms.every(term => {
      if (term === 'タグ無し' || term === 'タグなし') {
        return cardTags.length === 0;
      }
      const withHash = (term.startsWith('#') ? term : '#' + term).toLowerCase();
      return lowerTags.includes(withHash);
    })
  );
}

function filterCards(allCards) {
  // 検索語・タグ入力時または推敲固定中は表示フィルタ・非表示タグを全貫通
  if (isFullPenetrationSearchActive()) {
    return searchModule.filterCards([...allCards]);
  }

  // タイムマシン一時解除中は全期間・全タグを表示
  if (state.timeMachineActive) {
    return [...allCards];
  }

  let result = [...allCards];

  if (state.filterDateFrom) {
    const fromTs = new Date(`${state.filterDateFrom}T00:00:00`).getTime();
    if (!Number.isNaN(fromTs)) result = result.filter(c => c.id >= fromTs);
  }

  if (state.filterDateTo) {
    const toTs = new Date(`${state.filterDateTo}T23:59:59.999`).getTime();
    if (!Number.isNaN(toTs)) result = result.filter(c => c.id <= toTs);
  }

  if (state.filterTagQuery.trim()) {
    result = result.filter(c => matchTagQuery(c, state.filterTagQuery));
  }

  const hiddenSet = extractHiddenTags(state.hiddenTagQuery);
  if (hiddenSet.size > 0) {
    const explicitFilterTags = extractExplicitFilterTags(state.filterTagQuery);
    const activeHidden = new Set([...hiddenSet].filter(t => !explicitFilterTags.has(t)));
    if (activeHidden.size > 0) {
      result = result.filter(c => {
        const lowerTags = (Array.isArray(c.tags) ? c.tags : []).map(t => t.toLowerCase());
        return !lowerTags.some(t => activeHidden.has(t));
      });
    }
  }

  return result;
}

// --- 表示パネル描画（期間・タグ・非表示タグ・工房） ---
async function renderDisplayPanel() {
  const allCards = await loadAllCards();
  const filtered = filterCards(allCards);

  if (state.timeMachineActive) {
    DOM.displayStatus.textContent = `タイムマシン中（全期間 ${allCards.length}枚）`;
  } else if (hasActiveFilter()) {
    DOM.displayStatus.textContent = `表示 ${filtered.length}枚 / 全期間 ${allCards.length}枚`;
  } else {
    DOM.displayStatus.textContent = `全期間 ${allCards.length}枚`;
  }

  DOM.filterDateFrom.value = state.filterDateFrom;
  DOM.filterDateTo.value = state.filterDateTo;
  if (DOM.filterTagInput.value !== state.filterTagQuery) {
    DOM.filterTagInput.value = state.filterTagQuery;
  }
  if (DOM.hiddenTagInput && DOM.hiddenTagInput.value !== state.hiddenTagQuery) {
    DOM.hiddenTagInput.value = state.hiddenTagQuery;
  }

  renderAllHelperTagUIs();

  document.querySelectorAll('[data-tag-edit-scope]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tagEditScope === state.tagEditScope);
  });

  document.querySelectorAll('[data-json-target]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.jsonTarget === state.jsonExportTarget);
  });

  // 工房・タグ加工：対象範囲内の使用中タグ一覧
  const scopeCards = state.tagEditScope === 'all' ? allCards : filtered;
  const tagCounts = new Map();
  scopeCards.forEach(c => {
    (Array.isArray(c.tags) ? c.tags : []).forEach(t => {
      tagCounts.set(t, (tagCounts.get(t) || 0) + 1);
    });
  });

  DOM.tagEditActiveList.innerHTML = '';
  const sortedTags = Array.from(tagCounts.entries()).sort((a, b) => b[1] - a[1]);
  if (sortedTags.length === 0) {
    DOM.tagEditActiveList.innerHTML = '<span style="color:var(--muted-color); font-size:var(--ui-small);">タグはありません。</span>';
  } else {
    sortedTags.forEach(([tag, count]) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'filter-chip';
      btn.textContent = `${tag} (${count}枚)`;
      btn.addEventListener('click', () => {
        DOM.tagEditFrom.value = tag;
      });
      DOM.tagEditActiveList.appendChild(btn);
    });
  }
}

// --- 期間・表示タグ・非表示タグ入力イベント ---
async function applyFilterAndRefresh() {
  await renderTimeline({ forceBottom: true });
  await renderDisplayPanel();
}

DOM.filterDateFrom.addEventListener('change', async () => {
  state.timeMachineActive = false;
  state.filterDateFrom = DOM.filterDateFrom.value;
  saveDisplayFilterState();
  await applyFilterAndRefresh();
});

DOM.filterDateTo.addEventListener('change', async () => {
  state.timeMachineActive = false;
  state.filterDateTo = DOM.filterDateTo.value;
  saveDisplayFilterState();
  await applyFilterAndRefresh();
});

DOM.btnClearDate.addEventListener('click', async () => {
  state.timeMachineActive = false;
  state.filterDateFrom = '';
  state.filterDateTo = '';
  DOM.filterDateFrom.value = '';
  DOM.filterDateTo.value = '';
  saveDisplayFilterState();
  await applyFilterAndRefresh();
});

let tagFilterTimer = null;
DOM.filterTagInput.addEventListener('input', () => {
  state.timeMachineActive = false;
  state.filterTagQuery = DOM.filterTagInput.value;
  saveDisplayFilterState();
  clearTimeout(tagFilterTimer);
  tagFilterTimer = setTimeout(applyFilterAndRefresh, 200);
});

DOM.btnClearTag.addEventListener('click', async () => {
  state.timeMachineActive = false;
  state.filterTagQuery = '';
  DOM.filterTagInput.value = '';
  saveDisplayFilterState();
  await applyFilterAndRefresh();
});

let hiddenTagTimer = null;
if (DOM.hiddenTagInput) {
  DOM.hiddenTagInput.addEventListener('input', () => {
    state.timeMachineActive = false;
    state.hiddenTagQuery = DOM.hiddenTagInput.value;
    saveDisplayFilterState();
    clearTimeout(hiddenTagTimer);
    hiddenTagTimer = setTimeout(applyFilterAndRefresh, 200);
  });
}

if (DOM.btnClearHiddenTag) {
  DOM.btnClearHiddenTag.addEventListener('click', async () => {
    state.timeMachineActive = false;
    state.hiddenTagQuery = '';
    if (DOM.hiddenTagInput) DOM.hiddenTagInput.value = '';
    saveDisplayFilterState();
    await applyFilterAndRefresh();
  });
}

DOM.btnDisplayReset.addEventListener('click', async () => {
  state.timeMachineActive = false;
  state.filterDateFrom = '';
  state.filterDateTo = '';
  state.filterTagQuery = '';
  state.hiddenTagQuery = '';
  DOM.filterDateFrom.value = '';
  DOM.filterDateTo.value = '';
  DOM.filterTagInput.value = '';
  if (DOM.hiddenTagInput) DOM.hiddenTagInput.value = '';
  saveDisplayFilterState();
  searchModule.reset({ clearInputs: true, silent: true });
  await applyFilterAndRefresh();
});

// --- 工房：タグ加工イベント ---
document.querySelectorAll('[data-tag-edit-scope]').forEach(btn => {
  btn.addEventListener('click', async () => {
    state.tagEditScope = btn.dataset.tagEditScope;
    await renderDisplayPanel();
  });
});

async function getTagEditTargets() {
  const allCards = await loadAllCards();
  return state.tagEditScope === 'all' ? allCards : filterCards(allCards);
}

DOM.btnTagReplace.addEventListener('click', async () => {
  const fromTag = normalizeTagToken(DOM.tagEditFrom.value);
  const toTag = normalizeTagToken(DOM.tagEditTo.value);
  if (!fromTag) {
    alert('対象タグを入力してください。');
    return;
  }

  const targets = await getTagEditTargets();
  const matched = targets.filter(c => Array.isArray(c.tags) && c.tags.includes(fromTag));
  if (matched.length === 0) {
    alert(`対象範囲に「${fromTag}」の付いたカードはありません。`);
    return;
  }

  const scopeLabel = state.tagEditScope === 'all' ? '全期間' : '表示期間';
  const actionLabel = toTag
    ? `「${fromTag}」→「${toTag}」へ置換`
    : `「${fromTag}」を削除`;

  if (!confirm(`${scopeLabel}の ${matched.length}枚 に対して、${actionLabel}しますか？`)) return;

  const now = Date.now();
  const updated = matched.map(c => {
    const next = [];
    (c.tags || []).forEach(t => {
      if (t === fromTag) {
        if (toTag && !next.includes(toTag)) next.push(toTag);
      } else if (!next.includes(t)) {
        next.push(t);
      }
    });
    return { ...c, tags: next, lastupdated: now };
  });

  await bulkSaveCards(updated);
  DOM.tagEditFrom.value = '';
  DOM.tagEditTo.value = '';
  await renderTimeline({ preserveScroll: true });
  await renderDisplayPanel();
  alert(`完了しました (${updated.length}枚)。`);
});

DOM.btnTagAdd.addEventListener('click', async () => {
  const addTags = DOM.tagEditAdd.value
    .trim()
    .split(/\s+/)
    .map(normalizeTagToken)
    .filter(Boolean);

  if (addTags.length === 0) {
    alert('追加するタグを入力してください。');
    return;
  }

  const targets = await getTagEditTargets();
  if (targets.length === 0) {
    alert('対象のカードがありません。');
    return;
  }

  const scopeLabel = state.tagEditScope === 'all' ? '全期間' : '表示期間';
  if (!confirm(`${scopeLabel}の ${targets.length}枚 に ${addTags.join(' ')} を追加しますか？`)) return;

  const now = Date.now();
  const updated = [];
  targets.forEach(c => {
    const current = Array.isArray(c.tags) ? [...c.tags] : [];
    let changed = false;
    addTags.forEach(t => {
      if (!current.includes(t)) {
        current.push(t);
        changed = true;
      }
    });
    if (changed) {
      updated.push({ ...c, tags: current, lastupdated: now });
    }
  });

  if (updated.length > 0) await bulkSaveCards(updated);
  DOM.tagEditAdd.value = '';
  await renderTimeline({ preserveScroll: true });
  await renderDisplayPanel();
  alert(`タグを追加しました (${updated.length}枚)。`);
});

DOM.btnTagClearAll.addEventListener('click', async () => {
  const targets = await getTagEditTargets();
  const withTags = targets.filter(c => Array.isArray(c.tags) && c.tags.length > 0);
  if (withTags.length === 0) {
    alert('タグの付いた対象カードはありません。');
    return;
  }

  const scopeLabel = state.tagEditScope === 'all' ? '全期間' : '表示期間';
  if (!confirm(`${scopeLabel}の ${withTags.length}枚 から、すべてのタグを消去しますか？\n※本文やメモは消えません。`)) return;

  const now = Date.now();
  const updated = withTags.map(c => ({ ...c, tags: [], lastupdated: now }));
  await bulkSaveCards(updated);
  await renderTimeline({ preserveScroll: true });
  await renderDisplayPanel();
  alert(`タグを消去しました (${updated.length}枚)。`);
});

// --- 工房：JSONファイル制作（表示中のカード／選択中のカード） ---
document.querySelectorAll('[data-json-target]').forEach(btn => {
  btn.addEventListener('click', () => {
    state.jsonExportTarget = btn.dataset.jsonTarget;
    document.querySelectorAll('[data-json-target]').forEach(el => {
      el.classList.toggle('active', el.dataset.jsonTarget === state.jsonExportTarget);
    });
  });
});

async function buildWorkshopJsonExport() {
  let cards = [];
  if (state.jsonExportTarget === 'selected') {
    cards = await getSelectedCardsOrdered();
    if (cards.length === 0) {
      alert('チェック選択中のカードがありません。');
      return null;
    }
  } else {
    const allCards = await loadAllCards();
    const map = new Map(allCards.map(c => [c.id, c]));
    cards = state.lastRenderedIds.map(id => map.get(id)).filter(Boolean);
    if (cards.length === 0) {
      alert('表示中のカードがありません。');
      return null;
    }
  }

  const payload = {
    app: 'saikiyo2',
    version: 2,
    type: 'card_pack',
    exportedAt: Date.now(),
    cards,
    shelves: []
  };
  const jsonStr = JSON.stringify(payload, null, 2);
  const fileName = `saikiyo2_cards_${makeTimestampStr()}.json`;
  return { jsonStr, fileName, count: cards.length };
}

if (DOM.btnWorkshopExportShare) {
  DOM.btnWorkshopExportShare.addEventListener('click', async () => {
    const exp = await buildWorkshopJsonExport();
    if (!exp) return;

    const file = new File([exp.jsonStr], exp.fileName, { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: 'さいきよ2 カードファイル',
          text: `カード ${exp.count}枚`
        });
        return;
      } catch (err) {
        if (err && err.name === 'AbortError') return;
      }
    }
    downloadTextFile(exp.jsonStr, exp.fileName);
    alert(`JSONファイルを保存しました (${exp.count}枚)。`);
  });
}

if (DOM.btnWorkshopExportFile) {
  DOM.btnWorkshopExportFile.addEventListener('click', async () => {
    const exp = await buildWorkshopJsonExport();
    if (!exp) return;
    downloadTextFile(exp.jsonStr, exp.fileName);
  });
}

// --- タイムマシン（でかける：記憶済み条件を壊さず一時全期間切替 ／ かえる：元の条件へ戻して最新へ） ---
DOM.btnTimemachineGo.addEventListener('click', async () => {
  const val = DOM.timemachineDate.value;
  if (!val) {
    alert('日付を指定してください。');
    return;
  }

  state.timeMachineActive = true;
  searchModule.reset({ clearInputs: true, silent: true });

  await renderTimeline({ preserveScroll: false });

  const cards = Array.from(DOM.timeline.querySelectorAll('.card'));
  const sortOrder = getSortOrder();
  let targetEl = null;

  if (sortOrder === 'asc') {
    const targetTs = new Date(`${val}T00:00:00`).getTime();
    targetEl = cards.find(el => Number(el.dataset.id) >= targetTs) || cards[cards.length - 1];
  } else {
    const targetTs = new Date(`${val}T23:59:59.999`).getTime();
    targetEl = cards.find(el => Number(el.dataset.id) <= targetTs) || cards[cards.length - 1];
  }

  if (!targetEl) {
    alert('タイムラインにカードがありません。');
    return;
  }

  closeAllWings();
  targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

DOM.btnTimemachineBack.addEventListener('click', async () => {
  state.timeMachineActive = false;
  await renderTimeline({ forceBottom: true });
  closeAllWings();
  const targetTop = getSortOrder() === 'desc' ? 0 : DOM.timeline.scrollHeight;
  DOM.timeline.scrollTo({ top: targetTop, behavior: 'smooth' });
});

// --- コンソール＆タイムライン ---
function adjustTimelinePadding({ allowAutoScroll = true } = {}) {
  const wasAtLatest = isTimelineAtLatest();
  const isConsoleOpen = DOM.consoleArea.classList.contains('open');
  const pad = isConsoleOpen ? Math.max(DOM.consoleArea.offsetHeight + 16, 120) : 110;
  DOM.timeline.style.paddingBottom = `${pad}px`;

  if (allowAutoScroll && wasAtLatest && getSortOrder() === 'asc' && state.selectedIds.size === 0) {
    DOM.timeline.scrollTop = DOM.timeline.scrollHeight;
  }
}

window.addEventListener('resize', () => adjustTimelinePadding({ allowAutoScroll: true }));
DOM.inputContent.addEventListener('input', () => adjustTimelinePadding({ allowAutoScroll: true }));

function openInputConsole() {
  const wasAtLatest = isTimelineAtLatest();
  DOM.btnFab.style.display = 'none';
  DOM.consoleArea.classList.add('open');
  adjustTimelinePadding({ allowAutoScroll: wasAtLatest });
  setTimeout(() => DOM.inputContent.focus(), 100);
  history.pushState({ state: 'inputMode' }, '');
}

function closeInputConsole() {
  DOM.consoleArea.classList.remove('open');
  if (state.selectedIds.size === 0) {
    DOM.btnFab.style.display = 'flex';
  }
  adjustTimelinePadding({ allowAutoScroll: false });
  DOM.inputContent.blur();
  DOM.inputTags.blur();
}

DOM.btnFab.addEventListener('click', openInputConsole);

window.addEventListener('popstate', () => {
  if (DOM.consoleArea.classList.contains('open')) closeInputConsole();
});

function handleCheckboxChange(cardId, isChecked) {
  if (isChecked) {
    state.selectedIds.add(cardId);
    if (DOM.consoleArea.classList.contains('open')) history.back();
  } else {
    state.selectedIds.delete(cardId);
  }
  updateSelectionBar();
}

function updateSelectionBar() {
  updateSelectionBarUI(state.selectedIds.size, DOM);
}

async function renderTimeline({ forceBottom = false, preserveScroll = false } = {}) {
  const prevScroll = DOM.timeline.scrollTop;
  const wasAtLatest = isTimelineAtLatest();

  const allCards = await loadAllCards();
  DOM.timeline.innerHTML = '';

  const displayCards = filterCards(allCards);
  const sortOrder = getSortOrder();
  displayCards.sort((a, b) => (sortOrder === 'desc' ? b.id - a.id : a.id - b.id));
  state.lastRenderedIds = displayCards.map(c => c.id);

  const displayPrefs = settingsModule.getDisplayPrefs();
  displayCards.forEach(card => {
    const cardElement = createTankaCard(card, {
      isSelected: state.selectedIds.has(card.id),
      displayPrefs,
      onCheckChange: handleCheckboxChange,
      onOpen

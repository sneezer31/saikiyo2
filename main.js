/** さいきよ2 - メイン司令塔（3入口UI：表示・書庫・＋ / 期間・タグ・タグ編集・タイムマシン / 内蔵机） */

import {
  initDB,
  saveCard,
  loadAllCards,
  getCard,
  bulkSaveCards,
  saveShelf
} from './db.js';
import { createTankaCard, updateSelectionBarUI, formatDateWithWeekday } from './ui.js';
import { initShelfModule } from './shelf.js';
import { initDataManagerModule } from './dataManager.js';
import { initSearchModule } from './search.js';
import { initSettingsModule } from './settings.js';
import { initDeskModule } from './desk.js';

const SCROLL_POS_KEY = 'saikiyo2_scroll_pos';

const state = {
  filterDateFrom: '',
  filterDateTo: '',
  filterTagQuery: '',
  tagEditScope: 'filtered', // 'filtered'（表示期間対象） | 'all'（全期間対象）
  selectedIds: new Set(),
  lastRenderedIds: [],
  editingCardId: null,
  batchOriginalTags: new Set(),
  activeWing: null          // null | 'display' | 'shelf'
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
  btnDockReader: document.getElementById('btn-dock-reader'),
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
  btnCloseEdit: document.getElementById('btn-close-edit'),
  editTimestampGroup: document.getElementById('edit-timestamp-group'),
  editTimestamp: document.getElementById('edit-timestamp'),
  editContentView: document.getElementById('edit-content-view'),
  btnOpenReaderEdit: document.getElementById('btn-open-reader-edit'),
  editMemo: document.getElementById('edit-memo'),
  editTags: document.getElementById('edit-tags'),
  editTagsHint: document.getElementById('edit-tags-hint'),
  btnDeleteEdit: document.getElementById('btn-delete-edit'),
  btnCopyEdit: document.getElementById('btn-copy-edit'),
  btnShelfEdit: document.getElementById('btn-shelf-edit'),
  btnSaveEdit: document.getElementById('btn-save-edit'),
  // 閲覧パネル
  panelReader: document.getElementById('panel-reader'),
  readerTitle: document.getElementById('reader-title'),
  readerContent: document.getElementById('reader-content'),
  btnReaderCopy: document.getElementById('btn-reader-copy'),
  btnCloseReader: document.getElementById('btn-close-reader'),
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
  tagEditFrom: document.getElementById('tag-edit-from'),
  tagEditTo: document.getElementById('tag-edit-to'),
  btnTagReplace: document.getElementById('btn-tag-replace'),
  tagEditAdd: document.getElementById('tag-edit-add'),
  btnTagAdd: document.getElementById('btn-tag-add'),
  btnTagClearAll: document.getElementById('btn-tag-clear-all'),
  tagEditActiveList: document.getElementById('tag-edit-active-list'),
  timemachineDate: document.getElementById('timemachine-date'),
  btnTimemachineGo: document.getElementById('btn-timemachine-go'),
  btnTimemachineBack: document.getElementById('btn-timemachine-back')
};

// --- 閲覧パネル ---
function openReader(title, text) {
  DOM.readerTitle.textContent = title || '閲覧';
  DOM.readerContent.textContent = text || '';
  DOM.panelReader.scrollTop = 0;
  DOM.panelReader.classList.add('active');
}

DOM.btnCloseReader.addEventListener('click', () => {
  DOM.panelReader.classList.remove('active');
});

DOM.btnReaderCopy.addEventListener('click', async () => {
  const text = DOM.readerContent.textContent;
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    alert('コピーしました。');
  } catch (_) {
    alert('コピーに失敗しました。');
  }
});

// --- サブモジュール初期化 ---
const settingsModule = initSettingsModule({
  onDisplayPrefsChanged: async (opts) => {
    await renderTimeline(opts);
  }
});

const shelfModule = initShelfModule({
  onTimelineUpdated: () => renderTimeline({ forceBottom: true }),
  onShelfCountChanged: () => dataManagerModule.updateStats(),
  onCloseWings: closeAllWings,
  onOpenReader: openReader
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
  },
  onOpenReader: openReader
});

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
  if (hasActiveFilter()) return;
  clearTimeout(scrollSaveTimer);
  scrollSaveTimer = setTimeout(() => {
    try {
      localStorage.setItem(SCROLL_POS_KEY, String(DOM.timeline.scrollTop));
    } catch (_) {}
  }, 120);
});

// --- ウィングパネル制御 ---
function hasActiveFilter() {
  return Boolean(
    searchModule.isActive() ||
    state.filterDateFrom ||
    state.filterDateTo ||
    state.filterTagQuery.trim()
  );
}

function updateHeaderButtons() {
  DOM.btnOpenDisplay.classList.toggle('is-active', state.activeWing === 'display');
  DOM.btnOpenShelf.classList.toggle('is-active', state.activeWing === 'shelf');
}

async function openWing(wingName) {
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
  if (state.activeWing === 'display') closeAllWings();
  else openWing('display');
});

DOM.btnOpenShelf.addEventListener('click', () => {
  if (state.activeWing === 'shelf') closeAllWings();
  else openWing('shelf');
});

document.querySelectorAll('.btn-close-wing').forEach(btn => {
  btn.addEventListener('click', closeAllWings);
});

DOM.btnTop.addEventListener('click', () => {
  if (state.activeWing) closeAllWings();
  const targetTop = getSortOrder() === 'desc' ? 0 : DOM.timeline.scrollHeight;
  DOM.timeline.scrollTo({ top: targetTop, behavior: 'smooth' });
});

// --- 期間・タグ絞り込みロジック（AND / OR / タグ無し対応） ---
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

  result = searchModule.filterCards(result);
  return result;
}

// --- 表示パネル描画（期間・タグ・タグ編集・使用中タグ一覧） ---
async function renderDisplayPanel() {
  const allCards = await loadAllCards();
  const filtered = filterCards(allCards);

  if (hasActiveFilter()) {
    DOM.displayStatus.textContent = `表示 ${filtered.length} / 全期間 ${allCards.length}`;
  } else {
    DOM.displayStatus.textContent = `全期間 ${allCards.length}`;
  }

  DOM.filterDateFrom.value = state.filterDateFrom;
  DOM.filterDateTo.value = state.filterDateTo;
  if (DOM.filterTagInput.value !== state.filterTagQuery) {
    DOM.filterTagInput.value = state.filterTagQuery;
  }

  document.querySelectorAll('[data-tag-edit-scope]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tagEditScope === state.tagEditScope);
  });

  // タグ編集：対象範囲内の使用中タグ一覧
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
    DOM.tagEditActiveList.innerHTML = '<span style="color:var(--muted-color); font-size:var(--font-small);">タグはありません。</span>';
  } else {
    sortedTags.forEach(([tag, count]) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'filter-chip';
      btn.textContent = `${tag} (${count})`;
      btn.addEventListener('click', () => {
        DOM.tagEditFrom.value = tag;
      });
      DOM.tagEditActiveList.appendChild(btn);
    });
  }
}

// 期間＆タグ入力イベント
async function applyFilterAndRefresh() {
  await renderTimeline({ forceBottom: true });
  await renderDisplayPanel();
}

DOM.filterDateFrom.addEventListener('change', async () => {
  state.filterDateFrom = DOM.filterDateFrom.value;
  await applyFilterAndRefresh();
});

DOM.filterDateTo.addEventListener('change', async () => {
  state.filterDateTo = DOM.filterDateTo.value;
  await applyFilterAndRefresh();
});

DOM.btnClearDate.addEventListener('click', async () => {
  state.filterDateFrom = '';
  state.filterDateTo = '';
  DOM.filterDateFrom.value = '';
  DOM.filterDateTo.value = '';
  await applyFilterAndRefresh();
});

let tagFilterTimer = null;
DOM.filterTagInput.addEventListener('input', () => {
  state.filterTagQuery = DOM.filterTagInput.value;
  clearTimeout(tagFilterTimer);
  tagFilterTimer = setTimeout(applyFilterAndRefresh, 200);
});

DOM.btnClearTag.addEventListener('click', async () => {
  state.filterTagQuery = '';
  DOM.filterTagInput.value = '';
  await applyFilterAndRefresh();
});

document.querySelectorAll('.filter-helper-tag').forEach(btn => {
  btn.addEventListener('click', async () => {
    const tag = btn.dataset.helperTag;
    const current = DOM.filterTagInput.value.trim();
    const parts = current ? current.split(/\s+/) : [];
    if (!parts.includes(tag)) {
      parts.push(tag);
      state.filterTagQuery = parts.join(' ');
      DOM.filterTagInput.value = state.filterTagQuery;
      await applyFilterAndRefresh();
    }
  });
});

DOM.btnDisplayReset.addEventListener('click', async () => {
  state.filterDateFrom = '';
  state.filterDateTo = '';
  state.filterTagQuery = '';
  DOM.filterDateFrom.value = '';
  DOM.filterDateTo.value = '';
  DOM.filterTagInput.value = '';
  searchModule.reset({ clearInputs: true, silent: true });
  await applyFilterAndRefresh();
});

// --- タグ編集イベント（対象：表示期間対象 / 全期間対象） ---
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

function normalizeTagToken(raw) {
  const t = String(raw || '').trim();
  if (!t) return '';
  return t.startsWith('#') ? t : '#' + t;
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

  if (!confirm(`${scopeLabel}の ${matched.length} に対して、${actionLabel}しますか？`)) return;

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
  alert(`完了しました (${updated.length})。`);
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
  if (!confirm(`${scopeLabel}の ${targets.length} に ${addTags.join(' ')} を追加しますか？`)) return;

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
  alert(`タグを追加しました (${updated.length})。`);
});

DOM.btnTagClearAll.addEventListener('click', async () => {
  const targets = await getTagEditTargets();
  const withTags = targets.filter(c => Array.isArray(c.tags) && c.tags.length > 0);
  if (withTags.length === 0) {
    alert('タグの付いた対象カードはありません。');
    return;
  }

  const scopeLabel = state.tagEditScope === 'all' ? '全期間' : '表示期間';
  if (!confirm(`${scopeLabel}の ${withTags.length} から、すべてのタグを消去しますか？\n※本文やメモは消えません。`)) return;

  const now = Date.now();
  const updated = withTags.map(c => ({ ...c, tags: [], lastupdated: now }));
  await bulkSaveCards(updated);
  await renderTimeline({ preserveScroll: true });
  await renderDisplayPanel();
  alert(`タグを消去しました (${updated.length})。`);
});

// --- タイムマシン（でかける：全期間表示へ自動切替してその日付へ ／ かえる：最新へ） ---
DOM.btnTimemachineGo.addEventListener('click', async () => {
  const val = DOM.timemachineDate.value;
  if (!val) {
    alert('日付を指定してください。');
    return;
  }

  // 全期間表示へ切り替え
  state.filterDateFrom = '';
  state.filterDateTo = '';
  state.filterTagQuery = '';
  DOM.filterDateFrom.value = '';
  DOM.filterDateTo.value = '';
  DOM.filterTagInput.value = '';
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

DOM.btnTimemachineBack.addEventListener('click', () => {
  closeAllWings();
  const targetTop = getSortOrder() === 'desc' ? 0 : DOM.timeline.scrollHeight;
  DOM.timeline.scrollTo({ top: targetTop, behavior: 'smooth' });
});

// --- コンソール＆タイムライン ---
function adjustTimelinePadding({ allowAutoScroll = true } = {}) {
  const wasAtLatest = isTimelineAtLatest();
  const isConsoleOpen = DOM.consoleArea.classList.contains('open');
  const pad = isConsoleOpen ? Math.max(DOM.consoleArea.offsetHeight + 16, 120) : 96;
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
      onOpenEdit: openEditPanel
    });
    DOM.timeline.appendChild(cardElement);
  });

  searchModule.updateUI(displayCards.length);

  if (preserveScroll) {
    DOM.timeline.scrollTop = prevScroll;
  } else if (forceBottom || wasAtLatest) {
    DOM.timeline.scrollTop = sortOrder === 'desc' ? 0 : DOM.timeline.scrollHeight;
  } else {
    DOM.timeline.scrollTop = prevScroll;
  }
}

async function getSelectedCardsOrdered() {
  const cards = (await Promise.all(Array.from(state.selectedIds).map(id => getCard(id)))).filter(Boolean);
  const sortOrder = getSortOrder();
  cards.sort((a, b) => (sortOrder === 'desc' ? b.id - a.id : a.id - b.id));
  return cards;
}

DOM.btnSelectAll.addEventListener('click', () => {
  DOM.timeline.querySelectorAll('.card').forEach(el => {
    const id = Number(el.dataset.id);
    if (!Number.isNaN(id)) {
      state.selectedIds.add(id);
      const chk = el.querySelector('.card-check');
      if (chk) chk.checked = true;
    }
  });
  updateSelectionBar();
});

DOM.btnCancelSelection.addEventListener('click', () => {
  state.selectedIds.clear();
  DOM.timeline.querySelectorAll('.card-check').forEach(chk => { chk.checked = false; });
  updateSelectionBar();
});

DOM.btnDockReader.addEventListener('click', async () => {
  if (state.selectedIds.size === 0) return;
  const cards = await getSelectedCardsOrdered();
  if (cards.length === 0) return;
  openReader(`閲覧 (${cards.length})`, cards.map(c => c.content).join('\n\n'));
});

DOM.btnToDesk.addEventListener('click', async () => {
  if (state.selectedIds.size === 0) return;
  const cards = await getSelectedCardsOrdered();
  if (cards.length === 0) return;
  deskModule.open(cards);
});

DOM.btnSend.addEventListener('click', async () => {
  const content = DOM.inputContent.value.trim();
  if (!content) return;

  const tags = DOM.inputTags.value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(t => (t.startsWith('#') ? t : '#' + t));

  const now = Date.now();
  await saveCard({ id: now, content, memo: '', tags, lastupdated: now });

  DOM.inputContent.value = '';
  DOM.inputTags.value = '';
  adjustTimelinePadding({ allowAutoScroll: false });

  const searchResult = searchModule.handleCardCreated(now);
  await renderTimeline({ forceBottom: searchResult !== 'added_suiko' });
});

// --- カード編集・一括編集パネル ---
function openEditPanel(card) {
  state.editingCardId = card.id;
  state.batchOriginalTags.clear();
  DOM.editPanelTitle.textContent = 'カード編集';
  DOM.editTimestampGroup.style.display = 'flex';
  DOM.editTimestamp.textContent = formatDateWithWeekday(card.id);
  DOM.editContentView.innerText = card.content;
  DOM.editMemo.disabled = false;
  DOM.editMemo.value = card.memo || '';
  DOM.editTags.value = Array.isArray(card.tags) ? card.tags.join(' ') : '';
  DOM.editTagsHint.style.display = 'none';
  DOM.panelEdit.classList.add('active');
}

DOM.btnCloseEdit.addEventListener('click', () => {
  DOM.panelEdit.classList.remove('active');
  DOM.editMemo.disabled = false;
});

DOM.btnOpenReaderEdit.addEventListener('click', async () => {
  if (state.editingCardId === 'batch') {
    const cards = await getSelectedCardsOrdered();
    if (cards.length === 0) return;
    openReader(`閲覧 (${cards.length})`, cards.map(c => c.content).join('\n\n'));
  } else {
    openReader('閲覧', DOM.editContentView.innerText);
  }
});

document.querySelectorAll('.helper-tag').forEach(btn => {
  btn.addEventListener('click', (e) => {
    const tag = e.target.innerText.trim();
    const current = DOM.editTags.value.trim().split(/\s+/).filter(Boolean);
    if (!current.includes(tag)) {
      current.push(tag);
      DOM.editTags.value = current.join(' ');
    }
  });
});

DOM.btnBatchEdit.addEventListener('click', async () => {
  if (state.selectedIds.size === 0) return;
  const cards = await getSelectedCardsOrdered();
  if (cards.length === 0) return;

  state.editingCardId = 'batch';
  DOM.editPanelTitle.textContent = `一括編集 (${cards.length})`;
  DOM.editTimestampGroup.style.display = 'none';
  DOM.editTimestamp.textContent = '';
  DOM.editContentView.innerText = cards.map(c => c.content).join('\n---\n');
  DOM.editMemo.value = '※複数選択時はメモを編集できません';
  DOM.editMemo.disabled = true;

  const unionTags = new Set();
  cards.forEach(c => {
    if (Array.isArray(c.tags)) {
      c.tags.forEach(t => {
        const cleaned = String(t).trim();
        if (cleaned) unionTags.add(cleaned.startsWith('#') ? cleaned : '#' + cleaned);
      });
    }
  });

  state.batchOriginalTags = new Set(unionTags);
  DOM.editTags.value = Array.from(unionTags).join(' ');
  DOM.editTagsHint.textContent = '消したタグだけ削除され、足したタグだけ追加されます（各カード固有のタグは保持）。';
  DOM.editTagsHint.style.display = 'block';
  DOM.panelEdit.classList.add('active');
});

DOM.btnSaveEdit.addEventListener('click', async () => {
  const newTagsInput = DOM.editTags.value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(t => (t.startsWith('#') ? t : '#' + t));
  const now = Date.now();

  if (state.editingCardId === 'batch') {
    const newTagSet = new Set(newTagsInput);
    const origTagSet = state.batchOriginalTags;
    const tagsToRemove = new Set([...origTagSet].filter(t => !newTagSet.has(t)));
    const tagsToAdd = new Set([...newTagSet].filter(t => !origTagSet.has(t)));

    const updatedCards = (await Promise.all(Array.from(state.selectedIds).map(async (id) => {
      const card = await getCard(id);
      if (!card) return null;
      const currentTags = Array.isArray(card.tags) ? card.tags : [];
      const nextTags = currentTags.filter(t => !tagsToRemove.has(t));
      tagsToAdd.forEach(t => {
        if (!nextTags.includes(t)) nextTags.push(t);
      });
      card.tags = nextTags;
      card.lastupdated = now;
      return card;
    }))).filter(Boolean);

    await bulkSaveCards(updatedCards);
    state.selectedIds.clear();
    state.batchOriginalTags.clear();
    updateSelectionBar();
  } else {
    const card = await getCard(state.editingCardId);
    if (card) {
      card.memo = DOM.editMemo.value;
      card.tags = Array.from(new Set(newTagsInput));
      card.lastupdated = now;
      await saveCard(card);
    }
  }

  await renderTimeline({ preserveScroll: true });
  DOM.panelEdit.classList.remove('active');
  DOM.editMemo.disabled = false;
});

DOM.btnCopyEdit.addEventListener('click', async () => {
  let contentToCopy = '';
  if (state.editingCardId === 'batch') {
    const cards = await getSelectedCardsOrdered();
    contentToCopy = cards.map(c => c.content).join('\n\n');
  } else {
    contentToCopy = DOM.editContentView.innerText;
  }

  try {
    await navigator.clipboard.writeText(contentToCopy);
    alert('コピーしました。');
  } catch (_) {
    alert('コピーに失敗しました。');
  }
});

// 原本をタイムラインに残したまま書庫へコピー保管
DOM.btnShelfEdit.addEventListener('click', async () => {
  const now = Date.now();
  const inputTags = DOM.editTags.value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(t => (t.startsWith('#') ? t : '#' + t));

  if (state.editingCardId === 'batch') {
    const cards = await getSelectedCardsOrdered();
    if (cards.length === 0) return;

    const title = cards[0].content.replace(/\s+/g, '').slice(0, 5) || '無題';
    const items = cards.map(c => ({
      id: c.id,
      content: c.content,
      memo: c.memo || '',
      tags: Array.isArray(c.tags) ? [...c.tags] : [],
      lastupdated: c.lastupdated || c.id
    }));

    await saveShelf({ id: now, title, memo: '', tags: inputTags, items, order: now, lastupdated: now });
  } else {
    const card = await getCard(state.editingCardId);
    if (!card) return;

    const title = card.content.replace(/\s+/g, '').slice(0, 5) || '無題';
    const currentMemo = DOM.editMemo.value;
    const snapshot = {
      id: card.id,
      content: card.content,
      memo: currentMemo,
      tags: inputTags,
      lastupdated: card.lastupdated || card.id
    };

    await saveShelf({ id: now, title, memo: currentMemo, tags: inputTags, items: [snapshot], order: now, lastupdated: now });
  }

  alert('書庫へ保管しました。');
});

// ゴミ箱へ移動（ローカルストレージ隔離箱へ退避）
DOM.btnDeleteEdit.addEventListener('click', async () => {
  if (state.editingCardId === 'batch') {
    const cards = await getSelectedCardsOrdered();
    if (cards.length === 0) return;
    if (!confirm(`選択中の ${cards.length} をゴミ箱へ移しますか？\n※書庫のデータ管理→ゴミ箱からいつでも戻せます。`)) return;
    await dataManagerModule.moveCardsToTrash(cards);
    state.selectedIds.clear();
  } else {
    const card = await getCard(state.editingCardId);
    if (!card) return;
    if (!confirm('このカードをゴミ箱へ移しますか？\n※書庫のデータ管理→ゴミ箱からいつでも戻せます。')) return;
    await dataManagerModule.moveCardsToTrash([card]);
    state.selectedIds.delete(card.id);
  }

  updateSelectionBar();
  await renderTimeline({ preserveScroll: true });
  DOM.panelEdit.classList.remove('active');
  DOM.editMemo.disabled = false;
});

// --- 起動処理 ---
window.addEventListener('DOMContentLoaded', async () => {
  settingsModule.load();
  await initDB();
  await dataManagerModule.migrateLegacyTrash();

  adjustTimelinePadding({ allowAutoScroll: false });
  await renderTimeline({ forceBottom: true });

  const savedScroll = localStorage.getItem(SCROLL_POS_KEY);
  if (savedScroll !== null) {
    const pos = parseInt(savedScroll, 10);
    if (!Number.isNaN(pos)) DOM.timeline.scrollTop = pos;
  }

  updateHeaderButtons();
});

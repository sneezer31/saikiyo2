/** さいきよ2 - メイン司令塔（左上アコーディオン・状態表示ボタン・書庫・ギアチェンジ検索・大型選択ドック） */

import {
  initDB,
  saveCard,
  loadAllCards,
  getCard,
  bulkSaveCards,
  deleteCard,
  saveShelf
} from './db.js';
import { createTankaCard, updateSelectionBarUI, formatDateWithWeekday } from './ui.js';
import { initShelfModule } from './shelf.js';
import { initDataManagerModule } from './dataManager.js';
import { initSearchModule } from './search.js';
import { initSettingsModule } from './settings.js';

const SCROLL_POS_KEY = 'saikiyo2_scroll_pos';

let state = {
  viewScope: 'active',       // 'active' | 'trash'
  filterTags: new Set(),     // タグ名 または '__NO_TAG__'
  filterDateFrom: '',
  filterDateTo: '',
  sortOrder: 'asc',          // 'asc' | 'desc'
  memoMode: 'badge',         // 'badge' | 'full'
  selectedIds: new Set(),
  lastRenderedIds: [],
  editingCardId: null,
  batchOriginalTags: new Set(),
  activeWing: null,          // null | 'display' | 'design' | 'config' | 'data' | 'shelf'
  isAccordionOpen: false
};

const DOM = {
  timeline: document.getElementById('timeline'),
  btnLeftWing: document.getElementById('btn-left-wing'),
  leftAccordion: document.getElementById('left-wing-accordion'),
  btnTop: document.getElementById('btn-top'),
  btnRightWing: document.getElementById('btn-right-wing'),
  btnOpenShelf: document.getElementById('btn-open-shelf'),
  btnFab: document.getElementById('btn-fab'),
  trashModeBanner: document.getElementById('trash-mode-banner'),
  btnExitTrashMode: document.getElementById('btn-exit-trash-mode'),
  footerBar: document.getElementById('footer-bar'),
  footerNormal: document.getElementById('footer-normal'),
  // 右端フロート選択ドック
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
  // 編集パネル
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
  editRestoreRow: document.getElementById('edit-restore-row'),
  btnRestoreEdit: document.getElementById('btn-restore-edit'),
  btnSaveEdit: document.getElementById('btn-save-edit'),
  btnDeleteEdit: document.getElementById('btn-delete-edit'),
  btnCopyEdit: document.getElementById('btn-copy-edit'),
  btnShelfEdit: document.getElementById('btn-shelf-edit'),
  // 鑑賞モード（広げて読む）
  panelReader: document.getElementById('panel-reader'),
  readerTitle: document.getElementById('reader-title'),
  readerContent: document.getElementById('reader-content'),
  btnReaderCopy: document.getElementById('btn-reader-copy'),
  btnCloseReader: document.getElementById('btn-close-reader'),
  // ウィングパネル
  panelDisplay: document.getElementById('panel-display'),
  panelDesign: document.getElementById('panel-design'),
  panelConfig: document.getElementById('panel-config'),
  panelData: document.getElementById('panel-data'),
  panelShelf: document.getElementById('panel-shelf'),
  // 表示パネル
  btnDisplayReset: document.getElementById('btn-display-reset'),
  displayStatus: document.getElementById('display-status'),
  btnScopeTrash: document.getElementById('btn-scope-trash'),
  displayTagList: document.getElementById('display-tag-list'),
  filterDateFrom: document.getElementById('filter-date-from'),
  filterDateTo: document.getElementById('filter-date-to'),
  dateJumpInput: document.getElementById('date-jump-input'),
  btnDateJump: document.getElementById('btn-date-jump'),
  btnJumpLatest: document.getElementById('btn-jump-latest')
};

// --- スマートスクロール判定＆位置記憶 ---
function isTimelineAtLatest() {
  if (state.sortOrder === 'desc') {
    return DOM.timeline.scrollTop <= 40;
  }
  return (DOM.timeline.scrollHeight - DOM.timeline.scrollTop) <= (DOM.timeline.clientHeight + 40);
}

let scrollSaveTimer = null;
DOM.timeline.addEventListener('scroll', () => {
  if (state.viewScope !== 'active' || hasActiveFilter()) return;
  clearTimeout(scrollSaveTimer);
  scrollSaveTimer = setTimeout(() => {
    try {
      localStorage.setItem(SCROLL_POS_KEY, String(DOM.timeline.scrollTop));
    } catch (_) {}
  }, 120);
});

// --- サブモジュール初期化 ---
const settingsModule = initSettingsModule();

const shelfModule = initShelfModule({
  onTimelineUpdated: () => renderTimeline({ forceBottom: true }),
  onCloseWings: closeAllWings
});

const dataManagerModule = initDataManagerModule({
  onDataChanged: async () => {
    await renderTimeline({ preserveScroll: true });
    await shelfModule.updateBadge();
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
    updateHeaderWingButtons();
  }
});

// --- ウィングパネル＆左上アコーディオン制御 ---
const wingPanels = {
  display: DOM.panelDisplay,
  design: DOM.panelDesign,
  config: DOM.panelConfig,
  data: DOM.panelData,
  shelf: DOM.panelShelf
};

function hasActiveFilter() {
  return Boolean(
    searchModule.isActive() ||
    state.filterTags.size > 0 ||
    state.filterDateFrom ||
    state.filterDateTo
  );
}

function setAccordionOpen(open) {
  state.isAccordionOpen = open;
  if (DOM.leftAccordion) {
    DOM.leftAccordion.classList.toggle('open', open);
    DOM.leftAccordion.setAttribute('aria-hidden', open ? 'false' : 'true');
  }
  if (DOM.btnLeftWing) {
    DOM.btnLeftWing.setAttribute('aria-expanded', open ? 'true' : 'false');
  }
  updateHeaderWingButtons();
}

function updateHeaderWingButtons() {
  const filterMark = hasActiveFilter() ? '●' : '';
  const arrow = state.isAccordionOpen ? '▴' : '▾';

  let currentLabel = state.viewScope === 'trash' ? `ゴミ箱${filterMark}` : `タイムライン${filterMark}`;
  let isLeftPanelActive = false;

  if (state.activeWing === 'display') {
    currentLabel = `表示${filterMark}`;
    isLeftPanelActive = true;
  } else if (state.activeWing === 'design') {
    currentLabel = '設定';
    isLeftPanelActive = true;
  } else if (state.activeWing === 'config') {
    currentLabel = 'コンフィグ';
    isLeftPanelActive = true;
  }

  DOM.btnLeftWing.textContent = `${currentLabel} ${arrow}`;
  DOM.btnLeftWing.classList.toggle('is-active', isLeftPanelActive || state.isAccordionOpen);

  // アコーディオン内のアクティブ項目を現在状態に同期
  const activeKey = (state.activeWing === 'display' || state.activeWing === 'design' || state.activeWing === 'config')
    ? state.activeWing
    : 'none';
  document.querySelectorAll('.accordion-item').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.wingTarget === activeKey);
  });

  DOM.btnRightWing.classList.toggle('is-active', state.activeWing === 'data');
  DOM.trashModeBanner.style.display = state.viewScope === 'trash' ? 'flex' : 'none';
}

async function openWing(wingName) {
  setAccordionOpen(false);
  Object.values(wingPanels).forEach(p => { if (p) p.classList.remove('active'); });
  state.activeWing = wingName;

  if (wingName && wingPanels[wingName]) {
    wingPanels[wingName].classList.add('active');
    if (wingName === 'display') {
      await renderDisplayPanel();
    } else if (wingName === 'shelf') {
      await shelfModule.open();
    } else if (wingName === 'data') {
      await dataManagerModule.updateStats();
    }
  }
  updateHeaderWingButtons();
}

function closeAllWings() {
  openWing(null);
}

// 左上ボタン：アコーディオンの開閉トグル
DOM.btnLeftWing.addEventListener('click', (e) => {
  e.stopPropagation();
  setAccordionOpen(!state.isAccordionOpen);
});

// アコーディオン各項目の選択
document.querySelectorAll('.accordion-item').forEach(btn => {
  btn.addEventListener('click', async (e) => {
    e.stopPropagation();
    const target = btn.dataset.wingTarget;
    if (target === 'none') closeAllWings();
    else await openWing(target);
  });
});

// アコーディオン外をクリックしたら閉じる
document.addEventListener('click', (e) => {
  if (!state.isAccordionOpen) return;
  if (DOM.leftAccordion && DOM.leftAccordion.contains(e.target)) return;
  if (DOM.btnLeftWing && DOM.btnLeftWing.contains(e.target)) return;
  setAccordionOpen(false);
});

DOM.btnRightWing.addEventListener('click', () => {
  if (state.activeWing === 'data') closeAllWings();
  else openWing('data');
});

DOM.btnOpenShelf.addEventListener('click', () => {
  if (state.activeWing === 'shelf') closeAllWings();
  else openWing('shelf');
});

document.querySelectorAll('.btn-close-wing').forEach(btn => {
  btn.addEventListener('click', closeAllWings);
});

DOM.btnExitTrashMode.addEventListener('click', async () => {
  state.viewScope = 'active';
  state.selectedIds.clear();
  updateSelectionBar();
  await renderTimeline({ forceBottom: true });
  updateHeaderWingButtons();
});

DOM.btnTop.addEventListener('click', () => {
  if (state.activeWing || state.isAccordionOpen) closeAllWings();
  const targetTop = state.sortOrder === 'desc' ? 0 : DOM.timeline.scrollHeight;
  DOM.timeline.scrollTo({ top: targetTop, behavior: 'smooth' });
});

// --- 日付ジャンプ ---
if (DOM.btnDateJump) {
  DOM.btnDateJump.addEventListener('click', () => {
    const val = DOM.dateJumpInput ? DOM.dateJumpInput.value : '';
    if (!val) {
      alert('移動したい日付を指定してください。');
      return;
    }

    const cards = Array.from(DOM.timeline.querySelectorAll('.card'));
    let targetEl = null;

    if (state.sortOrder === 'asc') {
      const targetTs = new Date(`${val}T00:00:00`).getTime();
      targetEl = cards.find(el => Number(el.dataset.id) >= targetTs);
    } else {
      const targetTs = new Date(`${val}T23:59:59.999`).getTime();
      targetEl = cards.find(el => Number(el.dataset.id) <= targetTs);
    }

    if (!targetEl) {
      alert('指定した日付付近に該当するカードがありません。');
      return;
    }

    closeAllWings();
    targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

if (DOM.btnJumpLatest) {
  DOM.btnJumpLatest.addEventListener('click', () => {
    closeAllWings();
    const targetTop = state.sortOrder === 'desc' ? 0 : DOM.timeline.scrollHeight;
    DOM.timeline.scrollTo({ top: targetTop, behavior: 'smooth' });
  });
}

// --- 表示パネル（対象切替・絞り込み・並び順・メモ表示） ---
function filterByScope(allCards) {
  return state.viewScope === 'trash'
    ? allCards.filter(c => Boolean(c.deletedAt))
    : allCards.filter(c => !c.deletedAt);
}

function filterCards(allCards) {
  let result = filterByScope(allCards);

  if (state.filterTags.size > 0) {
    result = result.filter(c => {
      const cardTags = Array.isArray(c.tags) ? c.tags : [];
      for (const reqTag of state.filterTags) {
        if (reqTag === '__NO_TAG__') {
          if (cardTags.length > 0) return false;
        } else {
          if (!cardTags.includes(reqTag)) return false;
        }
      }
      return true;
    });
  }

  if (state.filterDateFrom) {
    const fromTs = new Date(`${state.filterDateFrom}T00:00:00`).getTime();
    if (!Number.isNaN(fromTs)) result = result.filter(c => c.id >= fromTs);
  }

  if (state.filterDateTo) {
    const toTs = new Date(`${state.filterDateTo}T23:59:59.999`).getTime();
    if (!Number.isNaN(toTs)) result = result.filter(c => c.id <= toTs);
  }

  result = searchModule.filterCards(result);
  return result;
}

async function renderDisplayPanel() {
  const allCards = await loadAllCards();
  const scopedCards = filterByScope(allCards);
  const filtered = filterCards(allCards);
  const trashCount = allCards.filter(c => Boolean(c.deletedAt)).length;

  if (DOM.btnScopeTrash) {
    DOM.btnScopeTrash.textContent = `ゴミ箱 (${trashCount})`;
  }
  document.querySelectorAll('[data-scope]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.scope === state.viewScope);
  });

  const scopeLabel = state.viewScope === 'trash' ? 'ゴミ箱' : '通常';
  if (hasActiveFilter()) {
    const searchNote = searchModule.isActive() ? `（${searchModule.getStatusLabel()}）` : '';
    DOM.displayStatus.textContent = `${scopeLabel}を絞り込み中：${filtered.length} / ${scopedCards.length} 件${searchNote}`;
  } else {
    DOM.displayStatus.textContent = `${scopeLabel}を全件表示中：${scopedCards.length} 件`;
  }

  const tagCounts = new Map();
  let noTagCount = 0;
  scopedCards.forEach(c => {
    const tags = Array.isArray(c.tags) ? c.tags : [];
    if (tags.length === 0) noTagCount++;
    else tags.forEach(t => tagCounts.set(t, (tagCounts.get(t) || 0) + 1));
  });

  DOM.displayTagList.innerHTML = '';

  const sortedTags = Array.from(tagCounts.entries()).sort((a, b) => b[1] - a[1]);
  sortedTags.forEach(([tag, count]) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'filter-chip' + (state.filterTags.has(tag) ? ' active' : '');
    btn.textContent = `${tag} (${count})`;
    btn.addEventListener('click', async () => {
      if (state.filterTags.has(tag)) state.filterTags.delete(tag);
      else state.filterTags.add(tag);
      await renderTimeline({ forceBottom: true });
      await renderDisplayPanel();
      updateHeaderWingButtons();
    });
    DOM.displayTagList.appendChild(btn);
  });

  if (noTagCount > 0) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'filter-chip' + (state.filterTags.has('__NO_TAG__') ? ' active' : '');
    btn.textContent = `タグなし (${noTagCount})`;
    btn.addEventListener('click', async () => {
      if (state.filterTags.has('__NO_TAG__')) state.filterTags.delete('__NO_TAG__');
      else state.filterTags.add('__NO_TAG__');
      await renderTimeline({ forceBottom: true });
      await renderDisplayPanel();
      updateHeaderWingButtons();
    });
    DOM.displayTagList.appendChild(btn);
  }

  if (sortedTags.length === 0 && noTagCount === 0) {
    DOM.displayTagList.innerHTML = `<span style="color:var(--muted-color); font-size:0.85rem;">${scopeLabel}にカードはありません。</span>`;
  }

  DOM.filterDateFrom.value = state.filterDateFrom;
  DOM.filterDateTo.value = state.filterDateTo;

  document.querySelectorAll('[data-sort]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.sort === state.sortOrder);
  });
  document.querySelectorAll('[data-memo-mode]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.memoMode === state.memoMode);
  });
}

document.querySelectorAll('[data-scope]').forEach(btn => {
  btn.addEventListener('click', async () => {
    const nextScope = btn.dataset.scope;
    if (state.viewScope === nextScope) return;
    state.viewScope = nextScope;
    state.selectedIds.clear();
    updateSelectionBar();
    await renderTimeline({ forceBottom: true });
    await renderDisplayPanel();
    updateHeaderWingButtons();
  });
});

DOM.btnDisplayReset.addEventListener('click', async () => {
  state.viewScope = 'active';
  state.filterTags.clear();
  state.filterDateFrom = '';
  state.filterDateTo = '';
  state.selectedIds.clear();
  updateSelectionBar();
  searchModule.reset({ clearInputs: true });
  await renderDisplayPanel();
  updateHeaderWingButtons();
});

DOM.filterDateFrom.addEventListener('change', async () => {
  state.filterDateFrom = DOM.filterDateFrom.value;
  await renderTimeline({ forceBottom: true });
  await renderDisplayPanel();
  updateHeaderWingButtons();
});

DOM.filterDateTo.addEventListener('change', async () => {
  state.filterDateTo = DOM.filterDateTo.value;
  await renderTimeline({ forceBottom: true });
  await renderDisplayPanel();
  updateHeaderWingButtons();
});

document.querySelectorAll('[data-sort]').forEach(btn => {
  btn.addEventListener('click', async () => {
    state.sortOrder = btn.dataset.sort;
    await renderTimeline({ forceBottom: true });
    await renderDisplayPanel();
  });
});

document.querySelectorAll('[data-memo-mode]').forEach(btn => {
  btn.addEventListener('click', async () => {
    state.memoMode = btn.dataset.memoMode;
    await renderTimeline({ preserveScroll: true });
    await renderDisplayPanel();
  });
});

// --- コンソール＆タイムライン ---
function adjustTimelinePadding({ allowAutoScroll = true } = {}) {
  const wasAtLatest = isTimelineAtLatest();
  const isConsoleOpen = DOM.consoleArea.classList.contains('open');
  const activeElement = isConsoleOpen ? DOM.consoleArea : DOM.footerBar;
  const pad = Math.max(activeElement.offsetHeight, 64);
  DOM.timeline.style.paddingBottom = `${pad}px`;

  if (allowAutoScroll && wasAtLatest && state.sortOrder === 'asc' && state.selectedIds.size === 0) {
    DOM.timeline.scrollTop = DOM.timeline.scrollHeight;
  }
}

window.addEventListener('resize', () => adjustTimelinePadding({ allowAutoScroll: true }));
DOM.inputContent.addEventListener('input', () => adjustTimelinePadding({ allowAutoScroll: true }));

function openInputConsole() {
  const wasAtLatest = isTimelineAtLatest();
  DOM.footerBar.style.display = 'none';
  DOM.consoleArea.classList.add('open');
  adjustTimelinePadding({ allowAutoScroll: wasAtLatest });
  setTimeout(() => DOM.inputContent.focus(), 100);
  history.pushState({ state: 'inputMode' }, '');
}

function closeInputConsole() {
  DOM.consoleArea.classList.remove('open');
  if (state.selectedIds.size === 0) {
    DOM.footerBar.style.display = 'block';
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

async function renderTimeline({ forceBottom = false, preserveScroll = false } = {}) {
  const prevScroll = DOM.timeline.scrollTop;
  const wasAtLatest = isTimelineAtLatest();

  const allCards = await loadAllCards();
  DOM.timeline.innerHTML = '';

  const displayCards = filterCards(allCards);
  displayCards.sort((a, b) => (state.sortOrder === 'desc' ? b.id - a.id : a.id - b.id));
  state.lastRenderedIds = displayCards.map(c => c.id);

  const showMemoFull = state.memoMode === 'full';
  displayCards.forEach(card => {
    const isSelected = state.selectedIds.has(card.id);
    const cardElement = createTankaCard(card, isSelected, handleCheckboxChange, openEditPanel, showMemoFull);
    DOM.timeline.appendChild(cardElement);
  });

  searchModule.updateUI(displayCards.length);

  if (preserveScroll) {
    DOM.timeline.scrollTop = prevScroll;
  } else if (forceBottom || wasAtLatest) {
    DOM.timeline.scrollTop = state.sortOrder === 'desc' ? 0 : DOM.timeline.scrollHeight;
  } else {
    DOM.timeline.scrollTop = prevScroll;
  }
}

function updateSelectionBar() {
  updateSelectionBarUI(state.selectedIds.size, DOM);
}

async function getSelectedCardsOrdered() {
  const cards = (await Promise.all(Array.from(state.selectedIds).map(id => getCard(id)))).filter(Boolean);
  cards.sort((a, b) => (state.sortOrder === 'desc' ? b.id - a.id : a.id - b.id));
  return cards;
}

DOM.btnSelectAll.addEventListener('click', () => {
  const cardEls = DOM.timeline.querySelectorAll('.card');
  cardEls.forEach(el => {
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
  openReader(`鑑賞モード（${cards.length}首）`, cards.map(c => c.content).join('\n\n'));
});

DOM.btnSend.addEventListener('click', async () => {
  const content = DOM.inputContent.value.trim();
  if (!content) return;

  const tags = DOM.inputTags.value.trim().split(/\s+/).filter(Boolean).map(t => t.startsWith('#') ? t : '#' + t);
  const now = Date.now();
  await saveCard({ id: now, content, memo: '', tags, lastupdated: now, deletedAt: null });

  DOM.inputContent.value = '';
  DOM.inputTags.value = '';
  adjustTimelinePadding({ allowAutoScroll: false });

  const searchResult = searchModule.handleCardCreated(now);

  if (state.viewScope === 'trash') {
    state.viewScope = 'active';
  }
  updateHeaderWingButtons();

  await renderTimeline({ forceBottom: searchResult !== 'added_suiko' });
});

// --- 鑑賞モード（広げて読む） ---
function openReader(title, text) {
  DOM.readerTitle.textContent = title || '鑑賞モード';
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

// --- 詳細・編集パネル ---
function configureEditTrashButtons(isTrashMode) {
  DOM.editRestoreRow.style.display = isTrashMode ? 'flex' : 'none';
  DOM.btnDeleteEdit.textContent = isTrashMode ? '完全削除' : 'ゴミ箱へ';
}

function openEditPanel(card) {
  state.editingCardId = card.id;
  state.batchOriginalTags.clear();
  DOM.editPanelTitle.textContent = '詳細・編集';
  DOM.editTimestampGroup.style.display = 'flex';
  const deletedNote = card.deletedAt ? ` ／ ゴミ箱移動: ${formatDateWithWeekday(card.deletedAt)}` : '';
  DOM.editTimestamp.textContent = `${formatDateWithWeekday(card.id)}${deletedNote}`;
  DOM.editContentView.innerText = card.content;
  DOM.editMemo.disabled = false;
  DOM.editMemo.value = card.memo || '';
  DOM.editTags.value = Array.isArray(card.tags) ? card.tags.join(' ') : '';
  DOM.editTagsHint.style.display = 'none';
  configureEditTrashButtons(Boolean(card.deletedAt));
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
    openReader(`鑑賞モード（${cards.length}首）`, cards.map(c => c.content).join('\n\n'));
  } else {
    openReader('鑑賞モード', DOM.editContentView.innerText);
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
  DOM.editPanelTitle.textContent = `一括編集（${cards.length}件）`;
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
  DOM.editTagsHint.textContent = '※一括編集：消したタグだけ削除され、足したタグだけ追加されます（各カード固有のタグは保持）。';
  DOM.editTagsHint.style.display = 'block';

  configureEditTrashButtons(state.viewScope === 'trash');
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

DOM.btnRestoreEdit.addEventListener('click', async () => {
  const now = Date.now();

  if (state.editingCardId === 'batch') {
    const updatedCards = (await Promise.all(Array.from(state.selectedIds).map(async (id) => {
      const card = await getCard(id);
      if (!card) return null;
      card.deletedAt = null;
      card.lastupdated = now;
      return card;
    }))).filter(Boolean);

    await bulkSaveCards(updatedCards);
    state.selectedIds.clear();
    updateSelectionBar();
  } else {
    const card = await getCard(state.editingCardId);
    if (card) {
      card.deletedAt = null;
      card.lastupdated = now;
      await saveCard(card);
      state.selectedIds.delete(card.id);
      updateSelectionBar();
    }
  }

  await renderTimeline({ preserveScroll: true });
  await dataManagerModule.checkMonthlyTrashReminder();
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

DOM.btnShelfEdit.addEventListener('click', async () => {
  const now = Date.now();
  const inputTags = DOM.editTags.value.trim().split(/\s+/).filter(Boolean).map(t => t.startsWith('#') ? t : '#' + t);

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

  await shelfModule.updateBadge();
  alert('書庫に収めました。');
});

DOM.btnDeleteEdit.addEventListener('click', async () => {
  const now = Date.now();
  const isTrashMode = state.editingCardId === 'batch'
    ? state.viewScope === 'trash'
    : Boolean((await getCard(state.editingCardId))?.deletedAt);

  if (state.editingCardId === 'batch') {
    if (isTrashMode) {
      if (!confirm(`選択された ${state.selectedIds.size} 件を完全に削除しますか？この操作は取り消せません。`)) return;
      await Promise.all(Array.from(state.selectedIds).map(id => deleteCard(id)));
    } else {
      const updatedCards = (await Promise.all(Array.from(state.selectedIds).map(async (id) => {
        const card = await getCard(id);
        if (!card) return null;
        card.deletedAt = now;
        card.lastupdated = now;
        return card;
      }))).filter(Boolean);
      await bulkSaveCards(updatedCards);
    }
    state.selectedIds.clear();
  } else {
    if (isTrashMode) {
      if (!confirm('このカードを完全に削除しますか？この操作は取り消せません。')) return;
      await deleteCard(state.editingCardId);
    } else {
      const card = await getCard(state.editingCardId);
      if (card) {
        card.deletedAt = now;
        card.lastupdated = now;
        await saveCard(card);
      }
    }
    state.selectedIds.delete(state.editingCardId);
  }

  updateSelectionBar();
  await renderTimeline({ preserveScroll: true });
  await dataManagerModule.checkMonthlyTrashReminder();
  DOM.panelEdit.classList.remove('active');
  DOM.editMemo.disabled = false;
});

DOM.btnToDesk.addEventListener('click', () => {
  if (state.selectedIds.size === 0) return;
  const ids = Array.from(state.selectedIds).join(',');
  window.location.href = `rensaku.html?ids=${ids}`;
});

// --- 起動処理 ---
window.addEventListener('DOMContentLoaded', async () => {
  settingsModule.load();
  await initDB();
  adjustTimelinePadding({ allowAutoScroll: false });
  await renderTimeline({ forceBottom: true });

  const savedScroll = localStorage.getItem(SCROLL_POS_KEY);
  if (savedScroll !== null) {
    const pos = parseInt(savedScroll, 10);
    if (!Number.isNaN(pos)) DOM.timeline.scrollTop = pos;
  }

  await shelfModule.updateBadge();
  updateHeaderWingButtons();
  await dataManagerModule.checkMonthlyTrashReminder();

  const params = new URLSearchParams(window.location.search);
  if (params.get('open') === 'shelf') {
    await openWing('shelf');
    history.replaceState(null, '', 'saikiyo2.html');
  }
});

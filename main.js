/** さいきよ2 - 統合ロジック（左舷：表示パネル・設定パネル完全実装） */

import {
  initDB,
  saveCard,
  loadAllCards,
  getCard,
  bulkSaveCards,
  deleteCard,
  saveShelf,
  loadAllShelves,
  getShelf,
  bulkSaveShelves,
  deleteShelf
} from './db.js';
import { createTankaCard, updateSelectionBarUI, formatDateWithWeekday } from './ui.js';

const CONFIG_KEY = 'saikiyo2_config';

let config = {
  theme: 'kinari',   // 'kinari' | 'ginnezumi' | 'sumi'
  size: 'medium',    // 'small' | 'medium' | 'large'
  font: 'gothic',    // 'gothic' | 'mincho'
  radius: 'none'     // 'none' | 'soft'
};

let state = {
  searchKeyword: '',
  filterTags: new Set(),  // タグ名 または '__NO_TAG__'
  filterDateFrom: '',
  filterDateTo: '',
  sortOrder: 'asc',       // 'asc' | 'desc'
  memoMode: 'badge',      // 'badge' | 'full'
  selectedIds: new Set(),
  editingCardId: null,
  activeWing: null,       // null | 'display' | 'config' | 'kansei' | 'shelf'
  selectedShelfIds: new Set(),
  currentDetailShelfId: null
};

const DOM = {
  timeline: document.getElementById('timeline'),
  btnLeftWing: document.getElementById('btn-left-wing'),
  btnTop: document.getElementById('btn-top'),
  btnRightWing: document.getElementById('btn-right-wing'),
  btnOpenShelf: document.getElementById('btn-open-shelf'),
  btnFab: document.getElementById('btn-fab'),
  footerBar: document.getElementById('footer-bar'),
  footerNormal: document.getElementById('footer-normal'),
  footerSelection: document.getElementById('footer-selection'),
  selectionCount: document.getElementById('selection-count'),
  btnBatchEdit: document.getElementById('btn-batch-edit'),
  btnCancelSelection: document.getElementById('btn-cancel-selection'),
  btnToDesk: document.getElementById('btn-to-desk'),
  consoleArea: document.getElementById('console-area'),
  inputContent: document.getElementById('input-content'),
  inputTags: document.getElementById('input-tags'),
  btnSearch: document.getElementById('btn-search'),
  btnSend: document.getElementById('btn-send'),
  panelEdit: document.getElementById('panel-edit'),
  btnCloseEdit: document.getElementById('btn-close-edit'),
  editTimestampGroup: document.getElementById('edit-timestamp-group'),
  editTimestamp: document.getElementById('edit-timestamp'),
  editContentView: document.getElementById('edit-content-view'),
  editMemo: document.getElementById('edit-memo'),
  editTags: document.getElementById('edit-tags'),
  btnSaveEdit: document.getElementById('btn-save-edit'),
  btnDeleteEdit: document.getElementById('btn-delete-edit'),
  btnCopyEdit: document.getElementById('btn-copy-edit'),
  btnShelfEdit: document.getElementById('btn-shelf-edit'),
  // ウィングパネル
  panelDisplay: document.getElementById('panel-display'),
  panelConfig: document.getElementById('panel-config'),
  panelKansei: document.getElementById('panel-kansei'),
  panelShelf: document.getElementById('panel-shelf'),
  // 表示パネル
  btnDisplayReset: document.getElementById('btn-display-reset'),
  displayStatus: document.getElementById('display-status'),
  displayTagList: document.getElementById('display-tag-list'),
  filterDateFrom: document.getElementById('filter-date-from'),
  filterDateTo: document.getElementById('filter-date-to'),
  // 管制パネル
  kanseiStats: document.getElementById('kansei-stats'),
  btnExportFile: document.getElementById('btn-export-file'),
  btnExportCopy: document.getElementById('btn-export-copy'),
  btnImportFile: document.getElementById('btn-import-file'),
  inputImportFile: document.getElementById('input-import-file'),
  inputImportText: document.getElementById('input-import-text'),
  btnImportText: document.getElementById('btn-import-text'),
  inputCleanTag: document.getElementById('input-clean-tag'),
  btnCleanTag: document.getElementById('btn-clean-tag'),
  inputCleanDate: document.getElementById('input-clean-date'),
  btnCleanDate: document.getElementById('btn-clean-date'),
  // リスト棚
  shelfListView: document.getElementById('shelf-list-view'),
  shelfList: document.getElementById('shelf-list'),
  btnShelfBulkDelete: document.getElementById('btn-shelf-bulk-delete'),
  shelfDetailView: document.getElementById('shelf-detail-view'),
  shelfDetailTitle: document.getElementById('shelf-detail-title'),
  shelfDetailMeta: document.getElementById('shelf-detail-meta'),
  shelfDetailMemo: document.getElementById('shelf-detail-memo'),
  shelfDetailItems: document.getElementById('shelf-detail-items'),
  btnShelfBackList: document.getElementById('btn-shelf-back-list'),
  btnShelfCopy: document.getElementById('btn-shelf-copy'),
  btnShelfReturnScatter: document.getElementById('btn-shelf-return-scatter'),
  btnShelfReturnBlock: document.getElementById('btn-shelf-return-block')
};

// --- 設定（コンフィグ）の読み込み・反映 ---
function loadConfig() {
  try {
    const saved = JSON.parse(localStorage.getItem(CONFIG_KEY));
    if (saved) config = { ...config, ...saved };
  } catch (_) {}
  applyConfig();
}

function saveConfig() {
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  } catch (_) {}
}

function applyConfig() {
  document.body.dataset.theme = config.theme;
  document.body.dataset.size = config.size;
  document.body.dataset.font = config.font;
  document.body.dataset.radius = config.radius;

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

document.querySelectorAll('[data-config-theme]').forEach(btn => {
  btn.addEventListener('click', () => {
    config.theme = btn.dataset.configTheme;
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

// --- ウィングパネル制御 ---
const wingPanels = {
  display: DOM.panelDisplay,
  config: DOM.panelConfig,
  kansei: DOM.panelKansei,
  shelf: DOM.panelShelf
};

function hasActiveFilter() {
  return Boolean(
    state.searchKeyword ||
    state.filterTags.size > 0 ||
    state.filterDateFrom ||
    state.filterDateTo
  );
}

function updateHeaderWingButtons() {
  const filterMark = hasActiveFilter() ? '●' : '';

  if (state.activeWing === 'display' || state.activeWing === 'config') {
    DOM.btnLeftWing.textContent = '設定';
    DOM.btnLeftWing.classList.add('is-active');
  } else {
    DOM.btnLeftWing.textContent = `表示${filterMark}`;
    DOM.btnLeftWing.classList.remove('is-active');
  }

  if (state.activeWing === 'kansei') {
    DOM.btnRightWing.classList.add('is-active');
  } else {
    DOM.btnRightWing.classList.remove('is-active');
  }
}

async function updateShelfButtonBadge() {
  const shelves = await loadAllShelves();
  DOM.btnOpenShelf.textContent = shelves.length > 0 ? `棚(${shelves.length})` : '棚';
}

async function openWing(wingName) {
  Object.values(wingPanels).forEach(p => p.classList.remove('active'));
  state.activeWing = wingName;

  if (wingName && wingPanels[wingName]) {
    wingPanels[wingName].classList.add('active');
    if (wingName === 'display') {
      await renderDisplayPanel();
    } else if (wingName === 'shelf') {
      showShelfListView();
      await renderShelfList();
    } else if (wingName === 'kansei') {
      await updateKanseiStats();
    }
  }
  updateHeaderWingButtons();
}

function closeAllWings() {
  openWing(null);
}

DOM.btnLeftWing.addEventListener('click', () => {
  if (state.activeWing === 'display') {
    openWing('config');
  } else if (state.activeWing === 'config') {
    closeAllWings();
  } else {
    openWing('display');
  }
});

DOM.btnRightWing.addEventListener('click', () => {
  if (state.activeWing === 'kansei') {
    closeAllWings();
  } else {
    openWing('kansei');
  }
});

DOM.btnOpenShelf.addEventListener('click', () => {
  if (state.activeWing === 'shelf') {
    closeAllWings();
  } else {
    openWing('shelf');
  }
});

document.querySelectorAll('.btn-close-wing').forEach(btn => {
  btn.addEventListener('click', closeAllWings);
});

DOM.btnTop.addEventListener('click', () => {
  if (state.activeWing) closeAllWings();
  const targetTop = state.sortOrder === 'desc' ? 0 : DOM.timeline.scrollHeight;
  DOM.timeline.scrollTo({ top: targetTop, behavior: 'smooth' });
});

// --- 表示パネル（絞り込み・並び順・メモ表示） ---
function filterCards(allCards) {
  let result = allCards;

  if (state.searchKeyword) {
    const kw = state.searchKeyword;
    result = result.filter(c =>
      c.content.includes(kw) ||
      (c.memo && c.memo.includes(kw)) ||
      (Array.isArray(c.tags) && c.tags.some(t => t.includes(kw)))
    );
  }

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
    if (!Number.isNaN(fromTs)) {
      result = result.filter(c => c.id >= fromTs);
    }
  }

  if (state.filterDateTo) {
    const toTs = new Date(`${state.filterDateTo}T23:59:59.999`).getTime();
    if (!Number.isNaN(toTs)) {
      result = result.filter(c => c.id <= toTs);
    }
  }

  return result;
}

async function renderDisplayPanel() {
  const allCards = await loadAllCards();
  const filtered = filterCards(allCards);

  if (hasActiveFilter()) {
    const kwNote = state.searchKeyword ? `（検索: ${state.searchKeyword}）` : '';
    DOM.displayStatus.textContent = `絞り込み中：${filtered.length} / ${allCards.length} 件${kwNote}`;
  } else {
    DOM.displayStatus.textContent = `全件表示中：${allCards.length} 件`;
  }

  // タグ集計
  const tagCounts = new Map();
  let noTagCount = 0;
  allCards.forEach(c => {
    const tags = Array.isArray(c.tags) ? c.tags : [];
    if (tags.length === 0) {
      noTagCount++;
    } else {
      tags.forEach(t => tagCounts.set(t, (tagCounts.get(t) || 0) + 1));
    }
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
      await renderTimeline();
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
      await renderTimeline();
      await renderDisplayPanel();
      updateHeaderWingButtons();
    });
    DOM.displayTagList.appendChild(btn);
  }

  if (sortedTags.length === 0 && noTagCount === 0) {
    DOM.displayTagList.innerHTML = '<span style="color:var(--muted-color); font-size:0.85rem;">まだカードがありません。</span>';
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

DOM.btnDisplayReset.addEventListener('click', async () => {
  state.searchKeyword = '';
  state.filterTags.clear();
  state.filterDateFrom = '';
  state.filterDateTo = '';
  await renderTimeline();
  await renderDisplayPanel();
  updateHeaderWingButtons();
});

DOM.filterDateFrom.addEventListener('change', async () => {
  state.filterDateFrom = DOM.filterDateFrom.value;
  await renderTimeline();
  await renderDisplayPanel();
  updateHeaderWingButtons();
});

DOM.filterDateTo.addEventListener('change', async () => {
  state.filterDateTo = DOM.filterDateTo.value;
  await renderTimeline();
  await renderDisplayPanel();
  updateHeaderWingButtons();
});

document.querySelectorAll('[data-sort]').forEach(btn => {
  btn.addEventListener('click', async () => {
    state.sortOrder = btn.dataset.sort;
    await renderTimeline();
    await renderDisplayPanel();
  });
});

document.querySelectorAll('[data-memo-mode]').forEach(btn => {
  btn.addEventListener('click', async () => {
    state.memoMode = btn.dataset.memoMode;
    await renderTimeline();
    await renderDisplayPanel();
  });
});

// --- コンソールの高さ自動計算＆吸着アルゴリズム ---
function adjustTimelinePadding() {
  const isConsoleOpen = DOM.consoleArea.classList.contains('open');
  const activeElement = isConsoleOpen ? DOM.consoleArea : DOM.footerBar;
  const exactHeight = activeElement.offsetHeight;

  DOM.timeline.style.paddingBottom = `${exactHeight}px`;
  if (state.sortOrder === 'asc') {
    DOM.timeline.scrollTop = DOM.timeline.scrollHeight;
  }
}

window.addEventListener('resize', adjustTimelinePadding);
DOM.inputContent.addEventListener('input', adjustTimelinePadding);

function openInputConsole() {
  DOM.footerBar.style.display = 'none';
  DOM.consoleArea.classList.add('open');
  adjustTimelinePadding();
  setTimeout(() => DOM.inputContent.focus(), 100);
  history.pushState({ state: 'inputMode' }, '');
}

function closeInputConsole() {
  DOM.footerBar.style.display = 'block';
  DOM.consoleArea.classList.remove('open');
  adjustTimelinePadding();
  DOM.inputContent.blur();
  DOM.inputTags.blur();
}

DOM.btnFab.addEventListener('click', () => {
  openInputConsole();
});

window.addEventListener('popstate', () => {
  if (DOM.consoleArea.classList.contains('open')) {
    closeInputConsole();
  }
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

async function renderTimeline() {
  const allCards = await loadAllCards();
  DOM.timeline.innerHTML = '';

  const displayCards = filterCards(allCards);
  displayCards.sort((a, b) => (state.sortOrder === 'desc' ? b.id - a.id : a.id - b.id));

  const showMemoFull = state.memoMode === 'full';
  displayCards.forEach(card => {
    const isSelected = state.selectedIds.has(card.id);
    const cardElement = createTankaCard(card, isSelected, handleCheckboxChange, openEditPanel, showMemoFull);
    DOM.timeline.appendChild(cardElement);
  });

  DOM.timeline.scrollTop = state.sortOrder === 'desc' ? 0 : DOM.timeline.scrollHeight;
}

function updateSelectionBar() {
  updateSelectionBarUI(state.selectedIds.size, DOM);
}

DOM.btnCancelSelection.addEventListener('click', () => {
  state.selectedIds.clear();
  renderTimeline();
  updateSelectionBar();
});

DOM.btnSend.addEventListener('click', async () => {
  const content = DOM.inputContent.value.trim();
  if (!content) return;

  const tags = DOM.inputTags.value.trim().split(/\s+/).filter(Boolean).map(t => t.startsWith('#') ? t : '#' + t);
  const now = Date.now();
  const card = { id: now, content: content, memo: "", tags: tags, lastupdated: now };

  await saveCard(card);
  DOM.inputContent.value = '';
  DOM.inputTags.value = '';
  await renderTimeline();
});

DOM.btnSearch.addEventListener('click', async () => {
  state.searchKeyword = DOM.inputContent.value.trim();
  await renderTimeline();
  updateHeaderWingButtons();
  if (DOM.consoleArea.classList.contains('open')) history.back();
});

// --- プロパティ編集パネル ---
function openEditPanel(card) {
  state.editingCardId = card.id;
  DOM.editTimestampGroup.style.display = 'flex';
  DOM.editTimestamp.textContent = formatDateWithWeekday(card.id);
  DOM.editContentView.innerText = card.content;
  DOM.editMemo.disabled = false;
  DOM.editMemo.value = card.memo || "";
  DOM.editTags.value = card.tags && Array.isArray(card.tags) ? card.tags.join(' ') : "";

  DOM.panelEdit.classList.add('active');
}

DOM.btnCloseEdit.addEventListener('click', () => {
  DOM.panelEdit.classList.remove('active');
  DOM.editMemo.disabled = false;
});

document.querySelectorAll('.helper-tag').forEach(btn => {
  btn.addEventListener('click', (e) => {
    DOM.editTags.value = (DOM.editTags.value + ' ' + e.target.innerText).trim();
  });
});

DOM.btnBatchEdit.addEventListener('click', () => {
  if (state.selectedIds.size === 0) return;
  state.editingCardId = 'batch';
  DOM.editTimestampGroup.style.display = 'none';
  DOM.editTimestamp.textContent = '';
  DOM.editContentView.innerText = `【一括編集モード】\n選択された ${state.selectedIds.size} 件のカードを処理します。`;
  DOM.editMemo.value = "※一括編集ではメタメモは変更できません";
  DOM.editMemo.disabled = true;
  DOM.editTags.value = "";

  DOM.panelEdit.classList.add('active');
});

DOM.btnSaveEdit.addEventListener('click', async () => {
  const newTagsInput = DOM.editTags.value.trim().split(/\s+/).filter(Boolean).map(t => t.startsWith('#') ? t : '#' + t);
  const now = Date.now();

  if (state.editingCardId === 'batch') {
    const updatePromises = Array.from(state.selectedIds).map(async (id) => {
      const card = await getCard(id);
      if (card) {
        const existingTags = Array.isArray(card.tags) ? card.tags : [];
        card.tags = Array.from(new Set([...existingTags, ...newTagsInput]));
        card.lastupdated = now;
        return card;
      }
    });
    const updatedCards = (await Promise.all(updatePromises)).filter(Boolean);
    await bulkSaveCards(updatedCards);
    state.selectedIds.clear();
    updateSelectionBar();
  } else {
    const card = await getCard(state.editingCardId);
    if (card) {
      card.memo = DOM.editMemo.value;
      card.tags = newTagsInput;
      card.lastupdated = now;
      await saveCard(card);
    }
  }

  await renderTimeline();
  DOM.panelEdit.classList.remove('active');
  DOM.editMemo.disabled = false;
});

DOM.btnCopyEdit.addEventListener('click', async () => {
  let contentToCopy = "";
  if (state.editingCardId === 'batch') {
    const promises = Array.from(state.selectedIds).map(id => getCard(id));
    const cards = await Promise.all(promises);
    contentToCopy = cards.filter(Boolean).map(c => c.content).join('\n\n');
  } else {
    contentToCopy = DOM.editContentView.innerText;
  }

  try {
    await navigator.clipboard.writeText(contentToCopy);
    alert('コピー完了ロボ！');
  } catch (err) {
    alert('コピーに失敗したロボ...');
  }
});

DOM.btnShelfEdit.addEventListener('click', async () => {
  const now = Date.now();
  const inputTags = DOM.editTags.value.trim().split(/\s+/).filter(Boolean).map(t => t.startsWith('#') ? t : '#' + t);

  if (state.editingCardId === 'batch') {
    const cards = (await Promise.all(Array.from(state.selectedIds).map(id => getCard(id)))).filter(Boolean);
    if (cards.length === 0) return;

    const firstClean = cards[0].content.replace(/\s+/g, '');
    const title = firstClean.slice(0, 5) || '無題';
    const items = cards.map(c => ({
      id: c.id,
      content: c.content,
      memo: c.memo || '',
      tags: Array.isArray(c.tags) ? [...c.tags] : [],
      lastupdated: c.lastupdated || c.id
    }));

    const shelf = {
      id: now,
      title,
      memo: '',
      tags: inputTags,
      items,
      order: now,
      lastupdated: now
    };
    await saveShelf(shelf);
    await updateShelfButtonBadge();
    alert('棚に収めたロボ！');
  } else {
    const card = await getCard(state.editingCardId);
    if (!card) return;

    const firstClean = card.content.replace(/\s+/g, '');
    const title = firstClean.slice(0, 5) || '無題';
    const currentMemo = DOM.editMemo.value;

    const snapshot = {
      id: card.id,
      content: card.content,
      memo: currentMemo,
      tags: inputTags,
      lastupdated: card.lastupdated || card.id
    };

    const shelf = {
      id: now,
      title,
      memo: currentMemo,
      tags: inputTags,
      items: [snapshot],
      order: now,
      lastupdated: now
    };
    await saveShelf(shelf);
    await updateShelfButtonBadge();
    alert('棚に収めたロボ！');
  }
});

DOM.btnDeleteEdit.addEventListener('click', async () => {
  if (state.editingCardId === 'batch') {
    if (confirm(`選択された ${state.selectedIds.size} 件のカードを一括削除するロボか？この操作は取り消せないロボ！`)) {
      const deletePromises = Array.from(state.selectedIds).map(id => deleteCard(id));
      await Promise.all(deletePromises);

      state.selectedIds.clear();
      updateSelectionBar();
      await renderTimeline();
      DOM.panelEdit.classList.remove('active');
    }
  } else {
    if (confirm('本当にこのカードを削除するロボか？この操作は取り消せないロボ！')) {
      await deleteCard(state.editingCardId);

      state.selectedIds.delete(state.editingCardId);
      updateSelectionBar();
      await renderTimeline();
      DOM.panelEdit.classList.remove('active');
    }
  }
});

DOM.btnToDesk.addEventListener('click', () => {
  if (state.selectedIds.size === 0) return;
  const ids = Array.from(state.selectedIds).join(',');
  window.location.href = `rensaku.html?ids=${ids}`;
});

// --- 管制パネル（バックアップ・復元・一括削除） ---
async function updateKanseiStats() {
  const [cards, shelves] = await Promise.all([loadAllCards(), loadAllShelves()]);
  DOM.kanseiStats.textContent = `保管中：カード ${cards.length} 件 ／ リスト棚 ${shelves.length} 件`;
}

async function buildBackupPayload() {
  const [cards, shelves] = await Promise.all([loadAllCards(), loadAllShelves()]);
  return {
    app: 'saikiyo2',
    version: 2,
    exportedAt: Date.now(),
    cards,
    shelves
  };
}

DOM.btnExportFile.addEventListener('click', async () => {
  const payload = await buildBackupPayload();
  const jsonStr = JSON.stringify(payload, null, 2);
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const fileName = `saikiyo2_backup_${ymd}.json`;

  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
});

DOM.btnExportCopy.addEventListener('click', async () => {
  const payload = await buildBackupPayload();
  const jsonStr = JSON.stringify(payload);
  try {
    await navigator.clipboard.writeText(jsonStr);
    alert(`JSON（カード${payload.cards.length}件・棚${payload.shelves.length}件）をコピーしたロボ！`);
  } catch (_) {
    alert('コピーに失敗したロボ...');
  }
});

async function importBackupJson(rawText) {
  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch (_) {
    alert('JSONの形式が正しくないロボ...');
    return;
  }

  let cardsToImport = [];
  let shelvesToImport = [];

  if (Array.isArray(parsed)) {
    cardsToImport = parsed.filter(c => c && typeof c.id !== 'undefined' && typeof c.content === 'string');
  } else if (parsed && typeof parsed === 'object') {
    if (Array.isArray(parsed.cards)) {
      cardsToImport = parsed.cards.filter(c => c && typeof c.id !== 'undefined' && typeof c.content === 'string');
    }
    if (Array.isArray(parsed.shelves)) {
      shelvesToImport = parsed.shelves.filter(s => s && typeof s.id !== 'undefined' && Array.isArray(s.items));
    }
  }

  if (cardsToImport.length === 0 && shelvesToImport.length === 0) {
    alert('読み込めるデータが見つからなかったロボ。');
    return;
  }

  if (cardsToImport.length > 0) await bulkSaveCards(cardsToImport);
  if (shelvesToImport.length > 0) await bulkSaveShelves(shelvesToImport);

  await renderTimeline();
  await updateShelfButtonBadge();
  await updateKanseiStats();
  alert(`復元完了ロボ！（カード ${cardsToImport.length} 件 ／ リスト棚 ${shelvesToImport.length} 件を統合）`);
}

DOM.btnImportFile.addEventListener('click', () => {
  DOM.inputImportFile.value = '';
  DOM.inputImportFile.click();
});

DOM.inputImportFile.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const text = await file.text();
  await importBackupJson(text);
});

DOM.btnImportText.addEventListener('click', async () => {
  const raw = DOM.inputImportText.value.trim();
  if (!raw) {
    alert('JSONテキストが入力されていないロボ。');
    return;
  }
  await importBackupJson(raw);
  DOM.inputImportText.value = '';
});

document.querySelectorAll('.kansei-chip').forEach(btn => {
  btn.addEventListener('click', () => {
    DOM.inputCleanTag.value = btn.dataset.tag;
  });
});

DOM.btnCleanTag.addEventListener('click', async () => {
  const rawTag = DOM.inputCleanTag.value.trim();
  if (!rawTag) {
    alert('削除するタグを入力してくれロボ。');
    return;
  }
  const targetTag = rawTag.startsWith('#') ? rawTag : '#' + rawTag;
  const allCards = await loadAllCards();
  const targets = allCards.filter(c => Array.isArray(c.tags) && c.tags.includes(targetTag));

  if (targets.length === 0) {
    alert(`タグ「${targetTag}」が付いたカードは 0 件ロボ。`);
    return;
  }

  if (!confirm(`タグ「${targetTag}」のカード ${targets.length} 件を一括削除するロボか？\n※先にバックアップを取っておくと安心ロボ。`)) {
    return;
  }

  const targetIdSet = new Set(targets.map(c => c.id));
  await Promise.all(targets.map(c => deleteCard(c.id)));

  targetIdSet.forEach(id => state.selectedIds.delete(id));
  updateSelectionBar();

  await renderTimeline();
  await updateKanseiStats();
  alert(`${targets.length} 件のカードを削除したロボ！`);
});

DOM.btnCleanDate.addEventListener('click', async () => {
  const dateVal = DOM.inputCleanDate.value;
  if (!dateVal) {
    alert('基準となる日付を選んでくれロボ。');
    return;
  }
  const cutoffTs = new Date(`${dateVal}T00:00:00`).getTime();
  if (Number.isNaN(cutoffTs)) return;

  const allCards = await loadAllCards();
  const targets = allCards.filter(c => c.id < cutoffTs);

  if (targets.length === 0) {
    alert(`${dateVal} より前のカードは 0 件ロボ。`);
    return;
  }

  if (!confirm(`${dateVal} より前に作成されたカード ${targets.length} 件を一括削除するロボか？\n※この操作は取り消せないロボ！`)) {
    return;
  }

  const targetIdSet = new Set(targets.map(c => c.id));
  await Promise.all(targets.map(c => deleteCard(c.id)));

  targetIdSet.forEach(id => state.selectedIds.delete(id));
  updateSelectionBar();

  await renderTimeline();
  await updateKanseiStats();
  alert(`${targets.length} 件のカードを削除したロボ！`);
});

// --- リスト棚パネル ---
function updateShelfBulkDeleteBtn() {
  const count = state.selectedShelfIds.size;
  if (count > 0) {
    DOM.btnShelfBulkDelete.style.display = 'inline-block';
    DOM.btnShelfBulkDelete.textContent = `削除(${count})`;
  } else {
    DOM.btnShelfBulkDelete.style.display = 'none';
  }
}

function showShelfListView() {
  DOM.shelfDetailView.style.display = 'none';
  DOM.shelfListView.style.display = 'block';
  state.currentDetailShelfId = null;
}

async function renderShelfList() {
  const shelves = await loadAllShelves();
  DOM.shelfList.innerHTML = '';

  if (shelves.length === 0) {
    DOM.shelfList.innerHTML = '<div class="shelf-empty">まだリスト棚は空ロボ。<br>タイムラインからカードを選んで「机へ」→「棚に収める」で保管できるロボ。</div>';
    state.selectedShelfIds.clear();
    updateShelfBulkDeleteBtn();
    return;
  }

  shelves.sort((a, b) => (a.order ?? a.id) - (b.order ?? b.id));

  shelves.forEach(shelf => {
    const row = document.createElement('div');
    row.className = 'shelf-row';
    row.dataset.id = shelf.id;

    const chk = document.createElement('input');
    chk.type = 'checkbox';
    chk.className = 'card-check';
    chk.checked = state.selectedShelfIds.has(shelf.id);
    chk.addEventListener('change', (e) => {
      if (e.target.checked) state.selectedShelfIds.add(shelf.id);
      else state.selectedShelfIds.delete(shelf.id);
      updateShelfBulkDeleteBtn();
    });

    const main = document.createElement('div');
    main.className = 'shelf-row-main';
    const titleEl = document.createElement('div');
    titleEl.className = 'shelf-row-title';
    titleEl.textContent = shelf.title || '無題';

    const metaEl = document.createElement('div');
    metaEl.className = 'shelf-row-meta';
    const count = Array.isArray(shelf.items) ? shelf.items.length : 0;
    const dateStr = formatDateWithWeekday(shelf.id);
    const tagStr = Array.isArray(shelf.tags) && shelf.tags.length > 0 ? '  ' + shelf.tags.join(' ') : '';
    metaEl.textContent = `${count}首 / ${dateStr}${tagStr}`;

    main.appendChild(titleEl);
    main.appendChild(metaEl);
    main.addEventListener('click', () => openShelfDetail(shelf.id));

    const controls = document.createElement('div');
    controls.className = 'shelf-row-controls';

    const handle = document.createElement('div');
    handle.className = 'shelf-handle';
    handle.innerHTML = '&#9776;';
    handle.addEventListener('pointerdown', (e) => startShelfDrag(e, row));

    const delBtn = document.createElement('button');
    delBtn.className = 'shelf-del-btn';
    delBtn.textContent = '×';
    delBtn.addEventListener('click', async () => {
      if (confirm(`「${shelf.title || '無題'}」を棚から削除するロボか？`)) {
        await deleteShelf(shelf.id);
        state.selectedShelfIds.delete(shelf.id);
        updateShelfBulkDeleteBtn();
        await renderShelfList();
        await updateShelfButtonBadge();
      }
    });

    controls.appendChild(handle);
    controls.appendChild(delBtn);

    row.appendChild(chk);
    row.appendChild(main);
    row.appendChild(controls);
    DOM.shelfList.appendChild(row);
  });

  updateShelfBulkDeleteBtn();
}

let draggingShelfRow = null;

function startShelfDrag(e, row) {
  e.preventDefault();
  draggingShelfRow = row;
  row.classList.add('dragging');

  document.addEventListener('pointermove', onShelfDragMove, { passive: false });
  document.addEventListener('pointerup', onShelfDragEnd);
  document.addEventListener('pointercancel', onShelfDragEnd);
}

function onShelfDragMove(e) {
  if (!draggingShelfRow) return;
  e.preventDefault();

  const rows = Array.from(DOM.shelfList.querySelectorAll('.shelf-row:not(.dragging)'));
  const y = e.clientY;
  let inserted = false;

  for (const target of rows) {
    const rect = target.getBoundingClientRect();
    if (y < rect.top + rect.height / 2) {
      DOM.shelfList.insertBefore(draggingShelfRow, target);
      inserted = true;
      break;
    }
  }
  if (!inserted) {
    DOM.shelfList.appendChild(draggingShelfRow);
  }
}

async function onShelfDragEnd() {
  if (!draggingShelfRow) return;
  draggingShelfRow.classList.remove('dragging');
  draggingShelfRow = null;

  document.removeEventListener('pointermove', onShelfDragMove);
  document.removeEventListener('pointerup', onShelfDragEnd);
  document.removeEventListener('pointercancel', onShelfDragEnd);

  const ids = Array.from(DOM.shelfList.querySelectorAll('.shelf-row')).map(el => Number(el.dataset.id));
  const shelves = (await Promise.all(ids.map(id => getShelf(id)))).filter(Boolean);
  shelves.forEach((shelf, idx) => {
    shelf.order = idx + 1;
  });
  await bulkSaveShelves(shelves);
}

DOM.btnShelfBulkDelete.addEventListener('click', async () => {
  if (state.selectedShelfIds.size === 0) return;
  if (!confirm(`選択した ${state.selectedShelfIds.size} 件のリストを棚から削除するロボか？`)) return;

  await Promise.all(Array.from(state.selectedShelfIds).map(id => deleteShelf(id)));
  state.selectedShelfIds.clear();
  updateShelfBulkDeleteBtn();
  await renderShelfList();
  await updateShelfButtonBadge();
});

async function openShelfDetail(shelfId) {
  const shelf = await getShelf(shelfId);
  if (!shelf) return;

  state.currentDetailShelfId = shelf.id;
  DOM.shelfDetailTitle.textContent = shelf.title || '無題';

  const count = Array.isArray(shelf.items) ? shelf.items.length : 0;
  const dateStr = formatDateWithWeekday(shelf.id);
  const tagStr = Array.isArray(shelf.tags) && shelf.tags.length > 0 ? '  ' + shelf.tags.join(' ') : '';
  DOM.shelfDetailMeta.textContent = `${count}首 / 作成: ${dateStr}${tagStr}`;

  if (shelf.memo && shelf.memo.trim()) {
    DOM.shelfDetailMemo.style.display = 'block';
    DOM.shelfDetailMemo.textContent = shelf.memo;
  } else {
    DOM.shelfDetailMemo.style.display = 'none';
  }

  DOM.shelfDetailItems.innerHTML = '';
  (shelf.items || []).forEach((item, idx) => {
    const cardEl = document.createElement('div');
    cardEl.className = 'shelf-detail-card';

    const bodyEl = document.createElement('div');
    bodyEl.className = 'shelf-detail-card-body';
    bodyEl.textContent = item.content;

    const subEl = document.createElement('div');
    subEl.className = 'shelf-detail-card-sub';
    const itemDate = formatDateWithWeekday(item.id);
    const itemTags = Array.isArray(item.tags) && item.tags.length > 0 ? '  ' + item.tags.join(' ') : '';
    subEl.textContent = `${idx + 1}. 原本: ${itemDate}${itemTags}`;

    cardEl.appendChild(bodyEl);
    cardEl.appendChild(subEl);
    DOM.shelfDetailItems.appendChild(cardEl);
  });

  DOM.shelfListView.style.display = 'none';
  DOM.shelfDetailView.style.display = 'block';
}

DOM.btnShelfBackList.addEventListener('click', showShelfListView);

DOM.btnShelfCopy.addEventListener('click', async () => {
  if (!state.currentDetailShelfId) return;
  const shelf = await getShelf(state.currentDetailShelfId);
  if (!shelf || !Array.isArray(shelf.items)) return;

  const text = shelf.items.map(i => i.content).join('\n\n');
  try {
    await navigator.clipboard.writeText(text);
    alert('コピー完了ロボ！');
  } catch (_) {
    alert('コピーに失敗したロボ...');
  }
});

DOM.btnShelfReturnScatter.addEventListener('click', async () => {
  if (!state.currentDetailShelfId) return;
  const shelf = await getShelf(state.currentDetailShelfId);
  if (!shelf || !Array.isArray(shelf.items) || shelf.items.length === 0) return;

  const baseNow = Date.now();
  const newCards = shelf.items.map((item, idx) => ({
    id: baseNow + idx,
    content: item.content,
    memo: item.memo || '',
    tags: Array.isArray(item.tags) ? [...item.tags] : [],
    lastupdated: baseNow + idx
  }));

  await bulkSaveCards(newCards);
  await renderTimeline();
  closeAllWings();
  alert(`${newCards.length}首をバラでタイムライン直近へ戻したロボ！`);
});

DOM.btnShelfReturnBlock.addEventListener('click', async () => {
  if (!state.currentDetailShelfId) return;
  const shelf = await getShelf(state.currentDetailShelfId);
  if (!shelf || !Array.isArray(shelf.items) || shelf.items.length === 0) return;

  const now = Date.now();
  const blockCard = {
    id: now,
    content: shelf.items.map(i => i.content).join('\n\n'),
    memo: shelf.memo || '',
    tags: Array.isArray(shelf.tags) ? [...shelf.tags] : [],
    lastupdated: now
  };

  await saveCard(blockCard);
  await renderTimeline();
  closeAllWings();
  alert(`「${shelf.title || '無題'}」を塊でタイムライン直近へ戻したロボ！`);
});

// --- 起動処理 ---
window.addEventListener('DOMContentLoaded', async () => {
  loadConfig();
  await initDB();
  await renderTimeline();
  await updateShelfButtonBadge();
  updateHeaderWingButtons();
  adjustTimelinePadding();

  const params = new URLSearchParams(window.location.search);
  if (params.get('open') === 'shelf') {
    await openWing('shelf');
    history.replaceState(null, '', 'saikiyo2.html');
  }
});

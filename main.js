import { initDB, saveCard, loadAllCards, getCard, bulkSaveCards } from './db.js';
import { createTankaCard, updateSelectionBarUI } from './ui.js';

let state = { suikoVisibleIds: null, selectedIds: new Set(), editingCardId: null };

const DOM = {
  timeline: document.getElementById('timeline'),
  btnTop: document.getElementById('btn-top'),
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
  editContentView: document.getElementById('edit-content-view'),
  editMemo: document.getElementById('edit-memo'),
  editTags: document.getElementById('edit-tags'),
  btnSaveEdit: document.getElementById('btn-save-edit')
};

// --- 【追加】コンソールの高さ自動計算＆吸着アルゴリズム ---
function adjustTimelinePadding() {
  // コンソールが開いているか判定
  const isConsoleOpen = DOM.consoleArea.classList.contains('open');
  // アクティブな要素（コンソールかフッター）の高さを取得
  const activeElement = isConsoleOpen ? DOM.consoleArea : DOM.footerBar;
  const exactHeight = activeElement.offsetHeight;
  
  // タイムラインの底上げをミリ単位で同期
  DOM.timeline.style.paddingBottom = `${exactHeight}px`;
  
  // タイムラインを一番下へスクロールしてピタッと吸着させる
  DOM.timeline.scrollTop = DOM.timeline.scrollHeight;
}

// 監視の網を張る（以下のイベントで自動計算を発動）
window.addEventListener('resize', adjustTimelinePadding); // キーボード開閉などで画面が変動した時
DOM.inputContent.addEventListener('input', adjustTimelinePadding); // 本文入力窓が縦に伸び縮みした時
// ----------------------------------------------------


DOM.btnTop.addEventListener('click', () => {
  DOM.timeline.scrollTo({ top: DOM.timeline.scrollHeight, behavior: 'smooth' });
});

function openInputConsole() {
  DOM.footerBar.style.display = 'none';
  DOM.consoleArea.classList.add('open');
  adjustTimelinePadding(); // ★追加：開いた瞬間に高さを同期
  setTimeout(() => DOM.inputContent.focus(), 100);
  history.pushState({ state: 'inputMode' }, '');
}

function closeInputConsole() {
  DOM.footerBar.style.display = 'block';
  DOM.consoleArea.classList.remove('open');
  adjustTimelinePadding(); // ★追加：閉じた瞬間にフッターの高さへ戻す
  DOM.inputContent.blur();
  DOM.inputTags.blur();
}

DOM.btnFab.addEventListener('click', () => {
  openInputConsole();
});

window.addEventListener('popstate', (e) => {
  if (DOM.consoleArea.classList.contains('open')) {
    closeInputConsole();
  }
});

// ★ 自動拡張のJSイベント（inputContent.addEventListener('input'...)）はCSS（field-sizing）に任せるため完全削除

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
  
  const displayCards = state.suikoVisibleIds 
    ? allCards.filter(c => state.suikoVisibleIds.includes(c.id))
    : allCards;

  displayCards.sort((a, b) => a.id - b.id).forEach(card => {
    const isSelected = state.selectedIds.has(card.id);
    const cardElement = createTankaCard(card, isSelected, handleCheckboxChange, openEditPanel);
    DOM.timeline.appendChild(cardElement);
  });
  
  DOM.timeline.scrollTop = DOM.timeline.scrollHeight;
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
  if (state.suikoVisibleIds) state.suikoVisibleIds.push(card.id);
  
  DOM.inputContent.value = '';
  DOM.inputTags.value = '';
  // ★ ここにあった height リセットも不要（CSSが自動で縮ませる）
  await renderTimeline();
});

DOM.btnSearch.addEventListener('click', async () => {
  const keyword = DOM.inputContent.value.trim();
  if (!keyword) {
    state.suikoVisibleIds = null;
    await renderTimeline();
    if (DOM.consoleArea.classList.contains('open')) history.back();
    return;
  }
  
  const allCards = await loadAllCards();
  state.suikoVisibleIds = allCards.filter(c => 
    c.content.includes(keyword) || 
    (c.tags && Array.isArray(c.tags) && c.tags.some(t => t.includes(keyword)))
  ).map(c => c.id);
  
  await renderTimeline();
  if (DOM.consoleArea.classList.contains('open')) history.back(); 
});

function openEditPanel(card) {
  state.editingCardId = card.id;
  DOM.editContentView.innerText = card.content;
  DOM.editMemo.value = card.memo || "";
  DOM.editTags.value = card.tags && Array.isArray(card.tags) ? card.tags.join(' ') : "";
  DOM.panelEdit.classList.add('active');
}

DOM.btnCloseEdit.addEventListener('click', () => DOM.panelEdit.classList.remove('active'));

document.querySelectorAll('.helper-tag').forEach(btn => {
  btn.addEventListener('click', (e) => {
    DOM.editTags.value = (DOM.editTags.value + ' ' + e.target.innerText).trim();
  });
});

DOM.btnBatchEdit.addEventListener('click', () => {
  if (state.selectedIds.size === 0) return;
  state.editingCardId = 'batch';
  DOM.editContentView.innerText = `【一括編集モード】\n選択された ${state.selectedIds.size} 件のカードにタグを追加します。`;
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

DOM.btnToDesk.addEventListener('click', () => {
  if (state.selectedIds.size === 0) return;
  const ids = Array.from(state.selectedIds).join(',');
  window.location.href = `rensaku.html?ids=${ids}`;
});

window.addEventListener('DOMContentLoaded', async () => {
  await initDB();
  await renderTimeline();
});

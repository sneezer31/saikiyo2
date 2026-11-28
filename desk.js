/** さいきよ2 - 内蔵 机モジュール（独立スクロール＋時間ベース穏やかエッジスクロール） */

import { saveShelf } from './db.js';

const PREFS_KEY = 'saikiyo2_rensaku_prefs';

export function initDeskModule({ onSavedToShelf } = {}) {
  let prefs = { font: 'gothic', direction: 'horizontal', wrap: 'false' };
  let orderedCards = [];
  let finalResultText = '';
  let currentShelfId = null;

  const drag = {
    item: null,
    placeholder: null,
    isDragging: false,
    timer: null,
    startX: 0,
    startY: 0,
    origLeft: 0,
    origTop: 0,
    offsetX: 0,
    offsetY: 0,
    lastX: 0,
    lastY: 0,
    lastMoveTime: 0,
    speedX: 0,
    speedY: 0,
    lastFrameTime: 0,
    rafId: null
  };

  const DOM = {
    panel: document.getElementById('panel-desk'),
    screenSort: document.getElementById('desk-screen-sort'),
    screenFinish: document.getElementById('desk-screen-finish'),
    sortArea: document.getElementById('desk-sort-area'),
    scrollbar: document.getElementById('desk-custom-scrollbar'),
    thumb: document.getElementById('desk-custom-thumb'),
    btnFont: document.getElementById('desk-toggle-font'),
    btnDir: document.getElementById('desk-toggle-dir'),
    btnWrap: document.getElementById('desk-toggle-wrap'),
    btnToFinish: document.getElementById('desk-btn-to-finish'),
    previewArea: document.getElementById('desk-preview-area'),
    inputTitle: document.getElementById('desk-shelf-title'),
    inputMemo: document.getElementById('desk-shelf-memo'),
    inputTags: document.getElementById('desk-shelf-tags'),
    btnBackSort: document.getElementById('desk-btn-back-sort'),
    btnCopy: document.getElementById('desk-btn-copy'),
    btnSaveShelf: document.getElementById('desk-btn-save-shelf')
  };

  function loadPrefs() {
    try {
      const saved = JSON.parse(localStorage.getItem(PREFS_KEY));
      if (saved) prefs = { ...prefs, ...saved };
    } catch (_) {}
    updateToggleLabels();
  }

  function savePrefs() {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch (_) {}
  }

  function updateToggleLabels() {
    if (DOM.btnFont) DOM.btnFont.textContent = prefs.font === 'mincho' ? '明朝' : 'ゴシック';
    if (DOM.btnDir) DOM.btnDir.textContent = prefs.direction === 'vertical' ? '縦書き' : '横書き';
    if (DOM.btnWrap) DOM.btnWrap.textContent = prefs.wrap === 'true' ? '全文表示' : '1行表示';
  }

  function applyPrefsToSortArea() {
    DOM.sortArea.className = `dir-${prefs.direction}`;
    DOM.sortArea.querySelectorAll('.desk-tanzaku').forEach(el => {
      el.className = `desk-tanzaku font-${prefs.font} dir-${prefs.direction} wrap-${prefs.wrap}`;
    });
    updateToggleLabels();
    savePrefs();
    requestAnimationFrame(updateCustomScrollbar);
  }

  function showScreen(target) {
    DOM.screenSort.classList.toggle('active', target === 'sort');
    DOM.screenFinish.classList.toggle('active', target === 'finish');
    if (target === 'sort') requestAnimationFrame(updateCustomScrollbar);
  }

  function updateListNumbers() {
    const items = Array.from(DOM.sortArea.querySelectorAll('.desk-tanzaku:not(.dragging)'));
    items.forEach((el, idx) => {
      const numEl = el.querySelector('.desk-item-num');
      if (numEl) numEl.textContent = String(idx + 1);
    });
  }

  function updateCustomScrollbar() {
    if (!DOM.scrollbar || !DOM.thumb || !DOM.panel.classList.contains('active') || !DOM.screenSort.classList.contains('active')) {
      if (DOM.scrollbar) DOM.scrollbar.style.display = 'none';
      return;
    }

    if (prefs.direction === 'vertical') {
      const sW = DOM.sortArea.scrollWidth;
      const cW = DOM.sortArea.clientWidth;
      if (sW <= cW) { DOM.scrollbar.style.display = 'none'; return; }
      DOM.scrollbar.style.display = 'block';
      DOM.scrollbar.style.left = '0';
      DOM.scrollbar.style.right = '0';
      DOM.scrollbar.style.bottom = '2px';
      DOM.scrollbar.style.top = 'auto';
      DOM.scrollbar.style.height = '6px';
      DOM.scrollbar.style.width = '100%';
      const thumbW = Math.max(24, (cW / sW) * cW);
      const ratio = Math.min(1, Math.abs(DOM.sortArea.scrollLeft) / (sW - cW));
      DOM.thumb.style.height = '100%';
      DOM.thumb.style.width = `${thumbW}px`;
      DOM.thumb.style.top = '0';
      DOM.thumb.style.right = `${ratio * (cW - thumbW)}px`;
      DOM.thumb.style.left = 'auto';
    } else {
      const sH = DOM.sortArea.scrollHeight;
      const cH = DOM.sortArea.clientHeight;
      if (sH <= cH) { DOM.scrollbar.style.display = 'none'; return; }
      DOM.scrollbar.style.display = 'block';
      DOM.scrollbar.style.top = '0';
      DOM.scrollbar.style.bottom = '0';
      DOM.scrollbar.style.right = '2px';
      DOM.scrollbar.style.left = 'auto';
      DOM.scrollbar.style.width = '6px';
      DOM.scrollbar.style.height = '100%';
      const thumbH = Math.max(24, (cH / sH) * cH);
      const ratio = Math.min(1, DOM.sortArea.scrollTop / (sH - cH));
      DOM.thumb.style.width = '100%';
      DOM.thumb.style.height = `${thumbH}px`;
      DOM.thumb.style.left = '0';
      DOM.thumb.style.right = 'auto';
      DOM.thumb.style.top = `${ratio * (cH - thumbH)}px`;
    }
  }

  DOM.sortArea.addEventListener('scroll', () => requestAnimationFrame(updateCustomScrollbar));
  window.addEventListener('resize', () => requestAnimationFrame(updateCustomScrollbar));

  // --- D&D（250ms長押し・抜け殻・時間ベース穏やかエッジスクロール） ---
  function handlePointerDown(e, tanzaku) {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    drag.item = tanzaku;
    drag.startX = e.clientX;
    drag.startY = e.clientY;
    drag.isDragging = false;
    drag.timer = setTimeout(() => startDrag(e), 250);

    document.addEventListener('pointermove', checkThreshold, { passive: true });
    document.addEventListener('pointerup', cancelPreDrag);
    document.addEventListener('pointercancel', cancelPreDrag);
  }

  function checkThreshold(e) {
    if (!drag.item || drag.isDragging) return;
    if (Math.abs(e.clientX - drag.startX) > 10 || Math.abs(e.clientY - drag.startY) > 10) {
      cancelPreDrag();
    }
  }

  function cancelPreDrag() {
    clearTimeout(drag.timer);
    drag.timer = null;
    drag.item = null;
    document.removeEventListener('pointermove', checkThreshold);
    document.removeEventListener('pointerup', cancelPreDrag);
    document.removeEventListener('pointercancel', cancelPreDrag);
  }

  function startDrag(e) {
    if (!drag.item) return;
    drag.isDragging = true;
    document.removeEventListener('pointermove', checkThreshold);
    document.removeEventListener('pointerup', cancelPreDrag);
    document.removeEventListener('pointercancel', cancelPreDrag);

    const rect = drag.item.getBoundingClientRect();
    drag.origLeft = rect.left;
    drag.origTop = rect.top;
    drag.offsetX = e.clientX - rect.left;
    drag.offsetY = e.clientY - rect.top;
    drag.lastX = e.clientX;
    drag.lastY = e.clientY;

    drag.placeholder = document.createElement('div');
    drag.placeholder.className = `desk-placeholder dir-${prefs.direction}`;
    if (prefs.direction === 'horizontal') {
      drag.placeholder.style.height = `${rect.height}px`;
    } else {
      drag.placeholder.style.width = `${rect.width}px`;
    }
    DOM.sortArea.insertBefore(drag.placeholder, drag.item);

    drag.item.classList.add('dragging');
    drag.item.style.width = `${rect.width}px`;
    drag.item.style.height = `${rect.height}px`;
    drag.item.style.left = `${rect.left}px`;
    drag.item.style.top = `${rect.top}px`;

    document.body.appendChild(drag.item);
    if (navigator.vibrate) navigator.vibrate(35);

    document.addEventListener('pointermove', handlePointerMove, { passive: false });
    document.addEventListener('pointerup', handlePointerUp);
    document.addEventListener('pointercancel', handlePointerUp);
  }

  function checkIntersection() {
    if (!drag.item || !drag.placeholder) return;

    const checkX = prefs.direction === 'vertical' ? drag.lastX : (drag.origLeft + drag.item.offsetWidth / 2);
    const checkY = prefs.direction === 'horizontal' ? drag.lastY : (drag.origTop + drag.item.offsetHeight / 2);

    const elements = document.elementsFromPoint(checkX, checkY);
    const target = elements.find(
      el => el.classList && el.classList.contains('desk-tanzaku') && el.parentNode === DOM.sortArea
    );

    if (target && target !== drag.placeholder && target !== drag.item) {
      const targetRect = target.getBoundingClientRect();
      if (prefs.direction === 'vertical') {
        if (checkX > targetRect.left + targetRect.width / 2) {
          DOM.sortArea.insertBefore(drag.placeholder, target);
        } else {
          DOM.sortArea.insertBefore(drag.placeholder, target.nextSibling);
        }
      } else {
        if (checkY < targetRect.top + targetRect.height / 2) {
          DOM.sortArea.insertBefore(drag.placeholder, target);
        } else {
          DOM.sortArea.insertBefore(drag.placeholder, target.nextSibling);
        }
      }
    }
  }

  function stepAutoScroll(now) {
    if (!drag.isDragging || (drag.speedX === 0 && drag.speedY === 0)) {
      drag.rafId = null;
      drag.lastFrameTime = 0;
      return;
    }
    if (!drag.lastFrameTime) drag.lastFrameTime = now;
    const dt = Math.min(0.05, (now - drag.lastFrameTime) / 1000);
    drag.lastFrameTime = now;

    if (prefs.direction === 'vertical') {
      DOM.sortArea.scrollLeft += drag.speedX * dt;
    } else {
      DOM.sortArea.scrollTop += drag.speedY * dt;
    }

    checkIntersection();
    drag.rafId = requestAnimationFrame(stepAutoScroll);
  }

  function handlePointerMove(e) {
    if (!drag.isDragging || !drag.item) return;
    e.preventDefault();

    const now = Date.now();
    if (now - drag.lastMoveTime < 16) return;
    drag.lastMoveTime = now;

    drag.lastX = e.clientX;
    drag.lastY = e.clientY;

    if (prefs.direction === 'horizontal') {
      drag.item.style.left = `${drag.origLeft}px`;
      drag.item.style.top = `${e.clientY - drag.offsetY}px`;
    } else {
      drag.item.style.left = `${e.clientX - drag.offsetX}px`;
      drag.item.style.top = `${drag.origTop}px`;
    }

    const areaRect = DOM.sortArea.getBoundingClientRect();
    const dragRect = drag.item.getBoundingClientRect();
    const threshold = 70;
    const minSpeed = 70;
    const maxSpeed = 300;

    drag.speedX = 0;
    drag.speedY = 0;

    if (prefs.direction === 'vertical') {
      if (dragRect.left < areaRect.left + threshold) {
        const over = Math.max(0, (areaRect.left + threshold) - dragRect.left);
        const ratio = Math.min(1, over / threshold);
        drag.speedX = -(minSpeed + (maxSpeed - minSpeed) * ratio * ratio);
      } else if (dragRect.right > areaRect.right - threshold) {
        const over = Math.max(0, dragRect.right - (areaRect.right - threshold));
        const ratio = Math.min(1, over / threshold);
        drag.speedX = minSpeed + (maxSpeed - minSpeed) * ratio * ratio;
      }
    } else {
      if (dragRect.top < areaRect.top + threshold) {
        const over = Math.max(0, (areaRect.top + threshold) - dragRect.top);
        const ratio = Math.min(1, over / threshold);
        drag.speedY = -(minSpeed + (maxSpeed - minSpeed) * ratio * ratio);
      } else if (dragRect.bottom > areaRect.bottom - threshold) {
        const over = Math.max(0, dragRect.bottom - (areaRect.bottom - threshold));
        const ratio = Math.min(1, over / threshold);
        drag.speedY = minSpeed + (maxSpeed - minSpeed) * ratio * ratio;
      }
    }

    if ((drag.speedX !== 0 || drag.speedY !== 0) && !drag.rafId) {
      drag.lastFrameTime = 0;
      drag.rafId = requestAnimationFrame(stepAutoScroll);
    }

    checkIntersection();
  }

  function handlePointerUp() {
    if (!drag.isDragging || !drag.item) return;

    drag.speedX = 0;
    drag.speedY = 0;
    if (drag.rafId) {
      cancelAnimationFrame(drag.rafId);
      drag.rafId = null;
    }
    drag.lastFrameTime = 0;

    DOM.sortArea.insertBefore(drag.item, drag.placeholder);
    drag.placeholder.remove();
    drag.placeholder = null;

    drag.item.classList.remove('dragging');
    drag.item.style.cssText = '';

    document.removeEventListener('pointermove', handlePointerMove);
    document.removeEventListener('pointerup', handlePointerUp);
    document.removeEventListener('pointercancel', handlePointerUp);

    drag.item = null;
    drag.isDragging = false;

    updateListNumbers();
    updateCustomScrollbar();
  }

  function renderTanzakus(cards) {
    DOM.sortArea.className = `dir-${prefs.direction}`;
    DOM.sortArea.innerHTML = '';

    cards.forEach((card, index) => {
      const tanzaku = document.createElement('div');
      tanzaku.className = `desk-tanzaku font-${prefs.font} dir-${prefs.direction} wrap-${prefs.wrap}`;
      tanzaku._cardData = card;

      const numDiv = document.createElement('div');
      numDiv.className = 'desk-item-num';
      numDiv.textContent = String(index + 1);

      const textDiv = document.createElement('div');
      textDiv.className = 'desk-tanzaku-text';
      textDiv.textContent = card.content;

      const handle = document.createElement('div');
      handle.className = 'desk-drag-handle';
      handle.innerHTML = '&#9776;';
      handle.addEventListener('pointerdown', (e) => handlePointerDown(e, tanzaku));

      tanzaku.appendChild(numDiv);
      tanzaku.appendChild(textDiv);
      tanzaku.appendChild(handle);
      DOM.sortArea.appendChild(tanzaku);
    });

    requestAnimationFrame(updateCustomScrollbar);
  }

  // --- ボタンイベント ---
  DOM.btnFont.addEventListener('click', () => {
    prefs.font = prefs.font === 'gothic' ? 'mincho' : 'gothic';
    applyPrefsToSortArea();
  });
  DOM.btnDir.addEventListener('click', () => {
    prefs.direction = prefs.direction === 'horizontal' ? 'vertical' : 'horizontal';
    applyPrefsToSortArea();
  });
  DOM.btnWrap.addEventListener('click', () => {
    prefs.wrap = prefs.wrap === 'false' ? 'true' : 'false';
    applyPrefsToSortArea();
  });

  DOM.btnToFinish.addEventListener('click', () => {
    const els = Array.from(DOM.sortArea.children).filter(
      el => el.classList.contains('desk-tanzaku') && !el.classList.contains('dragging')
    );
    if (els.length === 0) return;

    orderedCards = els.map(el => el._cardData);
    finalResultText = orderedCards.map(c => c.content).join('\n\n');
    DOM.previewArea.className = `desk-preview-area font-${prefs.font}`;
    DOM.previewArea.textContent = finalResultText;
    showScreen('finish');
  });

  DOM.btnBackSort.addEventListener('click', () => showScreen('sort'));

  DOM.btnCopy.addEventListener('click', async () => {
    if (!finalResultText) return;
    try {
      await navigator.clipboard.writeText(finalResultText);
      alert('コピーしました。');
    } catch (_) {
      alert('コピーに失敗しました。');
    }
  });

  DOM.btnSaveShelf.addEventListener('click', async () => {
    if (orderedCards.length === 0) return;

    const now = Date.now();
    if (!currentShelfId) currentShelfId = now;

    const firstClean = orderedCards[0].content.replace(/\s+/g, '');
    const title = DOM.inputTitle.value.trim() || firstClean.slice(0, 5) || '無題';
    const memo = DOM.inputMemo.value;
    const tags = DOM.inputTags.value
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map(t => (t.startsWith('#') ? t : '#' + t));

    const items = orderedCards.map(c => ({
      id: c.id,
      content: c.content,
      memo: c.memo || '',
      tags: Array.isArray(c.tags) ? [...c.tags] : [],
      lastupdated: c.lastupdated || c.id
    }));

    const shelf = {
      id: currentShelfId,
      title,
      memo,
      tags,
      items,
      order: currentShelfId,
      lastupdated: now
    };

    try {
      await saveShelf(shelf);
      if (onSavedToShelf) await onSavedToShelf();
      alert('書庫へ保管しました。');
      DOM.panel.classList.remove('active');
    } catch (err) {
      console.error(err);
      alert('書庫への保管に失敗しました。');
    }
  });

  loadPrefs();

  return {
    open(cards) {
      if (!Array.isArray(cards) || cards.length === 0) return;
      currentShelfId = null;
      orderedCards = [...cards];
      finalResultText = '';
      DOM.inputTitle.value = '';
      DOM.inputMemo.value = '';
      DOM.inputTags.value = '';
      renderTanzakus(orderedCards);
      showScreen('sort');
      DOM.panel.classList.add('active');
    }
  };
}

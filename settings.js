/** さいきよ2 - ギアチェンジ式検索モジュール（検索 → 推敲 → 解除 / AND・OR複合検索） */

import { formatDateWithWeekday } from './ui.js';

export function initSearchModule({ getVisibleCardIds, onSearchStateChanged, onClearInputs }) {
  let mode = 'idle'; // 'idle' | 'searching' | 'suiko'
  const suikoVisibleIds = new Set();
  let debounceTimer = null;

  const DOM = {
    inputContent: document.getElementById('input-content'),
    inputTags: document.getElementById('input-tags'),
    btnSearch: document.getElementById('btn-search'),
    banner: document.getElementById('search-mode-banner'),
    bannerText: document.getElementById('search-banner-text'),
    btnBannerFix: document.getElementById('btn-search-banner-fix'),
    btnBannerReset: document.getElementById('btn-search-banner-reset')
  };

  function normalizeQuery(str) {
    return (str || '')
      .replace(/[｜│❘]/g, '|')
      .replace(/ /g, ' ')
      .toLowerCase();
  }

  function splitOrGroups(normalizedStr) {
    return normalizedStr
      .split('|')
      .map(group => group.trim().split(/\s+/).filter(Boolean))
      .filter(terms => terms.length > 0);
  }

  function updateUI(matchedCount = 0) {
    if (DOM.btnSearch) {
      DOM.btnSearch.classList.remove('is-searching', 'is-suiko');
      if (mode === 'idle') {
        DOM.btnSearch.textContent = '検索';
      } else if (mode === 'searching') {
        DOM.btnSearch.textContent = '推敲';
        DOM.btnSearch.classList.add('is-searching');
      } else if (mode === 'suiko') {
        DOM.btnSearch.textContent = '解除';
        DOM.btnSearch.classList.add('is-suiko');
      }
    }

    if (DOM.banner) {
      if (mode === 'idle') {
        DOM.banner.style.display = 'none';
      } else if (mode === 'searching') {
        DOM.banner.style.display = 'flex';
        DOM.bannerText.textContent = `検索中 (${matchedCount})`;
        if (DOM.btnBannerFix) DOM.btnBannerFix.style.display = 'inline-block';
      } else if (mode === 'suiko') {
        DOM.banner.style.display = 'flex';
        DOM.bannerText.textContent = `推敲固定 (${matchedCount}・新規書込を自動追加)`;
        if (DOM.btnBannerFix) DOM.btnBannerFix.style.display = 'none';
      }
    }
  }

  function filterCards(cards) {
    if (mode === 'idle') return cards;

    if (mode === 'suiko') {
      return cards.filter(c => suikoVisibleIds.has(c.id));
    }

    const cGroups = splitOrGroups(normalizeQuery(DOM.inputContent.value));
    const tGroups = splitOrGroups(normalizeQuery(DOM.inputTags.value));

    if (cGroups.length === 0 && tGroups.length === 0) return cards;

    return cards.filter(card => {
      const content = (card.content || '').toLowerCase();
      const memo = (card.memo || '').toLowerCase();
      const dateStr = formatDateWithWeekday(card.id).toLowerCase();
      const tagsList = Array.isArray(card.tags) ? card.tags : [];
      const tagsJoined = tagsList.join(' ').toLowerCase();
      const tagsNoHash = tagsList.map(t => t.replace(/^#/, '')).join(' ').toLowerCase();

      const cMatch = cGroups.length === 0 || cGroups.some(andTerms =>
        andTerms.every(term =>
          content.includes(term) || memo.includes(term) || dateStr.includes(term)
        )
      );

      const tMatch = tGroups.length === 0 || tGroups.some(andTerms =>
        andTerms.every(term => {
          const bare = term.replace(/^#/, '');
          return tagsJoined.includes(term) || (bare && tagsNoHash.includes(bare));
        })
      );

      return cMatch && tMatch;
    });
  }

  function enterSearching() {
    mode = 'searching';
    suikoVisibleIds.clear();
    onSearchStateChanged({ forceBottom: false, preserveScroll: false });
  }

  function enterSuiko() {
    const visibleIds = getVisibleCardIds();
    suikoVisibleIds.clear();
    visibleIds.forEach(id => suikoVisibleIds.add(id));
    mode = 'suiko';
    DOM.inputContent.value = '';
    DOM.inputTags.value = '';
    if (onClearInputs) onClearInputs();
    onSearchStateChanged({ forceBottom: false, preserveScroll: true });
  }

  function reset({ clearInputs = true, silent = false } = {}) {
    clearTimeout(debounceTimer);
    mode = 'idle';
    suikoVisibleIds.clear();
    if (clearInputs) {
      DOM.inputContent.value = '';
      DOM.inputTags.value = '';
      if (onClearInputs) onClearInputs();
    }
    if (!silent) {
      onSearchStateChanged({ forceBottom: true, preserveScroll: false });
    } else {
      updateUI(0);
    }
  }

  function cycleMode() {
    if (mode === 'idle') {
      enterSearching();
    } else if (mode === 'searching') {
      enterSuiko();
    } else {
      reset({ clearInputs: true });
    }
  }

  function handleCardCreated(newCardId) {
    if (mode === 'searching') {
      mode = 'idle';
      suikoVisibleIds.clear();
      return 'exited_search';
    } else if (mode === 'suiko') {
      suikoVisibleIds.add(newCardId);
      return 'added_suiko';
    }
    return 'idle';
  }

  function handleDebouncedInput() {
    if (mode !== 'searching') return;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      onSearchStateChanged({ forceBottom: false, preserveScroll: false });
    }, 250);
  }

  if (DOM.btnSearch) DOM.btnSearch.addEventListener('click', cycleMode);
  if (DOM.inputContent) DOM.inputContent.addEventListener('input', handleDebouncedInput);
  if (DOM.inputTags) DOM.inputTags.addEventListener('input', handleDebouncedInput);

  if (DOM.btnBannerFix) {
    DOM.btnBannerFix.addEventListener('click', () => {
      if (mode === 'searching') enterSuiko();
    });
  }
  if (DOM.btnBannerReset) {
    DOM.btnBannerReset.addEventListener('click', () => {
      reset({ clearInputs: true });
    });
  }

  return {
    filterCards,
    updateUI,
    handleCardCreated,
    reset,
    isActive: () => mode !== 'idle',
    getMode: () => mode
  };
}

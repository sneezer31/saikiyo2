/** さいきよ2 - データ管理モジュール（バックアップ・復元・一括削除） */

import {
  loadAllCards,
  bulkSaveCards,
  deleteCard,
  loadAllShelves,
  bulkSaveShelves
} from './db.js';

export function initDataManagerModule({ onDataChanged, onCardsDeleted }) {
  const DOM = {
    stats: document.getElementById('data-stats'),
    btnExportFile: document.getElementById('btn-export-file'),
    btnExportCopy: document.getElementById('btn-export-copy'),
    btnImportFile: document.getElementById('btn-import-file'),
    inputImportFile: document.getElementById('input-import-file'),
    inputImportText: document.getElementById('input-import-text'),
    btnImportText: document.getElementById('btn-import-text'),
    inputCleanTag: document.getElementById('input-clean-tag'),
    btnCleanTag: document.getElementById('btn-clean-tag'),
    inputCleanDate: document.getElementById('input-clean-date'),
    btnCleanDate: document.getElementById('btn-clean-date')
  };

  async function updateStats() {
    const [cards, shelves] = await Promise.all([loadAllCards(), loadAllShelves()]);
    DOM.stats.textContent = `保存中：カード ${cards.length} 件 ／ リスト棚 ${shelves.length} 件`;
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
      alert(`バックアップ用JSON（カード${payload.cards.length}件・棚${payload.shelves.length}件）をコピーしました。`);
    } catch (_) {
      alert('コピーに失敗しました。');
    }
  });

  async function importBackupJson(rawText) {
    let parsed;
    try {
      parsed = JSON.parse(rawText);
    } catch (_) {
      alert('JSONの形式が正しくありません。');
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
      alert('読み込めるデータが見つかりませんでした。');
      return;
    }

    if (cardsToImport.length > 0) await bulkSaveCards(cardsToImport);
    if (shelvesToImport.length > 0) await bulkSaveShelves(shelvesToImport);

    await onDataChanged();
    await updateStats();
    alert(`復元が完了しました（カード ${cardsToImport.length} 件 ／ リスト棚 ${shelvesToImport.length} 件を統合）。`);
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
      alert('JSONテキストが入力されていません。');
      return;
    }
    await importBackupJson(raw);
    DOM.inputImportText.value = '';
  });

  document.querySelectorAll('.dm-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      DOM.inputCleanTag.value = btn.dataset.tag;
    });
  });

  DOM.btnCleanTag.addEventListener('click', async () => {
    const rawTag = DOM.inputCleanTag.value.trim();
    if (!rawTag) {
      alert('削除するタグを入力してください。');
      return;
    }
    const targetTag = rawTag.startsWith('#') ? rawTag : '#' + rawTag;
    const allCards = await loadAllCards();
    const targets = allCards.filter(c => Array.isArray(c.tags) && c.tags.includes(targetTag));

    if (targets.length === 0) {
      alert(`タグ「${targetTag}」が付いたカードは 0 件です。`);
      return;
    }

    if (!confirm(`タグ「${targetTag}」のカード ${targets.length} 件を一括削除しますか？\n※この操作は取り消せません。事前にバックアップを取ることをおすすめします。`)) {
      return;
    }

    const targetIdSet = new Set(targets.map(c => c.id));
    await Promise.all(targets.map(c => deleteCard(c.id)));

    await onCardsDeleted(targetIdSet);
    await updateStats();
    alert(`${targets.length} 件のカードを削除しました。`);
  });

  DOM.btnCleanDate.addEventListener('click', async () => {
    const dateVal = DOM.inputCleanDate.value;
    if (!dateVal) {
      alert('基準となる日付を選択してください。');
      return;
    }
    const cutoffTs = new Date(`${dateVal}T00:00:00`).getTime();
    if (Number.isNaN(cutoffTs)) return;

    const allCards = await loadAllCards();
    const targets = allCards.filter(c => c.id < cutoffTs);

    if (targets.length === 0) {
      alert(`${dateVal} より前のカードは 0 件です。`);
      return;
    }

    if (!confirm(`${dateVal} より前に作成されたカード ${targets.length} 件を一括削除しますか？\n※この操作は取り消せません。`)) {
      return;
    }

    const targetIdSet = new Set(targets.map(c => c.id));
    await Promise.all(targets.map(c => deleteCard(c.id)));

    await onCardsDeleted(targetIdSet);
    await updateStats();
    alert(`${targets.length} 件のカードを削除しました。`);
  });

  return {
    updateStats
  };
}

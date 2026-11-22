/** さいきよ2 - データ管理モジュール（共有バックアップ・.txt復元・一括削除） */

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
    btnExportShare: document.getElementById('btn-export-share'),
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

  function makeBackupFileName() {
    const d = new Date();
    const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    const hm = `${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
    return `saikiyo2_backup_${ymd}_${hm}.txt`;
  }

  function downloadTextFile(jsonStr, fileName) {
    const blob = new Blob([jsonStr], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // 共有シートを立ち上げて .txt ファイルをメール等へ送る
  DOM.btnExportShare.addEventListener('click', async () => {
    const payload = await buildBackupPayload();
    const jsonStr = JSON.stringify(payload, null, 2);
    const fileName = makeBackupFileName();
    const file = new File([jsonStr], fileName, { type: 'text/plain' });

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: `さいきよ2 バックアップ (${fileName})`,
          text: `カード ${payload.cards.length} 件 ／ リスト棚 ${payload.shelves.length} 件`
        });
        return;
      } catch (err) {
        if (err && err.name === 'AbortError') return; // ユーザーキャンセル
      }
    }

    // 共有非対応環境（PCブラウザ等）はそのまま .txt ダウンロードへフォールバック
    downloadTextFile(jsonStr, fileName);
    alert('この端末では直接共有に非対応のため、.txt ファイルとして保存しました。');
  });

  // 通常の .txt ファイル保存
  DOM.btnExportFile.addEventListener('click', async () => {
    const payload = await buildBackupPayload();
    const jsonStr = JSON.stringify(payload, null, 2);
    downloadTextFile(jsonStr, makeBackupFileName());
  });

  DOM.btnExportCopy.addEventListener('click', async () => {
    const payload = await buildBackupPayload();
    const jsonStr = JSON.stringify(payload);
    try {
      await navigator.clipboard.writeText(jsonStr);
      alert(`バックアップ用データ（カード${payload.cards.length}件・棚${payload.shelves.length}件）をコピーしました。`);
    } catch (_) {
      alert('コピーに失敗しました。');
    }
  });

  // 初代データを含めて安全に正規化する
  function normalizeCard(raw, fallbackOffset) {
    if (!raw || typeof raw !== 'object') return null;
    const content = typeof raw.content === 'string'
      ? raw.content
      : (typeof raw.text === 'string' ? raw.text : (typeof raw.body === 'string' ? raw.body : null));
    if (content === null) return null;

    const idNum = Number(raw.id);
    const id = !Number.isNaN(idNum) && idNum > 0 ? idNum : (Date.now() + fallbackOffset);

    let tags = [];
    if (Array.isArray(raw.tags)) {
      tags = raw.tags.map(t => String(t).trim()).filter(Boolean).map(t => t.startsWith('#') ? t : '#' + t);
    } else if (typeof raw.tags === 'string' && raw.tags.trim()) {
      tags = raw.tags.trim().split(/\s+/).filter(Boolean).map(t => t.startsWith('#') ? t : '#' + t);
    }

    return {
      id,
      content,
      memo: typeof raw.memo === 'string' ? raw.memo : '',
      tags,
      lastupdated: Number(raw.lastupdated) || id
    };
  }

  async function importBackupJson(rawText) {
    let parsed;
    try {
      parsed = JSON.parse(rawText.trim());
    } catch (_) {
      alert('ファイルの中身が正しいJSON形式ではありません。');
      return;
    }

    let rawCards = [];
    let shelvesToImport = [];

    if (Array.isArray(parsed)) {
      rawCards = parsed;
    } else if (parsed && typeof parsed === 'object') {
      if (Array.isArray(parsed.cards)) rawCards = parsed.cards;
      else if (Array.isArray(parsed.data)) rawCards = parsed.data;
      else if (Array.isArray(parsed.items)) rawCards = parsed.items;

      if (Array.isArray(parsed.shelves)) {
        shelvesToImport = parsed.shelves.filter(s => s && typeof s.id !== 'undefined' && Array.isArray(s.items));
      }
    }

    const cardsToImport = rawCards
      .map((c, idx) => normalizeCard(c, idx))
      .filter(Boolean);

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

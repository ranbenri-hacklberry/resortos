import { parseMoney } from './dailyCollection';

function cents(value) {
  return Math.round(Number(value || 0) * 100);
}

function fromCents(value) {
  return Math.round(Number(value || 0)) / 100;
}

function dayDelta(a, b) {
  if (!a || !b) return 999;
  const left = new Date(`${a}T12:00:00`).getTime();
  const right = new Date(`${b}T12:00:00`).getTime();
  if (Number.isNaN(left) || Number.isNaN(right)) return 999;
  return Math.round(Math.abs(left - right) / 86400000);
}

function bestDateDelta(stayDate, tx) {
  return Math.min(dayDelta(stayDate, tx.depositDate), dayDelta(stayDate, tx.creditDate));
}

export function maxTxKey(tx, index) {
  return `${tx.batchId || ''}-${tx.cardLast4 || ''}-${tx.creditDate || ''}-${tx.installment || 'x'}-${index}`;
}

export function isFollowOnInstallment(tx) {
  const inst = String(tx.installment || '');
  return inst.includes('/') && !inst.startsWith('1/');
}

function creditFromNotes(notes) {
  const text = String(notes || '');
  const before = text.match(/([\d,]{2,})\s*אשראי/);
  const after = text.match(/אשראי[^\d]{0,12}([\d,]{2,})/);
  if (before) return parseMoney(before[1]);
  if (after) return parseMoney(after[1]);
  return 0;
}

export function collectionCreditAmount(row) {
  const methods = row?.methods || [];
  const joined = methods.join(' ');
  const notes = String(row?.notes || '');
  if (!joined.includes('אשראי') && !notes.includes('אשראי')) return 0;
  const fromNotes = creditFromNotes(notes);
  if (fromNotes > 0) return fromNotes;
  let leftover = (Number(row.amount) || 0) - (Number(row.cash) || 0) - (Number(row.voucher) || 0);
  if (leftover <= 0 && Number(row.deposit) > 0) leftover = Number(row.deposit);
  if (joined.includes('העברה') || notes.includes('העברה')) {
    const hit = notes.match(/העברה[^\d]{0,14}([\d,]+)/);
    if (hit) leftover -= parseMoney(hit[1]);
  }
  leftover = Math.round(leftover * 100) / 100;
  return leftover > 0 ? leftover : 0;
}

function confidenceOf(kind, delta) {
  if (kind === 'pair') return delta <= 3 ? 'medium' : 'low';
  if (delta <= 1) return 'high';
  if (delta <= 7) return 'medium';
  return 'low';
}

function decorateTx(tx, index) {
  return { ...tx, key: maxTxKey(tx, index), index };
}

export function matchMaxToCollection(collectionRows, maxRows, { maxDateDelta = 14, pairDateDelta = 10 } = {}) {
  const maxList = (maxRows || []).map(decorateTx);
  const candidates = (collectionRows || [])
    .map((row) => {
      const amount = collectionCreditAmount(row);
      return { row, amount, amountCents: cents(amount) };
    })
    .filter((item) => item.amountCents > 0);

  const usedMax = new Set();
  const usedCollection = new Set();
  const matches = [];

  const unusedByAmount = () => {
    const map = new Map();
    for (const tx of maxList) {
      if (usedMax.has(tx.key) || isFollowOnInstallment(tx)) continue;
      const key = cents(tx.gross);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(tx);
    }
    return map;
  };

  const tryExact = (limit) => {
    const byAmount = unusedByAmount();
    const queue = candidates
      .filter((item) => !usedCollection.has(item.row.id))
      .map((item) => ({
        ...item,
        options: (byAmount.get(item.amountCents) || [])
          .map((tx) => ({ tx, delta: bestDateDelta(item.row.stayDate, tx) }))
          .filter((opt) => opt.delta <= limit)
          .sort((a, b) => a.delta - b.delta)
      }))
      .filter((item) => item.options.length)
      .sort((a, b) => a.options.length - b.options.length || a.amountCents - b.amountCents);

    for (const item of queue) {
      if (usedCollection.has(item.row.id)) continue;
      const hit = item.options.find((opt) => !usedMax.has(opt.tx.key));
      if (!hit) continue;
      usedCollection.add(item.row.id);
      usedMax.add(hit.tx.key);
      matches.push({
        collectionId: item.row.id,
        collection: item.row,
        amount: item.amount,
        txs: [hit.tx],
        kind: 'exact',
        dateDelta: hit.delta,
        confidence: confidenceOf('exact', hit.delta)
      });
    }
  };

  tryExact(1);
  tryExact(7);
  tryExact(maxDateDelta);

  const unmatchedCandidates = candidates.filter((item) => !usedCollection.has(item.row.id));
  const unusedTxs = () => maxList.filter((tx) => !usedMax.has(tx.key) && !isFollowOnInstallment(tx));

  for (const item of unmatchedCandidates) {
    const byDay = new Map();
    for (const tx of unusedTxs()) {
      const delta = dayDelta(item.row.stayDate, tx.depositDate);
      if (delta > pairDateDelta) continue;
      if (!byDay.has(tx.depositDate)) byDay.set(tx.depositDate, []);
      byDay.get(tx.depositDate).push(tx);
    }
    let best = null;
    for (const [day, txs] of byDay.entries()) {
      const seen = new Map();
      for (const tx of txs) {
        const need = item.amountCents - cents(tx.gross);
        const other = seen.get(need);
        if (other && other.key !== tx.key) {
          const delta = dayDelta(item.row.stayDate, day);
          const cand = { delta, txs: [other, tx] };
          if (!best || cand.delta < best.delta) best = cand;
        }
        seen.set(cents(tx.gross), tx);
      }
    }
    if (!best) continue;
    usedCollection.add(item.row.id);
    best.txs.forEach((tx) => usedMax.add(tx.key));
    matches.push({
      collectionId: item.row.id,
      collection: item.row,
      amount: item.amount,
      txs: best.txs,
      kind: 'pair',
      dateDelta: best.delta,
      confidence: confidenceOf('pair', best.delta)
    });
  }

  const unmatchedCollection = candidates
    .filter((item) => !usedCollection.has(item.row.id))
    .map((item) => ({ ...item.row, creditAmount: item.amount }));

  const unmatchedMax = maxList.filter((tx) => !usedMax.has(tx.key));

  const byCollectionId = {};
  const byMaxKey = {};
  for (const match of matches) {
    byCollectionId[match.collectionId] = match;
    for (const tx of match.txs) byMaxKey[tx.key] = match;
  }

  return {
    matches,
    unmatchedCollection,
    unmatchedMax,
    followOn: unmatchedMax.filter(isFollowOnInstallment),
    byCollectionId,
    byMaxKey,
    totals: {
      collectionCredit: candidates.length,
      matched: matches.length,
      unmatchedCollection: unmatchedCollection.length,
      unmatchedMax: unmatchedMax.length,
      matchedGross: fromCents(matches.reduce((sum, match) => (
        sum + match.txs.reduce((inner, tx) => inner + cents(tx.gross), 0)
      ), 0)),
      unmatchedCollectionAmount: unmatchedCollection.reduce((sum, row) => sum + (row.creditAmount || 0), 0)
    }
  };
}

export function confidenceLabel(confidence) {
  if (confidence === 'high') return 'התאמה גבוהה';
  if (confidence === 'medium') return 'התאמה בינונית';
  if (confidence === 'low') return 'התאמה חלשה';
  return 'ללא התאמה';
}

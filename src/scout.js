// Scout v1: pure, reproducible market metrics. Not a trading recommendation.
// Bar timestamp is the START of a 15-minute interval (Alpaca convention).
export const SCOUT_RULES = Object.freeze({
  priceChangeAbsPct: 3,
  volumeSpikeMultiple: 2,
  baselineDays: 5,
  minimumBaselineDays: 3,
  minimumBaselineVolume: 100,
  minimumCurrentVolume: 1000,
  maxSignalsPerDay: 5,
  cooldownMinutes: 60,
  intervalMinutes: 15,
  dataSettleSeconds: 60,
  maxDataAgeMinutes: 32
});

const nyDateTime = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23'
});

export function partsNY(ts, cache = new Map()) {
  if (cache.has(ts)) return cache.get(ts);
  const bits = Object.fromEntries(nyDateTime.formatToParts(new Date(ts))
    .filter(p => p.type !== 'literal').map(p => [p.type, p.value]));
  const out = {
    date: `${bits.year}-${bits.month}-${bits.day}`,
    slot: `${bits.hour}:${bits.minute}`,
    weekday: bits.weekday,
    regular: bits.weekday !== 'Sat' && bits.weekday !== 'Sun' &&
      `${bits.hour}:${bits.minute}` >= '09:30' && `${bits.hour}:${bits.minute}` < '16:00'
  };
  cache.set(ts, out);
  return out;
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const m = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[m] : (sorted[m - 1] + sorted[m]) / 2;
}

export function calculateMetrics(rawBars, now = new Date(), cache = new Map()) {
  const time = now.getTime();
  const valid = rawBars.filter(b => Number.isFinite(Date.parse(b.t)) &&
    Number.isFinite(b.c) && b.c > 0 && Number.isFinite(b.v) && b.v >= 0 &&
    partsNY(b.t, cache).regular &&
    Date.parse(b.t) + (SCOUT_RULES.intervalMinutes * 60 + SCOUT_RULES.dataSettleSeconds) * 1000 <= time)
    .sort((a, b) => Date.parse(a.t) - Date.parse(b.t));

  if (!valid.length) return { ok: false, reason: 'Nessuna barra regolare completata disponibile' };
  const latest = valid[valid.length - 1];
  const lastNY = partsNY(latest.t, cache);
  const todayNY = partsNY(now.toISOString(), cache);
  const ageMinutes = (time - (Date.parse(latest.t) + 15 * 60_000)) / 60_000;
  if (lastNY.date !== todayNY.date || ageMinutes > SCOUT_RULES.maxDataAgeMinutes) {
    return { ok: false, reason: 'Dati non correnti: non emetto segnali', latest, dataDate: lastNY.date };
  }

  const earlierTime = Date.parse(latest.t) - 60 * 60_000;
  const older = valid.find(b => Date.parse(b.t) === earlierTime &&
    partsNY(b.t, cache).date === lastNY.date);
  const pct1h = older ? (latest.c / older.c - 1) * 100 : null;

  // The previous five distinct NY trading days for the same 15-minute clock slot.
  const volumesByDay = new Map();
  for (const bar of valid) {
    const p = partsNY(bar.t, cache);
    if (p.date !== lastNY.date && p.date < lastNY.date && p.slot === lastNY.slot) {
      volumesByDay.set(p.date, bar.v);
    }
  }
  const previous = [...volumesByDay.entries()].sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, SCOUT_RULES.baselineDays).map(([, vol]) => vol);
  const baselineVolume = previous.length >= SCOUT_RULES.minimumBaselineDays ? median(previous) : null;
  const volumeRatio = baselineVolume !== null && baselineVolume >= SCOUT_RULES.minimumBaselineVolume
    ? latest.v / baselineVolume : null;
  const moved = pct1h !== null && Math.abs(pct1h) >= SCOUT_RULES.priceChangeAbsPct;
  const spiked = volumeRatio !== null && volumeRatio >= SCOUT_RULES.volumeSpikeMultiple &&
    latest.v >= SCOUT_RULES.minimumCurrentVolume;
  const reasons = [];
  if (moved) reasons.push(`Movimento 1h ${pct1h >= 0 ? '+' : ''}${pct1h.toFixed(2)}%`);
  if (spiked) reasons.push(`Volume ${volumeRatio.toFixed(2)}x vs mediana stessa fascia (${previous.length} giorni)`);
  return {
    ok: true, latest, pct1h, volumeRatio, baselineVolume, baselineDays: previous.length,
    reason: reasons.join(' · '), flagged: moved || spiked,
    tradeDate: lastNY.date,
    ageMinutes: Math.round(ageMinutes * 10) / 10
  };
}

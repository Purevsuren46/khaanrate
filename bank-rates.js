const axios = require('axios');
const cheerio = require('cheerio');
const cache = require('./cache');

const CURRENCIES = ['usd','cny','eur','rub','jpy','krw','gbp'];
const CUR_MAP = { usd:'USD', cny:'CNY', eur:'EUR', rub:'RUB', jpy:'JPY', krw:'KRW', gbp:'GBP' };
const DATE = () => new Date().toISOString().slice(0,10).replace(/-/g,'');

const UA_LIST = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0.0.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 Safari/17.4',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124.0.0.0',
];
function randUA() { return UA_LIST[Math.floor(Math.random() * UA_LIST.length)]; }

// ─── Golomt Bank ────────────────────────────────────────────────
async function golomt() {
  const d = DATE();
  const rates = {};
  for (const c of CURRENCIES) {
    try {
      const [b, s] = await Promise.all([
        axios.get(`https://www.golomtbank.com/api/exchangerateinfo?date=${d}&from=${CUR_MAP[c]}&to=MNT&type=cash_buy`, {timeout:5000, headers:{'User-Agent':randUA()}}),
        axios.get(`https://www.golomtbank.com/api/exchangerateinfo?date=${d}&from=${CUR_MAP[c]}&to=MNT&type=cash_sell`, {timeout:5000, headers:{'User-Agent':randUA()}}),
      ]);
      const buy = parseFloat(b.data?.rate?.cvalue?.[0]||0);
      const sell = parseFloat(s.data?.rate?.cvalue?.[0]||0);
      if (buy||sell) rates[c] = {buy, sell};
    } catch{}
  }
  return Object.keys(rates).length ? {name:'GolomtBank', mn:'🏦 Голомт Банк', rates} : null;
}

// ─── XacBank ─────────────────────────────────────────────────────
async function xacbank() {
  try {
    const {data} = await axios.get('https://xacbank.mn/api/currencies', {timeout:8000, headers:{'User-Agent':randUA()}});
    const rates = {};
    const official = {};
    for (const doc of (data.docs||[])) {
      const code = doc.code?.toLowerCase();
      if (CURRENCIES.includes(code)) {
        rates[code] = {buy: doc.buyCash||doc.buy||0, sell: doc.sellCash||doc.sell||0};
        if (doc.alban) official[code] = doc.alban;
      }
    }
    return Object.keys(rates).length ? {name:'XacBank', mn:'💚 Хас Банк', rates, official} : null;
  } catch { return null; }
}

// ─── StateBank ───────────────────────────────────────────────────
async function statebank() {
  try {
    const {data} = await axios.get('https://www.statebank.mn/back/api/fetchrate', {timeout:8000, headers:{'User-Agent':randUA()}});
    const rates = {};
    const official = {};
    for (const item of data) {
      const code = item.curCode?.toLowerCase();
      if (CURRENCIES.includes(code)) {
        rates[code] = {buy: item.cashBuy||0, sell: item.cashSale||0};
        official[code] = item.mnBankSale || item.mnBankBuy || 0;
      }
    }
    return Object.keys(rates).length ? {name:'StateBank', mn:'🏛️ Төрийн Банк', rates, official} : null;
  } catch { return null; }
}

// ─── TDBM (Худалдаа Хөгжлийн Банк) ────────────────────────────
async function tdbm() {
  try {
    const {data: html} = await axios.get('https://www.tdbm.mn/mn/exchange-rates', {timeout:10000, headers:{'User-Agent':randUA(),'Accept':'text/html'}});
    const $ = cheerio.load(html);
    const rates = {};
    $('table tbody tr, table tr').each((_, row) => {
      const cells = [];
      $(row).find('td').each((_, cell) => cells.push($(cell).text().trim()));
      for (let i = 0; i < cells.length; i++) {
        const code = cells[i].trim().toUpperCase();
        if (CURRENCIES.includes(code.toLowerCase())) {
          const nums = cells.slice(i+1).map(c => parseFloat(c.replace(/[^0-9.]/g,''))).filter(n => n > 0);
          // TDBM: official, cash_buy, cash_sell, noncash_buy, noncash_sell
          if (nums.length >= 3) rates[code.toLowerCase()] = {buy: nums[1], sell: nums[2]};
          else if (nums.length >= 2) rates[code.toLowerCase()] = {buy: nums[0], sell: nums[1]};
          break;
        }
      }
    });
    return Object.keys(rates).length ? {name:'TDBM', mn:'🏦 ХХБ (ТДБ)', rates} : null;
  } catch { return null; }
}

// ─── TransBank ───────────────────────────────────────────────────
async function transbank() {
  try {
    const {data: html} = await axios.get('https://www.transbank.mn/exchange', {timeout:10000, headers:{'User-Agent':randUA(),'Accept':'text/html'}});
    const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (!m) return null;
    const pageData = JSON.parse(m[1]);
    const rateData = pageData?.props?.pageProps?.rateData;
    if (!rateData) return null;
    const date = Object.keys(rateData)[0];
    const dayRates = rateData[date];
    const rates = {};
    for (const [code, info] of Object.entries(dayRates)) {
      const lc = code.toLowerCase();
      if (!CURRENCIES.includes(lc)) continue;
      const cash = info['2'] || info['1'] || {}; // key "2" = cash
      const buy = parseFloat(cash.BUY_RATE || 0);
      const sell = parseFloat(cash.SELL_RATE || 0);
      if (buy > 0 || sell > 0) rates[lc] = {buy, sell};
    }
    return Object.keys(rates).length ? {name:'TransBank', mn:'🏦 Транс Банк', rates} : null;
  } catch { return null; }
}

// ─── Outlier Detection ───────────────────────────────────────────// ─── Find bank by mnemonic ────────────────────────────────────────────────
function findBankByMnemonic(banks, mnemonic) {
  const key = mnemonic.toLowerCase().replace(/[\s_]/g,'');
  return banks.find(b => {
    const normalized = b.mn.toLowerCase().replace(/[\s_]/g,'');
    return normalized.includes(key) || key.includes(normalized) ||
           b.name.toLowerCase().includes(key) || key.includes(b.name.toLowerCase());
  }) || banks.find(b => b.name.toLowerCase().includes(key)) ||
     banks.find(b => b.name.toLowerCase().includes(mnemonic.toLowerCase())) ||
     banks.find(b => b.mn.toLowerCase().includes(mnemonic.toLowerCase()));
}


function detectOutliers(banks, prevBanks) {
  if (!prevBanks) return [];
  const alerts = [];
  for (const bank of banks) {
    const prev = prevBanks.find(b => b.name === bank.name);
    if (!prev) continue;
    for (const cur of CURRENCIES) {
      const curRate = bank.rates[cur];
      const prevRate = prev.rates[cur];
      if (!curRate || !prevRate) continue;
      for (const side of ['buy', 'sell']) {
        if (!curRate[side] || !prevRate[side]) continue;
        const pct = Math.abs((curRate[side] - prevRate[side]) / prevRate[side] * 100);
        if (pct > 5) {
          alerts.push(`⚠️ OUTLIER: ${bank.mn} ${cur.toUpperCase()} ${side}: ${curRate[side]} (was ${prevRate[side]}, ${pct.toFixed(1)}% change)`);
        }
      }
    }
  }
  return alerts;
}

// ─── Fetch all (with cache) ─────────────────────────────────────
async function fetchAll(opts = {}) {
  const forceRefresh = opts.force === true;
  const cached = cache.get('bankRates');
  if (cached && !forceRefresh) {
    console.log('📦 Using cached bank rates');
    return cached;
  }

  console.log('🏦 Fetching bank rates...');
  const [g, x, s, t, tb] = await Promise.all([golomt(), xacbank(), statebank(), tdbm(), transbank()]);
  const banks = [g, x, s, t, tb].filter(Boolean);
  banks.forEach(b => console.log(`  ✅ ${b.name}`));

  if (banks.length > 0) {
    // Outlier detection
    const prevBanks = cache.get('bankRates');
    const outliers = detectOutliers(banks, prevBanks);
    if (outliers.length > 0) {
      console.log('⚠️ Outliers detected:', outliers.join('; '));
      cache.set('outlierAlerts', outliers);
    }

    cache.set('bankRates', banks);
    banks.forEach(b => b._updatedAt = Date.now());
  }

  return banks;
}

// ─── Get official rate ──────────────────────────────────────────
function buildOfficial(banks) {
  const active = banks.filter(b => b.name !== 'MongolBank' && b.name !== 'StateBank' &&
    Object.values(b.rates).some(r => r.buy > 0 && r.sell > 0));
  if (active.length === 0) return null;
  // Pick bank whose mid-price is closest to the group mid-price
  const groupMid = {};
  for (const c of CURRENCIES) {
    const mids = active.map(b => {
      const r = b.rates[c];
      return r && r.buy > 0 && r.sell > 0 ? (r.buy + r.sell) / 2 : null;
    }).filter(v => v !== null);
    if (mids.length > 0) groupMid[c] = mids.reduce((a,b) => a+b,0) / mids.length;
  }
  let bestBank = null, bestScore = Infinity;
  for (const b of active) {
    let score = 0;
    for (const c of CURRENCIES) {
      if (!groupMid[c]) continue;
      const r = b.rates[c];
      if (r && r.buy > 0 && r.sell > 0) {
        const mid = (r.buy + r.sell) / 2;
        score += Math.abs(mid - groupMid[c]);
      }
    }
    if (score < bestScore) { bestScore = score; bestBank = b; }
  }
  return bestBank ? bestBank.official || bestBank.rates : null;
}

// ─── Background refresh ─────────────────────────────────────────
let refreshInterval = null;
function startBackgroundRefresh(intervalMs = 15 * 60 * 1000) {
  if (refreshInterval) clearInterval(refreshInterval);
  refreshInterval = setInterval(() => {
    fetchAll({ force: true }).catch(e => console.error('Background refresh error:', e.message));
  }, intervalMs);
  console.log(`🔄 Background rate refresh every ${intervalMs/60000}min`);
  // Initial fetch
  fetchAll({ force: true }).catch(e => console.error('Initial fetch error:', e.message));
}


// ─── Fallback bank sources ──────
async function golomtFallback() { try { const {data} = await axios.get('https://www.golomtbank.com/mn/en/exchange-rates', {timeout:8000}); return {name:'GolomtBank', mn:'🏦 Голомт Банк', rates:{usd:2500}}; } catch { return null; } }
async function xacbankFallback() { try { const {data} = await axios.get('https://xacbank.mn/api/public/currencies', {timeout:8000}); return {name:'XacBank', mn:'💚 Хас Банк', rates:{usd:2500}}; } catch { return null; } }
async function statebankFallback() { try { const {data} = await axios.get('https://www.statebank.mn/back/api/fetchrate', {timeout:8000}); return {name:'StateBank', mn:'🏛️ Төрийн Банк', rates:{usd:2500}}; } catch { return null; } }
async function tdbmFallback() { try { const {data} = await axios.get('https://www.tdbm.mn/mn/exchange-rates', {timeout:8000}); return {name:'TDBM', mn:'🏦 ХХБ (ТДБ)', rates:{usd:2500}}; } catch { return null; } }
async function transbankFallback() { try { const {data} = await axios.get('https://www.transbank.mn/exchange', {timeout:8000}); return {name:'TransBank', mn:'🏦 Транс Банк', rates:{usd:2500}}; } catch { return null; } }

module.exports = {fetchAll, golomt, xacbank, statebank, tdbm, transbank, buildOfficial, startBackgroundRefresh, detectOutliers, findBankByMnemonic, CURRENCIES, CUR_MAP};

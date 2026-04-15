// 🏦 Bank Scraper — Cheerio + axios (NO Puppeteer)
// Lightweight HTML scraping with User-Agent rotation
// Custom scrapers per bank (generic extractRatesFromHTML as fallback)

const axios = require('axios');
const cheerio = require('cheerio');

const CURRENCIES = ['USD', 'CNY', 'EUR', 'RUB', 'JPY', 'KRW', 'GBP'];
const CUR_SET = new Set(CURRENCIES);

const UA_LIST = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0.0.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 Safari/17.4',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124.0.0.0',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15',
];
function randUA() { return UA_LIST[Math.floor(Math.random() * UA_LIST.length)]; }

async function fetchPage(url, timeout = 10000) {
  const { data } = await axios.get(url, {
    timeout,
    headers: { 'User-Agent': randUA(), 'Accept': 'text/html,application/xhtml+xml' }
  });
  return data;
}

// ─── Generic HTML rate extraction (fallback) ─────────────────────
function extractRatesFromHTML(html) {
  const $ = cheerio.load(html);
  const rates = {};

  // Strategy 1: Standard tables with currency codes
  $('table tr, .rate-table tr, .exchange-table tr, [class*=rate] tr, [class*=exchange] tr').each((_, row) => {
    const cells = [];
    $(row).find('td, th').each((_, cell) => {
      cells.push($(cell).text().trim());
    });
    const codeIdx = cells.findIndex(c => CUR_SET.has(c.toUpperCase()));
    if (codeIdx >= 0) {
      const code = cells[codeIdx].toUpperCase().toLowerCase();
      const nums = cells.map(c => parseFloat(c.replace(/[^0-9.]/g, ''))).filter(n => n > 0);
      if (nums.length >= 2) {
        rates[code] = { cash: { buy: nums[nums.length - 2], sell: nums[nums.length - 1] } };
      }
    }
  });

  // Strategy 2: Div/card-based layouts
  if (Object.keys(rates).length === 0) {
    $('[class*=currency], [class*=rate-item], [class*=exchange-item]').each((_, el) => {
      const text = $(el).text();
      for (const cur of CURRENCIES) {
        if (text.includes(cur)) {
          const nums = text.match(/\d+[\.,]?\d*/g)?.map(n => parseFloat(n.replace(',', ''))) || [];
          if (nums.length >= 2) {
            rates[cur.toLowerCase()] = { cash: { buy: nums[0], sell: nums[1] } };
          }
        }
      }
    });
  }

  return rates;
}

// ═══════════════════════════════════════════════════════════════════
// INDIVIDUAL BANK SCRAPERS
// Each bank has unique HTML/API structure — custom logic where needed
// ═══════════════════════════════════════════════════════════════════

// ─── Golomt Bank (JSON API) ──────────────────────────────────────
async function fetchGolomt() {
  const d = new Date().toISOString().slice(0,10).replace(/-/g,'');
  const rates = {};
  for (const cur of CURRENCIES) {
    try {
      const [buyRes, sellRes] = await Promise.all([
        axios.get(`https://www.golomtbank.com/api/exchangerateinfo?date=${d}&from=${cur}&to=MNT&type=cash_buy`, {timeout:5000, headers:{'User-Agent':randUA()}}),
        axios.get(`https://www.golomtbank.com/api/exchangerateinfo?date=${d}&from=${cur}&to=MNT&type=cash_sell`, {timeout:5000, headers:{'User-Agent':randUA()}}),
      ]);
      const buy = parseFloat(buyRes.data?.rate?.cvalue?.[0]||0);
      const sell = parseFloat(sellRes.data?.rate?.cvalue?.[0]||0);
      if (buy||sell) rates[cur.toLowerCase()] = {cash:{buy, sell}};
    } catch {}
  }
  return Object.keys(rates).length ? {bank_name:'GolomtBank', rates, date:new Date().toISOString().split('T')[0]} : null;
}

// ─── KhanBank (internal API) ─────────────────────────────────────
// Note: Often unreachable from overseas servers (DNS/connectivity)
async function fetchKhanBank() {
  try {
    const { data } = await axios.get('https://www.khanbank.com/api/site/home?lang=mn&site=personal', {
      timeout: 8000,
      headers: { 'User-Agent': randUA(), 'Accept': 'application/json' }
    });
    const rates = {};
    const raw = data?.exchangeRates || data?.rates || [];
    for (const r of raw) {
      const code = (r.code || r.currency || '').toLowerCase();
      if (CUR_SET.has(code.toUpperCase())) {
        rates[code] = { cash: { buy: parseFloat(r.cashBuy || r.buy || 0), sell: parseFloat(r.cashSell || r.sell || 0) } };
      }
    }
    // Fallback: try HTML scraping
    if (Object.keys(rates).length === 0) {
      const html = await fetchPage('https://www.khanbank.com/mn/rates');
      const htmlRates = extractRatesFromHTML(html);
      Object.assign(rates, htmlRates);
    }
    return Object.keys(rates).length ? {bank_name:'KhanBank', rates, date:new Date().toISOString().split('T')[0]} : null;
  } catch { return null; }
}

// ─── TDBM / Худалдаа Хөгжлийн Банк (HTML table - custom) ────────
// Drupal site with structured <td> elements
// Format: currency code, name, official rate, cash buy, cash sell, non-cash buy, non-cash sell
async function fetchTDBM() {
  try {
    const html = await fetchPage('https://www.tdbm.mn/mn/exchange-rates');
    const $ = cheerio.load(html);
    const rates = {};

    $('table tbody tr, table tr').each((_, row) => {
      const cells = [];
      $(row).find('td').each((_, cell) => {
        const text = $(cell).text().trim();
        // Strip images/icons, keep text
        cells.push(text.replace(/[^\d.A-ZUSD EUR CNY RUB JPY KRW GBP]/g, '').trim() || text);
      });

      // Find currency code in cells
      for (let i = 0; i < cells.length; i++) {
        const code = cells[i].trim().toUpperCase();
        if (CUR_SET.has(code)) {
          // Extract all numbers from remaining cells
          const nums = cells.slice(i + 1).map(c => parseFloat(c.replace(/[^0-9.]/g, ''))).filter(n => n > 0);
          // TDBM layout: official, cash_buy, cash_sell, noncash_buy, noncash_sell
          if (nums.length >= 3) {
            rates[code.toLowerCase()] = { cash: { buy: nums[1], sell: nums[2] } };
          } else if (nums.length >= 2) {
            rates[code.toLowerCase()] = { cash: { buy: nums[0], sell: nums[1] } };
          }
          break;
        }
      }
    });

    return Object.keys(rates).length ? {bank_name:'TDBM', rates, date:new Date().toISOString().split('T')[0]} : null;
  } catch { return null; }
}

// ─── TransBank (Next.js __NEXT_DATA__ JSON) ──────────────────────
// Clean JSON embedded in SSR page — key "2" = cash rates
async function fetchTransBank() {
  try {
    const html = await fetchPage('https://www.transbank.mn/exchange');
    const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (!m) return null;

    const data = JSON.parse(m[1]);
    const rateData = data?.props?.pageProps?.rateData;
    if (!rateData) return null;

    const rates = {};
    const date = Object.keys(rateData)[0];
    const dayRates = rateData[date];

    for (const [code, info] of Object.entries(dayRates)) {
      const upperCode = code.toUpperCase();
      if (!CUR_SET.has(upperCode)) continue;
      // Key "2" = cash rates, fallback to "1" (official)
      const cash = info['2'] || info['1'] || {};
      const buy = parseFloat(cash.BUY_RATE || 0);
      const sell = parseFloat(cash.SELL_RATE || 0);
      if (buy > 0 || sell > 0) {
        rates[code.toLowerCase()] = { cash: { buy, sell } };
      }
    }

    return Object.keys(rates).length ? {bank_name:'TransBank', rates, date} : null;
  } catch { return null; }
}

// ─── CapitronBank (HTML - generic) ───────────────────────────────
async function fetchCapitron() {
  try {
    const html = await fetchPage('https://www.capitronbank.mn/mn/rates');
    const rates = extractRatesFromHTML(html);
    return Object.keys(rates).length ? {bank_name:'CapitronBank', rates, date:new Date().toISOString().split('T')[0]} : null;
  } catch { return null; }
}

// ─── BogdBank (HTML - generic) ───────────────────────────────────
async function fetchBogdBank() {
  try {
    const html = await fetchPage('https://www.bogdbank.mn/mn/rates');
    const rates = extractRatesFromHTML(html);
    return Object.keys(rates).length ? {bank_name:'BogdBank', rates, date:new Date().toISOString().split('T')[0]} : null;
  } catch { return null; }
}

// ─── ArigBank (SPA - no SSR, Cheerio won't work) ────────────────
async function fetchArigBank() {
  try {
    const html = await fetchPage('https://www.arigbank.mn');
    const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (m) {
      const data = JSON.parse(m[1]);
      const pp = data?.props?.pageProps;
      if (pp?.rateData || pp?.rates) {
        const rates = {};
        const rd = pp.rateData || pp.rates;
        // Try to extract similar to TransBank
        for (const [code, info] of Object.entries(rd)) {
          const upperCode = code.toUpperCase();
          if (!CUR_SET.has(upperCode)) continue;
          const buy = parseFloat(info.buy || info.BUY_RATE || info.cashBuy || 0);
          const sell = parseFloat(info.sell || info.SELL_RATE || info.cashSell || 0);
          if (buy > 0 || sell > 0) {
            rates[code.toLowerCase()] = { cash: { buy, sell } };
          }
        }
        if (Object.keys(rates).length) return {bank_name:'ArigBank', rates, date:new Date().toISOString().split('T')[0]};
      }
    }
    // Fallback: generic HTML scraping
    const rates = extractRatesFromHTML(html);
    return Object.keys(rates).length ? {bank_name:'ArigBank', rates, date:new Date().toISOString().split('T')[0]} : null;
  } catch { return null; }
}

// ─── MBank (HTML - generic) ──────────────────────────────────────
async function fetchMBank() {
  try {
    const html = await fetchPage('https://www.mbank.mn/mn/rates');
    const rates = extractRatesFromHTML(html);
    return Object.keys(rates).length ? {bank_name:'MBank', rates, date:new Date().toISOString().split('T')[0]} : null;
  } catch { return null; }
}

// ─── Fetch all banks ─────────────────────────────────────────────
async function fetchAllBanks() {
  console.log('🏦 Fetching bank rates (Cheerio)...');
  const scrapers = [
    fetchGolomt, fetchKhanBank, fetchTDBM, fetchTransBank,
    fetchCapitron, fetchBogdBank, fetchArigBank, fetchMBank,
  ];
  const results = await Promise.allSettled(scrapers.map(fn => fn()));
  const banks = [];
  for (const r of results) {
    if (r.status === 'fulfilled' && r.value) {
      banks.push(r.value);
      console.log(`  ✅ ${r.value.bank_name} (${Object.keys(r.value.rates).length} currencies)`);
    } else if (r.status === 'rejected') {
      console.log(`  ❌ Scraper error: ${r.reason?.message?.substring(0,60)}`);
    }
  }
  console.log(`🏁 Total: ${banks.length} banks`);
  return banks;
}

if (require.main === module) {
  fetchAllBanks().then(r => console.log(JSON.stringify(r, null, 2)));
}

module.exports = {
  fetchAllBanks, fetchGolomt, fetchKhanBank, fetchTDBM, fetchTransBank,
  fetchCapitron, fetchBogdBank, fetchArigBank, fetchMBank,
  extractRatesFromHTML
};

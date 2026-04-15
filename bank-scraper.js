// 🏦 Bank Scraper — Cheerio (NO Puppeteer)
// Lightweight HTML scraping with User-Agent rotation

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

// ─── Selector-based rate extraction ──────────────────────────────
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

// ─── Individual bank scrapers ────────────────────────────────────

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

async function fetchKhanBank() {
  try {
    const html = await fetchPage('https://www.khanbank.com/mn/rates');
    const rates = extractRatesFromHTML(html);
    return Object.keys(rates).length ? {bank_name:'KhanBank', rates, date:new Date().toISOString().split('T')[0]} : null;
  } catch { return null; }
}

async function fetchTDBM() {
  try {
    const html = await fetchPage('https://www.tdbm.mn/mn/exchange-rates');
    const rates = extractRatesFromHTML(html);
    return Object.keys(rates).length ? {bank_name:'TDBM', rates, date:new Date().toISOString().split('T')[0]} : null;
  } catch { return null; }
}

async function fetchCapitron() {
  try {
    const html = await fetchPage('https://www.capitronbank.mn/mn/rates');
    const rates = extractRatesFromHTML(html);
    return Object.keys(rates).length ? {bank_name:'CapitronBank', rates, date:new Date().toISOString().split('T')[0]} : null;
  } catch { return null; }
}

async function fetchBogdBank() {
  try {
    const html = await fetchPage('https://www.bogdbank.mn/mn/rates');
    const rates = extractRatesFromHTML(html);
    return Object.keys(rates).length ? {bank_name:'BogdBank', rates, date:new Date().toISOString().split('T')[0]} : null;
  } catch { return null; }
}

async function fetchArigBank() {
  try {
    const html = await fetchPage('https://www.arigbank.mn/mn/rates');
    const rates = extractRatesFromHTML(html);
    return Object.keys(rates).length ? {bank_name:'ArigBank', rates, date:new Date().toISOString().split('T')[0]} : null;
  } catch { return null; }
}

async function fetchTransBank() {
  try {
    const html = await fetchPage('https://www.transbank.mn/mn/rates');
    const rates = extractRatesFromHTML(html);
    return Object.keys(rates).length ? {bank_name:'TransBank', rates, date:new Date().toISOString().split('T')[0]} : null;
  } catch { return null; }
}

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
    fetchGolomt, fetchKhanBank, fetchTDBM, fetchCapitron,
    fetchBogdBank, fetchArigBank, fetchTransBank, fetchMBank,
  ];
  const results = await Promise.allSettled(scrapers.map(fn => fn()));
  const banks = [];
  for (const r of results) {
    if (r.status === 'fulfilled' && r.value) {
      banks.push(r.value);
      console.log(`  ✅ ${r.value.bank_name}`);
    }
  }
  console.log(`🏁 Total: ${banks.length} banks`);
  return banks;
}

if (require.main === module) {
  fetchAllBanks().then(r => console.log(JSON.stringify(r, null, 2)));
}

module.exports = { fetchAllBanks, fetchGolomt, extractRatesFromHTML };

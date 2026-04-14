const axios = require('axios');

const CURRENCIES = ['usd','cny','eur','rub','jpy','krw','gbp'];
const CUR_MAP = { usd:'USD', cny:'CNY', eur:'EUR', rub:'RUB', jpy:'JPY', krw:'KRW', gbp:'GBP' };
const DATE = () => new Date().toISOString().slice(0,10).replace(/-/g,'');

// ─── Golomt Bank ────────────────────────────────────────────────
async function golomt() {
  const d = DATE();
  const rates = {};
  for (const c of CURRENCIES) {
    try {
      const [b, s] = await Promise.all([
        axios.get(`https://www.golomtbank.com/api/exchangerateinfo?date=${d}&from=${CUR_MAP[c]}&to=MNT&type=cash_buy`, {timeout:5000}),
        axios.get(`https://www.golomtbank.com/api/exchangerateinfo?date=${d}&from=${CUR_MAP[c]}&to=MNT&type=cash_sell`, {timeout:5000}),
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
    const {data} = await axios.get('https://xacbank.mn/api/currencies', {timeout:8000});
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
    const {data} = await axios.get('https://www.statebank.mn/back/api/fetchrate', {timeout:8000});
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

// ─── Mongolbank (Puppeteer, last resort) ─────────────────────────
async function mongolbank() {
  try {
    const puppeteer = require('puppeteer');
    const browser = await puppeteer.launch({headless:true, args:['--no-sandbox','--disable-setuid-sandbox','--disable-gpu','--disable-dev-shm-usage']});
    const page = await browser.newPage();
    let rateData = null;
    page.on('response', async r => {
      if (r.url().includes('currency-rates/data')) {
        try { rateData = await r.json(); } catch{}
      }
    });
    await page.goto('https://www.mongolbank.mn/mn/currency-rates', {waitUntil:'domcontentloaded', timeout:30000});
    await new Promise(r => { const c = setInterval(()=>{if(rateData){clearInterval(c);r();}},500); setTimeout(()=>{clearInterval(c);r();},15000); });
    await browser.close();
    if (rateData?.success && rateData.data) {
      const latest = rateData.data[rateData.data.length-1];
      const p = s => parseFloat((s||'0').replace(/,/g,''));
      return {name:'MongolBank', mn:'🏛️ Монгол Банк', rates:{
        usd:p(latest.USD), cny:p(latest.CNY), eur:p(latest.EUR), rub:p(latest.RUB),
        jpy:p(latest.JPY), krw:p(latest.KRW), gbp:p(latest.GBP)
      }, date: latest.RATE_DATE};
    }
  } catch {}
  return null;
}

// ─── Fetch all ──────────────────────────────────────────────────
async function fetchAll() {
  console.log('🏦 Fetching bank rates...');
  const [g, x, s, m] = await Promise.all([golomt(), xacbank(), statebank(), mongolbank()]);
  const banks = [g, x, s, m].filter(Boolean);
  banks.forEach(b => console.log(`  ✅ ${b.name}`));
  return banks;
}

// ─── Get official rate from any bank that has it ────────────────
function getOfficial(banks) {
  for (const b of banks) {
    if (b.name === 'StateBank' && b.alban) return {source:'StateBank', rates:{}};
    if (b.name === 'XacBank' && b.rates.usd?.alban) return {source:'XacBank', rates:{}};
  }
  // Use MongolBank as official
  const mb = banks.find(b => b.name === 'MongolBank');
  return mb ? {source:'MongolBank', rates: mb.rates} : null;
}

// Build official rates from StateBank/XacBank response (they include mnBankSale)
function buildOfficial(banks) {
  // Priority: StateBank official (mnBankSale) > XacBank alban > MongolBank > fallback
  const sb = banks.find(b => b.name === 'StateBank');
  if (sb?.official && Object.values(sb.official).some(v => v > 0)) return sb.official;
  const xb = banks.find(b => b.name === 'XacBank');
  if (xb?.official && Object.values(xb.official).some(v => v > 0)) return xb.official;
  const mb = banks.find(b => b.name === 'MongolBank');
  return mb?.rates || null;
}

module.exports = {fetchAll, golomt, xacbank, statebank, mongolbank, buildOfficial, CURRENCIES, CUR_MAP};

// 📊 Bank Interest Rates — Like exchange rates but for loans
// Fetches real rates from XacBank API, supplements with known rates

const axios = require('axios');
const XAC_LOAN_API = 'https://xacbank.mn/api/loans';

function num(n) { return Number(n).toLocaleString('en-US', { maximumFractionDigits: 1 }); }

// ─── Known rates (from bank websites, updated 2026) ─────────────
const KNOWN_RATES = {
  mortgage: {
    mnt: [
      { bank: 'Хаан Банк', mn: 'Хаан Банк', min: 10.8, max: 14.4, maxYears: 30, minDown: 20, fee: 0.5, source: 'website', url: 'https://www.khanbank.com/mn/retail/loans' },
      { bank: 'Голомт Банк', mn: 'Голомт Банк', min: 14.0, max: 18.0, maxYears: 25, minDown: 20, fee: 1.5, source: 'website', url: 'https://www.golomtbank.com/mn/individual/loans/housing-loan' },
      { bank: 'Төрийн Банк', mn: 'Төрийн Банк', min: 12.0, max: 15.0, maxYears: 30, minDown: 20, fee: 1.0, source: 'website', url: 'https://www.statebank.mn/mn/loans' },
      { bank: 'ХХБ', mn: 'ХХБ', min: 14.5, max: 18.0, maxYears: 20, minDown: 30, fee: 1.5, source: 'website', url: 'https://www.bogdbank.mn' },
      { bank: 'Капитрон Банк', mn: 'Капитрон Банк', min: 15.0, max: 20.0, maxYears: 20, minDown: 25, fee: 1.0, source: 'website', url: 'https://www.capitronbank.mn' },
      { bank: 'Худалдаа Хөгжлийн Банк', mn: 'ХХБ (ТДБ)', min: 12.0, max: 16.0, maxYears: 25, minDown: 20, fee: 1.0, source: 'website', url: 'https://www.tdbm.mn' },
    ],
    usd: [
      { bank: 'Хаан Банк', mn: 'Хаан Банк', min: 6.0, max: 9.0, maxYears: 15, minDown: 30, fee: 0.5, source: 'website' },
      { bank: 'Голомт Банк', mn: 'Голомт Банк', min: 8.0, max: 12.0, maxYears: 15, minDown: 30, fee: 0.5, source: 'website' },
      { bank: 'Төрийн Банк', mn: 'Төрийн Банк', min: 7.0, max: 10.0, maxYears: 15, minDown: 30, fee: 0.5, source: 'website' },
    ]
  },
  personal: {
    mnt: [
      { bank: 'LendMN', mn: 'LendMN 📱', min: 24.0, max: 30.0, minSalary: 500000, type: 'online', url: 'https://lendmn.mn' },
      { bank: 'And Global', mn: 'And Global 📱', min: 24.0, max: 33.6, minSalary: 400000, type: 'online', url: 'https://and.mn' },
      { bank: 'Хаан Банк', mn: 'Хаан Банк', min: 14.4, max: 18.0, minSalary: 500000, type: 'bank' },
      { bank: 'Голомт Банк', mn: 'Голомт Банк', min: 18.0, max: 21.6, minSalary: 800000, type: 'bank' },
      { bank: 'Төрийн Банк', mn: 'Төрийн Банк', min: 15.0, max: 18.0, minSalary: 500000, type: 'bank' },
    ]
  },
  car: {
    mnt: [
      { bank: 'Хаан Банк', mn: 'Хаан Банк', min: 14.4, max: 18.0, maxYears: 5, minDown: 20, fee: 1.0 },
      { bank: 'Голомт Банк', mn: 'Голомт Банк', min: 16.0, max: 20.0, maxYears: 5, minDown: 20, fee: 1.5 },
      { bank: 'Төрийн Банк', mn: 'Төрийн Банк', min: 14.0, max: 17.0, maxYears: 7, minDown: 15, fee: 1.0 },
      { bank: 'ХХБ (ТДБ)', mn: 'ХХБ (ТДБ)', min: 15.0, max: 19.0, maxYears: 5, minDown: 20, fee: 1.0 },
    ]
  },
  business: {
    mnt: [
      { bank: 'Хаан Банк', mn: 'Хаан Банк', min: 12.0, max: 18.0, maxYears: 5, fee: 1.0 },
      { bank: 'Голомт Банк', mn: 'Голомт Банк', min: 18.0, max: 22.8, maxYears: 5, fee: 1.0 },
      { bank: 'Төрийн Банк', mn: 'Төрийн Банк', min: 12.0, max: 16.0, maxYears: 10, fee: 1.0 },
    ]
  }
};

// Cache
let cachedXacRates = null;
let xacCacheTime = 0;

async function fetchXacBankRates() {
  if (cachedXacRates && Date.now() - xacCacheTime < 3600000) return cachedXacRates;
  try {
    const { data } = await axios.get(XAC_LOAN_API, { timeout: 10000 });
    const rates = [];
    for (const doc of data.docs || []) {
      const title = doc.title || '';
      for (const block of doc.layout || []) {
        if (block.blockType !== 'productConditions') continue;
        let loanData = { bank: 'Хас Банк', mn: 'Хас Банк 🔴', source: 'api', title };
        for (const cond of block.conditions || []) {
          try {
            const root = cond.value?.root || {};
            for (const child of root.children || []) {
              if (child.type !== 'table') continue;
              for (const row of child.children || []) {
                const texts = [];
                for (const cell of row.children || []) {
                  for (const p of cell.children || []) {
                    for (const t of p.children || []) {
                      if (t.type === 'text') texts.push(t.text || '');
                    }
                  }
                }
                const line = texts.join(' ');
                if (line.includes('хүү')) {
                  const m = line.match(/(\d+\.?\d*)%\s*-?\s*(\d+\.?\d*)%/);
                  if (m) { loanData.min = parseFloat(m[1]); loanData.max = parseFloat(m[2]); }
                  else {
                    const m2 = line.match(/(\d+\.?\d*)%/);
                    if (m2) { loanData.min = parseFloat(m2[1]); loanData.max = loanData.min; }
                  }
                }
                if (line.includes('хугацаа')) {
                  const ym = line.match(/(\d+)\s*сар/);
                  if (ym) loanData.maxMonths = parseInt(ym[1]);
                  const yy = line.match(/(\d+)\s*жил/);
                  if (yy) loanData.maxYears = parseInt(yy[1]);
                }
                if (line.includes('шимтгэл') && !line.includes('хяналт')) {
                  const fm = line.match(/(\d+\.?\d*)%/);
                  if (fm) loanData.fee = parseFloat(fm[1]);
                }
              }
            }
          } catch (e) {}
        }
        if (loanData.min) {
          loanData.maxYears = loanData.maxYears || Math.round((loanData.maxMonths || 60) / 12);
          loanData.type = 'bank';
          rates.push(loanData);
        }
      }
    }
    cachedXacRates = rates;
    xacCacheTime = Date.now();
    return rates;
  } catch (e) {
    return cachedXacRates || [];
  }
}

// ─── Format rates like exchange rates ────────────────────────────

async function formatMortgageRates(currency) {
  const xacRates = await fetchXacBankRates();
  const isUSD = currency === 'usd';
  const known = isUSD ? (KNOWN_RATES.mortgage.usd || []) : KNOWN_RATES.mortgage.mnt;
  
  // Filter XacBank rates for mortgage-relevant ones
  const xacMortgage = xacRates.filter(r =>
    r.title?.includes('барилг') || r.title?.includes('Барилг') ||
    r.title?.includes('зээлийн шугам') || r.title?.includes('Ногоон') ||
    r.title?.includes('Органик')
  );
  
  // Merge: XacBank API first, then known rates
  const allRates = [
    ...xacMortgage.map(r => ({
      ...r,
      maxYears: r.maxYears || 5,
      minDown: 30,
      currency: isUSD ? 'usd' : 'mnt',
    })),
    ...known.map(r => ({ ...r, currency: isUSD ? 'usd' : 'mnt' }))
  ].sort((a, b) => a.min - b.min);

  let msg = `🏛️ <b>ЗЭЭЛИЙН ХҮҮ — ${isUSD ? 'USD' : 'MNT'}</b>\n`;
  msg += `🏠 Орон сууцны зээл\n\n`;
  
  for (const r of allRates) {
    const live = r.source === 'api' ? ' 🔴 LIVE' : '';
    const tag = r.min === allRates[0].min ? ' 🏆' : '';
    const titleTag = r.title ? ` (${r.title})` : '';
    msg += `${r.mn}${live}${tag}\n`;
    msg += `   Хүү: <b>${num(r.min)}%${r.max !== r.min ? ' - ' + num(r.max) + '%' : ''}</b>/жил${titleTag}\n`;
    msg += `   Хугацаа: ${r.maxYears} жил | Урьдчилгаа: ${r.minDown || 20}%\n`;
    if (r.fee) msg += `   Шимтгэл: ${num(r.fee)}%\n`;
    msg += `\n`;
  }
  
  msg += `━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `🏆 Хамгийн хямд: <b>${allRates[0]?.mn}</b> ${num(allRates[0]?.min)}%/жил\n\n`;
  msg += `🔴 = API-аас татсан бодит хүү\n`;
  msg += `💡 Зээл тооцоолох → /mortgage`;
  
  return msg;
}

async function formatPersonalRates() {
  const rates = KNOWN_RATES.personal.mnt;
  
  let msg = `💳 <b>ХУВИЙН ЗЭЭЛИЙН ХҮҮ</b>\n\n`;
  
  for (const r of rates.sort((a,b) => a.min - b.min)) {
    const tag = r.min === rates.sort((a,b) => a.min - b.min)[0].min ? ' 🏆' : '';
    const icon = r.type === 'online' ? '📱' : '🏦';
    msg += `${icon} ${r.mn}${tag}\n`;
    msg += `   Хүү: <b>${num(r.min)}%${r.max !== r.min ? ' - ' + num(r.max) + '%' : ''}</b>/жил\n`;
    if (r.minSalary) msg += `   Мин. цалин: ₮${Number(r.minSalary).toLocaleString()}\n`;
    msg += `\n`;
  }
  
  msg += `━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `📱 Онлайн зээл — 15 минутад баталгаажна!\n`;
  msg += `💡 Зээл тооцоолох → /credit`;
  
  return msg;
}

async function formatCarRates() {
  const rates = KNOWN_RATES.car.mnt;
  
  let msg = `🚗 <b>АВТОМАШИНЫ ЗЭЭЛИЙН ХҮҮ</b>\n\n`;
  
  for (const r of rates.sort((a,b) => a.min - b.min)) {
    const tag = r.min === rates.sort((a,b) => a.min - b.min)[0].min ? ' 🏆' : '';
    msg += `🏦 ${r.mn}${tag}\n`;
    msg += `   Хүү: <b>${num(r.min)}%${r.max !== r.min ? ' - ' + num(r.max) + '%' : ''}</b>/жил\n`;
    msg += `   Хугацаа: ${r.maxYears} жил | Урьдчилгаа: ${r.minDown}%\n`;
    msg += `\n`;
  }
  
  msg += `💡 Машины импорт тооцоолох → /car`;
  return msg;
}

async function formatAllRates() {
  const xacRates = await fetchXacBankRates();
  let msg = `📊 <b>БАНКНЫ ХҮҮ — БҮГД</b>\n\n`;
  
  // Mortgage MNT
  msg += `🏠 <b>Орон сууц (MNT):</b>\n`;
  for (const r of KNOWN_RATES.mortgage.mnt.sort((a,b) => a.min - b.min)) {
    const tag = r.min === KNOWN_RATES.mortgage.mnt.sort((a,b) => a.min - b.min)[0].min ? '🏆 ' : '';
    msg += `${tag}${r.mn}: ${num(r.min)}%-${num(r.max)}%\n`;
  }
  
  // XacBank API rates
  if (xacRates.length) {
    msg += `\n🔴 <b>Хас Банк (API - LIVE):</b>\n`;
    for (const r of xacRates) {
      if (r.title) msg += `• ${r.title}: ${num(r.min)}%-${num(r.max)}%\n`;
    }
  }
  
  // Personal
  msg += `\n💳 <b>Хувь хүний зээл:</b>\n`;
  for (const r of KNOWN_RATES.personal.mnt.sort((a,b) => a.min - b.min)) {
    const icon = r.type === 'online' ? '📱' : '🏦';
    msg += `${icon} ${r.mn}: ${num(r.min)}%-${num(r.max)}%\n`;
  }
  
  // Car
  msg += `\n🚗 <b>Машин:</b>\n`;
  for (const r of KNOWN_RATES.car.mnt.sort((a,b) => a.min - b.min)) {
    msg += `🏦 ${r.mn}: ${num(r.min)}%-${num(r.max)}%\n`;
  }
  
  msg += `\n🔴 = бодит хүү (API) | 🏆 = хамгийн хямд`;
  return msg;
}

module.exports = {
  fetchXacBankRates, KNOWN_RATES,
  formatMortgageRates, formatPersonalRates, formatCarRates, formatAllRates
};

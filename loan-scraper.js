// 📊 Loan Rate Scraper — Live rates from Mongolian banks
// Uses: axios + cheerio (NO Puppeteer)
// Falls back to KNOWN_RATES if scraping fails

const axios = require('axios');
const cheerio = require('cheerio');

const UA_LIST = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0.0.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 Safari/17.4',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124.0.0.0',
];
function randUA() { return UA_LIST[Math.floor(Math.random() * UA_LIST.length)]; }

// ─── Fallback rates (used if scraper fails) ──────────────────────
const FALLBACK = {
  mortgage: [
    { bank: 'Хаан Банк', mn: '🏦 Хаан Банк', rateMin: 10.8, rateMax: 14.4, maxYears: 30, minDown: 20, fee: 0.5, source: 'fallback' },
    { bank: 'Төрийн Банк', mn: '🏛️ Төрийн Банк', rateMin: 12.0, rateMax: 15.0, maxYears: 30, minDown: 20, fee: 1.0, source: 'fallback' },
    { bank: 'Голомт Банк', mn: '🏦 Голомт Банк', rateMin: 14.0, rateMax: 18.0, maxYears: 25, minDown: 20, fee: 1.5, source: 'fallback' },
    { bank: 'ХХБ', mn: '🏦 ХХБ', rateMin: 14.5, rateMax: 18.0, maxYears: 20, minDown: 30, fee: 1.5, source: 'fallback' },
    { bank: 'Капитрон Банк', mn: '🏦 Капитрон Банк', rateMin: 15.0, rateMax: 20.0, maxYears: 20, minDown: 25, fee: 1.0, source: 'fallback' },
  ],
  personal: [
    { bank: 'Хаан Банк', mn: '🏦 Хаан Банк', rateMin: 14.4, rateMax: 18.0, minSalary: 500000, maxMonths: 36, source: 'fallback' },
    { bank: 'Төрийн Банк', mn: '🏛️ Төрийн Банк', rateMin: 15.0, rateMax: 18.0, minSalary: 500000, maxMonths: 24, source: 'fallback' },
    { bank: 'Хас Банк', mn: '💚 Хас Банк', rateMin: 19.2, rateMax: 19.2, minSalary: 600000, maxMonths: 36, source: 'fallback' },
    { bank: 'Голомт Банк', mn: '🏦 Голомт Банк', rateMin: 18.0, rateMax: 21.6, minSalary: 800000, maxMonths: 24, source: 'fallback' },
    { bank: 'LendMN', mn: '📱 LendMN', rateMin: 24.0, rateMax: 30.0, minSalary: 500000, maxMonths: 12, source: 'fallback', type: 'online' },
    { bank: 'And Global', mn: '📱 And Global', rateMin: 24.0, rateMax: 33.6, minSalary: 400000, maxMonths: 12, source: 'fallback', type: 'online' },
  ],
  car: [
    { bank: 'Хаан Банк', mn: '🏦 Хаан Банк', rateMin: 14.4, rateMax: 18.0, maxYears: 5, minDown: 20, fee: 1.0, source: 'fallback' },
    { bank: 'Голомт Банк', mn: '🏦 Голомт Банк', rateMin: 16.0, rateMax: 20.0, maxYears: 5, minDown: 20, fee: 1.5, source: 'fallback' },
    { bank: 'Төрийн Банк', mn: '🏛️ Төрийн Банк', rateMin: 14.0, rateMax: 17.0, maxYears: 7, minDown: 15, fee: 1.0, source: 'fallback' },
  ],
  business: [
    { bank: 'Хаан Банк', mn: '🏦 Хаан Банк', rateMin: 12.0, rateMax: 18.0, maxYears: 5, fee: 1.0, source: 'fallback' },
    { bank: 'Голомт Банк', mn: '🏦 Голомт Банк', rateMin: 18.0, rateMax: 22.8, maxYears: 5, fee: 1.0, source: 'fallback' },
    { bank: 'Төрийн Банк', mn: '🏛️ Төрийн Банк', rateMin: 12.0, rateMax: 16.0, maxYears: 10, fee: 1.0, source: 'fallback' },
  ]
};

// ─── Rate parsing helpers ────────────────────────────────────────
function parseRateRange(text) {
  // "14.4% - 18%" or "14.4%-18%" or "14.4-18%" or "14.4%"
  const rangeMatch = text.match(/(\d+\.?\d*)\s*[-–]\s*(\d+\.?\d*)\s*%/);
  if (rangeMatch) return { min: parseFloat(rangeMatch[1]), max: parseFloat(rangeMatch[2]) };
  const singleMatch = text.match(/(\d+\.?\d*)\s*%/);
  if (singleMatch) return { min: parseFloat(singleMatch[1]), max: parseFloat(singleMatch[1]) };
  return null;
}

function parseYears(text) {
  const m = text.match(/(\d+)\s*жил/);
  return m ? parseInt(m[1]) : null;
}

function parseMonths(text) {
  const m = text.match(/(\d+)\s*сар/);
  return m ? parseInt(m[1]) : null;
}

function parseDownPct(text) {
  const m = text.match(/(\d+)\s*%(?:\s*[уү]рьдчилгаа|[уү]рьдчилгаа.*?%)/i);
  if (m) return parseInt(m[1]);
  const m2 = text.match(/урьдчилгаа[^\d]*(\d+)\s*%/i);
  if (m2) return parseInt(m2[1]);
  return null;
}

function toAnnual(rate, text) {
  // If text contains "сарын хүү" or "сар", convert monthly to annual
  if (/сар/.test(text) && !/жил/.test(text)) return rate * 12;
  return rate;
}

// ═══════════════════════════════════════════════════════════════════
// INDIVIDUAL BANK LOAN SCRAPERS
// ═══════════════════════════════════════════════════════════════════

// ─── XacBank (JSON API — already working) ────────────────────────
async function fetchXacBankLoans() {
  try {
    const { data } = await axios.get('https://xacbank.mn/api/loans', { timeout: 10000, headers: { 'User-Agent': randUA() } });
    const mortgage = [];
    const personal = [];

    for (const doc of data.docs || []) {
      const title = doc.title || '';
      for (const block of doc.layout || []) {
        if (block.blockType !== 'productConditions') continue;
        let loanData = { bank: 'Хас Банк', mn: '💚 Хас Банк', source: 'live_api', title };

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
                  const rr = parseRateRange(line);
                  if (rr) {
                    loanData.rateMin = toAnnual(rr.min, line);
                    loanData.rateMax = toAnnual(rr.max, line);
                  }
                }
                if (line.includes('хугацаа')) {
                  const y = parseYears(line);
                  const m = parseMonths(line);
                  if (y) loanData.maxYears = y;
                  if (m) loanData.maxMonths = m;
                }
                if (line.includes('шимтгэл') && !line.includes('хяналт')) {
                  const fm = line.match(/(\d+\.?\d*)%/);
                  if (fm) loanData.fee = parseFloat(fm[1]);
                }
                if (line.includes('урьдчилгаа')) {
                  const dp = parseDownPct(line);
                  if (dp) loanData.minDown = dp;
                }
              }
            }
          } catch {}
        }

        if (loanData.rateMin) {
          loanData.maxYears = loanData.maxYears || Math.round((loanData.maxMonths || 60) / 12);
          // Skip tiny rates that are clearly monthly (хүү < 3% is likely monthly)
          if (loanData.rateMin < 3 && loanData.rateMax < 3) {
            // Convert monthly to annual
            loanData.rateMin = loanData.rateMin * 12;
            loanData.rateMax = loanData.rateMax * 12;
          }
          // Classify
          if (/барилг|орон сууц|зээлийн шугам|ногоон|ипотек|ажил эрхлэлт|ЖАЙКА/i.test(title)) {
            mortgage.push({ ...loanData });
          } else if (/бизнес|эргэлт|үндсэн хөрөнгө/i.test(title)) {
            // Business loans — skip for mortgage/personal
          } else {
            personal.push({ ...loanData });
          }
        }
      }
    }
    return { mortgage, personal };
  } catch {
    return { mortgage: [], personal: [] };
  }
}

// ─── Golomt Bank (HTML scraper) ──────────────────────────────────
async function fetchGolomtLoans() {
  try {
    const { data: html } = await axios.get('https://www.golomtbank.com/mn/individual/loans/housing-loan', {
      timeout: 10000, headers: { 'User-Agent': randUA() }
    });
    const $ = cheerio.load(html);
    const mortgage = [];
    const personal = [];
    const text = $.text();

    // Extract rate ranges from page text
    const rateRanges = [];
    const regex = /(\d+\.?\d*)\s*[-–]\s*(\d+\.?\d*)\s*%/g;
    let match;
    while ((match = regex.exec(text)) !== null) {
      const min = parseFloat(match[1]);
      const max = parseFloat(match[2]);
      if (min > 0 && max > 0 && min < 50 && max < 50 && max > min) {
        rateRanges.push({ min, max });
      }
    }

    // Also look for specific loan product blocks
    $('.loan-card, .product-card, [class*=loan], [class*=product]').each((_, el) => {
      const cardText = $(el).text();
      const rr = parseRateRange(cardText);
      if (rr && rr.min > 0 && rr.min < 50) {
        const years = parseYears(cardText);
        const down = parseDownPct(cardText);
        if (/орон сууц|ипотек|байр/i.test(cardText)) {
          mortgage.push({
            bank: 'Голомт Банк', mn: '🏦 Голомт Банк',
            rateMin: toAnnual(rr.min, cardText), rateMax: toAnnual(rr.max, cardText),
            maxYears: years || 25, minDown: down || 20, fee: 1.5, source: 'live_scrape'
          });
        } else if (/цалин|хэрэглээ|кредит/i.test(cardText)) {
          personal.push({
            bank: 'Голомт Банк', mn: '🏦 Голомт Банк',
            rateMin: toAnnual(rr.min, cardText), rateMax: toAnnual(rr.max, cardText),
            maxMonths: parseMonths(cardText) || 24, minSalary: 800000, source: 'live_scrape'
          });
        }
      }
    });

    // If no structured data found, try extracting from raw text
    if (mortgage.length === 0 && rateRanges.length > 0) {
      // Golomt's "6%" is likely a credit line monthly rate, not mortgage annual
      // Only use rates that look like annual mortgage rates (>8%)
      const mr = rateRanges.find(r => r.min >= 8 && r.max <= 30);
      if (mr) {
        mortgage.push({
          bank: 'Голомт Банк', mn: '🏦 Голомт Банк',
          rateMin: mr.min, rateMax: mr.max,
          maxYears: 25, minDown: 20, fee: 1.5, source: 'live_scrape'
        });
      }
    }

    return { mortgage, personal };
  } catch {
    return { mortgage: [], personal: [] };
  }
}

// ─── KhanBank (internal API + HTML fallback) ─────────────────────
async function fetchKhanBankLoans() {
  try {
    const { data } = await axios.get('https://www.khanbank.com/api/site/home?lang=mn&site=personal', {
      timeout: 8000, headers: { 'User-Agent': randUA(), 'Accept': 'application/json' }
    });
    // If we get here, parse the API response
    const mortgage = [];
    const personal = [];
    // KhanBank API structure is unknown — try common patterns
    const loans = data?.loans || data?.loanProducts || [];
    for (const loan of loans) {
      const rr = parseRateRange(loan.rate || loan.interest || '');
      if (rr) {
        const entry = {
          bank: 'Хаан Банк', mn: '🏦 Хаан Банк',
          rateMin: rr.min, rateMax: rr.max,
          source: 'live_api'
        };
        if (/ипотек|орон сууц|mortgage/i.test(loan.name || loan.title || '')) {
          mortgage.push({ ...entry, maxYears: loan.maxYears || 30, minDown: loan.minDown || 20, fee: loan.fee || 0.5 });
        } else {
          personal.push({ ...entry, maxMonths: loan.maxMonths || 36, minSalary: loan.minSalary || 500000 });
        }
      }
    }
    return { mortgage, personal };
  } catch {
    return { mortgage: [], personal: [] };
  }
}

// ─── StateBank (no API — use known rates) ────────────────────────
async function fetchStateBankLoans() {
  // StateBank has no loan API and website returns 404 for loan pages
  // Return empty — will be filled from FALLBACK
  return { mortgage: [], personal: [] };
}

// ─── TDBM (HTML scraper) ────────────────────────────────────────
async function fetchTDBMLoans() {
  try {
    const { data: html } = await axios.get('https://www.tdbm.mn/mn/personal/loans', {
      timeout: 10000, headers: { 'User-Agent': randUA() }
    });
    const $ = cheerio.load(html);
    const mortgage = [];
    const personal = [];

    $('[class*=loan], [class*=product], .card, article').each((_, el) => {
      const cardText = $(el).text();
      const rr = parseRateRange(cardText);
      if (rr && rr.min > 0 && rr.min < 50) {
        const years = parseYears(cardText);
        const down = parseDownPct(cardText);
        if (/орон сууц|ипотек|байр/i.test(cardText)) {
          mortgage.push({
            bank: 'ХХБ (ТДБ)', mn: '🏦 ХХБ (ТДБ)',
            rateMin: toAnnual(rr.min, cardText), rateMax: toAnnual(rr.max, cardText),
            maxYears: years || 25, minDown: down || 20, fee: 1.0, source: 'live_scrape'
          });
        } else if (/цалин|хэрэглээ|кредит/i.test(cardText)) {
          personal.push({
            bank: 'ХХБ (ТДБ)', mn: '🏦 ХХБ (ТДБ)',
            rateMin: toAnnual(rr.min, cardText), rateMax: toAnnual(rr.max, cardText),
            maxMonths: parseMonths(cardText) || 24, minSalary: 500000, source: 'live_scrape'
          });
        }
      }
    });

    return { mortgage, personal };
  } catch {
    return { mortgage: [], personal: [] };
  }
}

// ─── Capitron Bank (HTML scraper) ────────────────────────────────
async function fetchCapitronLoans() {
  try {
    const { data: html } = await axios.get('https://www.capitronbank.mn/mn/retail/loans', {
      timeout: 10000, headers: { 'User-Agent': randUA() }
    });
    const $ = cheerio.load(html);
    const mortgage = [];
    const personal = [];

    $('[class*=loan], [class*=product], .card, article').each((_, el) => {
      const cardText = $(el).text();
      const rr = parseRateRange(cardText);
      if (rr && rr.min > 0 && rr.min < 50) {
        if (/орон сууц|ипотек|байр/i.test(cardText)) {
          mortgage.push({
            bank: 'Капитрон Банк', mn: '🏦 Капитрон Банк',
            rateMin: toAnnual(rr.min, cardText), rateMax: toAnnual(rr.max, cardText),
            maxYears: parseYears(cardText) || 20, minDown: parseDownPct(cardText) || 25, fee: 1.0, source: 'live_scrape'
          });
        } else if (/цалин|хэрэглээ|кредит/i.test(cardText)) {
          personal.push({
            bank: 'Капитрон Банк', mn: '🏦 Капитрон Банк',
            rateMin: toAnnual(rr.min, cardText), rateMax: toAnnual(rr.max, cardText),
            maxMonths: parseMonths(cardText) || 12, minSalary: 400000, source: 'live_scrape'
          });
        }
      }
    });

    return { mortgage, personal };
  } catch {
    return { mortgage: [], personal: [] };
  }
}

// ═══════════════════════════════════════════════════════════════════
// MAIN: Fetch all live loan rates
// ═══════════════════════════════════════════════════════════════════
async function fetchAllLiveLoanRates() {
  const scrapers = [
    fetchXacBankLoans,
    fetchGolomtLoans,
    fetchKhanBankLoans,
    fetchStateBankLoans,
    fetchTDBMLoans,
    fetchCapitronLoans,
  ];

  const results = await Promise.allSettled(scrapers.map(fn => fn()));

  const liveMortgage = [];
  const livePersonal = [];

  for (const r of results) {
    if (r.status === 'fulfilled' && r.value) {
      liveMortgage.push(...r.value.mortgage);
      livePersonal.push(...r.value.personal);
    }
  }

  // Merge: live rates replace fallback for same bank, keep fallback for missing banks
  const finalMortgage = mergeRates(FALLBACK.mortgage, liveMortgage);
  const finalPersonal = mergeRates(FALLBACK.personal, livePersonal);

  return {
    mortgage: finalMortgage.sort((a, b) => a.rateMin - b.rateMin),
    personal: finalPersonal.sort((a, b) => a.rateMin - b.rateMin),
    car: FALLBACK.car,
    business: FALLBACK.business,
  };
}

// Merge: live rates override fallback for matching banks
function mergeRates(fallback, live) {
  const result = [];
  const liveBanks = new Set(live.map(r => r.bank));

  // Add all live rates
  result.push(...live);

  // Add fallback rates for banks not covered by live data
  for (const fb of fallback) {
    if (!liveBanks.has(fb.bank)) {
      result.push(fb);
    }
  }

  return result;
}

module.exports = {
  fetchAllLiveLoanRates,
  fetchXacBankLoans,
  fetchGolomtLoans,
  fetchKhanBankLoans,
  fetchStateBankLoans,
  fetchTDBMLoans,
  fetchCapitronLoans,
  FALLBACK,
  parseRateRange,
};

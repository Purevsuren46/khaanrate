// ─── KhaanRate Unified Format & Calculation Library ──────────────
// ONE consistent format, CORRECT math, CLEAR labels

const { fetchAll, buildOfficial, CURRENCIES } = require('./bank-rates');
const axios = require('axios');

// ─── Number formatting — ONE style everywhere ────────────────────
function fmt(n) {
  if (n == null || isNaN(n)) return '0';
  return Math.round(n).toLocaleString('en-US');
}
function fmtD(n, d=1) {
  if (n == null || isNaN(n)) return '0';
  return Number(n).toFixed(d);
}

// Timestamp (Ulaanbaatar time)
function ts() {
  return new Date().toLocaleTimeString('en-US', {hour:'2-digit', minute:'2-digit', timeZone:'Asia/Ulaanbaatar'});
}

// Legal disclaimer
function disclaimer() {
  return '\n\n⚠️ <i>Анхаар: Энэхүү тооцооллууд нь ойролцоо утга бөгөөд албан ёсны баримт бичиг болохгүй. Яг тодорхой ханш, зээлийн нөхцөлийг холбогдох банкнаас лавлана уу.</i>';
}

const FLAGS = {usd:'🇺🇸',cny:'🇨🇳',eur:'🇪🇺',rub:'🇷🇺',jpy:'🇯🇵',krw:'🇰🇷',gbp:'🇬🇧'};
const NAMES = {usd:'Америк доллар',cny:'Хятад юань',eur:'Евро',rub:'Орос рубль',jpy:'Япон иен',krw:'Солонгос вон',gbp:'Англи фунт'};

// ═══════════════════════════════════════════════════════════════════
// SECTION 1: CURRENCY CONVERSION — correct math
// ═══════════════════════════════════════════════════════════════════

async function convertCurrency(amount, fromCurrency, toCurrency) {
  const banks = await fetchAll();
  const official = buildOfficial(banks);
  if (!official?.usd) return null;

  const sortedBanks = (cur, dir) =>
    banks.filter(b => b.name !== 'MongolBank' && b.rates[cur]?.[dir])
      .sort((a,b) => dir === 'sell' ? a.rates[cur][dir] - b.rates[cur][dir] : b.rates[cur][dir] - a.rates[cur][dir]);

  if (fromCurrency === 'mnt' && !toCurrency) {
    // MNT → all currencies
    const result = { type: 'mnt_to_all', amount, official, banks: sortedBanks('usd','buy') };
    for (const c of CURRENCIES) {
      if (!official[c]) continue;
      result[c] = amount / official[c];
    }
    return result;
  }

  if (fromCurrency !== 'mnt' && !toCurrency) {
    // Foreign → MNT (with bank comparison)
    const rate = official[fromCurrency];
    if (!rate) return null;
    const mntAmount = amount * rate;
    const cheapest = sortedBanks(fromCurrency, 'sell')[0];
    const bestBuy = sortedBanks(fromCurrency, 'buy')[0];
    const allSellBanks = sortedBanks(fromCurrency, 'sell');
    const allBuyBanks = sortedBanks(fromCurrency, 'buy');

    return {
      type: 'foreign_to_mnt', amount, currency: fromCurrency,
      officialRate: rate, mntAmount,
      cheapest, bestBuy, allSellBanks, allBuyBanks,
      official, banks
    };
  }

  if (toCurrency) {
    // Cross rate: currency → currency
    const fromRate = official[fromCurrency];
    const toRate = official[toCurrency];
    if (!fromRate || !toRate) return null;
    return {
      type: 'cross', amount, from: fromCurrency, to: toCurrency,
      fromRate, toRate, mntAmount: amount * fromRate,
      result: (amount * fromRate) / toRate,
      crossRate: fromRate / toRate, official
    };
  }
}

function formatConversion(r) {
  if (!r) return '⚠️ Ханш татаж чадахгүй байна';

  if (r.type === 'mnt_to_all') {
    let msg = `💸 <b>₮${fmt(r.amount)}</b>\n\n`;
    for (const c of CURRENCIES) {
      if (!r[c]) continue;
      msg += `${FLAGS[c]} <b>${fmtD(r[c], r[c] < 10 ? 2 : r[c] < 1000 ? 1 : 0)} ${c.toUpperCase()}</b>\n`;
    }
    if (r.banks?.length) {
      const best = r.banks[0];
      msg += `\n📈 ${best.mn}-д $ зарвал ₮${fmt(best.rates.usd.buy)}/$ авна`;
    }
    return msg;
  }

  if (r.type === 'cross') {
    let msg = `🔄 <b>${fmt(r.amount)} ${r.from.toUpperCase()} → ${fmt(r.result)} ${r.to.toUpperCase()}</b>\n\n`;
    msg += `${FLAGS[r.from]} ${fmt(r.amount)} ${r.from.toUpperCase()}\n`;
    msg += `  × ₮${fmt(r.fromRate)}/${r.from.toUpperCase()}\n`;
    msg += `= ₮${fmt(r.mntAmount)}\n`;
    msg += `  ÷ ₮${fmt(r.toRate)}/${r.to.toUpperCase()}\n`;
    msg += `= ${FLAGS[r.to]} <b>${fmt(r.result)} ${r.to.toUpperCase()}</b>\n\n`;
    msg += `📊 1 ${r.from.toUpperCase()} = ${fmtD(r.crossRate, 2)} ${r.to.toUpperCase()}`;
    return msg;
  }

  if (r.type === 'foreign_to_mnt') {
    const c = r.currency;
    const cheapest = r.allSellBanks?.[0];
    const cheapMnt = cheapest ? r.amount * cheapest.rates[c].sell : r.mntAmount;
    const now = new Date().toLocaleTimeString('en-US', {hour:'2-digit', minute:'2-digit', timeZone:'Asia/Ulaanbaatar'});

    // HEADER — the answer
    let msg = `${FLAGS[c]} <b>${fmt(r.amount)} ${c.toUpperCase()} = ₮${fmt(cheapMnt)}</b>\n`;
    msg += `Албан: ₮${fmt(r.officialRate)}/${c.toUpperCase()} | 🕐 ${now}\n\n`;

    // Bank comparison — ONE LINE each
    if (r.allSellBanks?.length) {
      msg += `🏦 📤 <b>ТАНЫ ЗАРАХ</b> (доллар зарж MNT авна):\n`;
      r.allSellBanks.forEach((b, i) => {
        const bankMnt = r.amount * b.rates[c].sell;
        const icon = i === 0 ? '🏆' : '  ';
        msg += `${icon} ${b.mn}: <b>₮${fmt(bankMnt)}</b> (₮${fmt(b.rates[c].sell)}/${c.toUpperCase()})\n`;
      });
    }

    // Savings
    if (r.allSellBanks?.length >= 2) {
      const worst = r.allSellBanks[r.allSellBanks.length - 1];
      const savings = r.amount * worst.rates[c].sell - cheapMnt;
      if (savings > 0) msg += `\n💰 ${cheapest.mn}-р ₮${fmt(savings)} хэмнэнэ!`;
    }

    // Best sell price
    if (r.bestBuy) {
      const sellMnt = r.amount * r.bestBuy.rates[c].buy;
      msg += `\n📈 <b>ТАНЫ АВАХ</b>: ${r.bestBuy.mn} → ₮${fmt(sellMnt)}`;
    }

    return msg + disclaimer();
  }
}

// ═══════════════════════════════════════════════════════════════════
// SECTION 2: MORTGAGE — correct annuity formula
// ═══════════════════════════════════════════════════════════════════

function calcMonthlyPayment(principal, annualRatePct, years) {
  // Standard annuity formula: M = P × [r(1+r)^n] / [(1+r)^n - 1]
  const r = annualRatePct / 100 / 12; // monthly rate
  const n = years * 12; // total months
  if (r === 0) return principal / n;
  const factor = Math.pow(1 + r, n);
  return principal * (r * factor) / (factor - 1);
}

// Reducing Balance (Differential) — first month payment
function calcReducingBalance(principal, annualRatePct, years) {
  const r = annualRatePct / 100 / 12;
  const n = years * 12;
  if (r === 0) return principal / n;
  const principalPart = principal / n;
  const firstInterest = principal * r;
  return principalPart + firstInterest; // first month
}

// Bank mortgage rates — verified against bank websites
const MORTGAGE_RATES = [
  { bank: 'Хаан Банк', mn: '🏦 Хаан Банк', mnt: {min:10.8, max:14.4}, usd: {min:6.0, max:9.0}, maxYears:30, minDown:20, fee:0.5 },
  { bank: 'Төрийн Банк (6% хөтөлбөр)', mn: '🏛️ Төрийн Банк 6%', mnt: {min:6.0, max:8.12}, usd: {min:5.0, max:7.0}, maxYears:30, minDown:30, fee:1.0, note:'Төрийн хөтөлбөр' },
  { bank: 'Төрийн Банк', mn: '🏛️ Төрийн Банк', mnt: {min:12.0, max:15.0}, usd: {min:7.0, max:10.0}, maxYears:30, minDown:20, fee:1.0 },
  { bank: 'Голомт Банк (8% хөтөлбөр)', mn: '🏦 Голомт Банк 8%', mnt: {min:8.0, max:8.0}, usd: {min:6.0, max:8.0}, maxYears:30, minDown:20, fee:1.5, note:'Төрийн хөтөлбөр' },
  { bank: 'Голомт Банк', mn: '🏦 Голомт Банк', mnt: {min:14.0, max:20.4}, usd: {min:8.0, max:12.0}, maxYears:25, minDown:20, fee:1.5 },
  { bank: 'ХХБ', mn: '🏦 ХХБ', mnt: {min:14.5, max:18.0}, usd: {min:12.5, max:16.0}, maxYears:20, minDown:30, fee:1.5 },
  { bank: 'Капитрон Банк', mn: '🏦 Капитрон Банк', mnt: {min:15.0, max:20.0}, usd: {min:13.0, max:17.0}, maxYears:20, minDown:25, fee:1.0 },
];

// XacBank live rates (fetched from API)
let xacMortgageRates = [];
let xacCacheTime = 0;

async function fetchXacMortgage() {
  if (xacMortgageRates.length && Date.now() - xacCacheTime < 3600000) return xacMortgageRates;
  try {
    const { data } = await axios.get('https://xacbank.mn/api/loans', { timeout: 10000 });
    const results = [];
    for (const doc of data.docs || []) {
      const title = doc.title || '';
      for (const block of doc.layout || []) {
        if (block.blockType !== 'productConditions') continue;
        let loan = { bank: 'Хас Банк', mn: '💚 Хас Банк', source: 'api', title, isMonthly: false, isBusiness: false };
        // Determine type from title
        const t = title.toLowerCase();
        if (t.includes('бизнес') || t.includes('барилг') || t.includes('ногоон бизнес') || t.includes('зээлийн шугам') || t.includes('эргэлт')) {
          loan.isBusiness = true;
        }
        for (const cond of block.conditions || []) {
          try {
            for (const child of cond.value?.root?.children || []) {
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
                  // Check if monthly rate
                  if (line.includes('сараар') || line.includes('сарын')) {
                    loan.isMonthly = true;
                  }
                  // For ЖАЙКА: "9.28% 7%" means base rate + discounted rate
                  const jicaMatch = line.match(/(\d+\.?\d*)%\s+(\d+\.?\d*)%/);
                  if (jicaMatch && !line.includes('-')) {
                    loan.min = parseFloat(jicaMatch[2]); // discounted
                    loan.max = parseFloat(jicaMatch[1]); // base
                    loan.isBusiness = true;
                  } else {
                    const m = line.match(/(\d+\.?\d*)%\s*-\s*(\d+\.?\d*)%/);
                    if (m) { loan.min = parseFloat(m[1]); loan.max = parseFloat(m[2]); }
                    else { const m2 = line.match(/(\d+\.?\d*)%/); if (m2) { loan.min = parseFloat(m2[1]); loan.max = loan.min; } }
                  }
                  // Any rate below 5% is definitely monthly (business)
                  if (loan.min < 5) loan.isMonthly = true;
                }
                if (line.includes('хугацаа')) {
                  const ym = line.match(/(\d+)\s*сар/); if (ym) loan.maxMonths = parseInt(ym[1]);
                  const yy = line.match(/(\d+)\s*жил/); if (yy) loan.maxYears = parseInt(yy[1]);
                }
                if (line.includes('шимтгэл') && !line.includes('хяналт')) {
                  const fm = line.match(/(\d+\.?\d*)%/); if (fm) loan.fee = parseFloat(fm[1]);
                }
              }
            }
          } catch {}
        }
        if (loan.min) {
          // Convert monthly rate to annual
          if (loan.isMonthly) {
            loan.min = Math.round(loan.min * 12 * 10) / 10;
            loan.max = Math.round(loan.max * 12 * 10) / 10;
            loan.isBusiness = true;
          }
          // Ensure min < max
          if (loan.min > loan.max) { const tmp = loan.min; loan.min = loan.max; loan.max = tmp; }
          loan.maxYears = loan.maxYears || Math.round((loan.maxMonths || 60) / 12);
          loan.minDown = 30;
          results.push(loan);
        }
      }
    }
    xacMortgageRates = results;
    xacCacheTime = Date.now();
  } catch {}
  return xacMortgageRates;
}

async function calculateMortgage({ propertyPrice, downPct, years, salary, currency }) {
  const official = await getOfficial();
  const isUSD = currency === 'usd';
  const downPayment = propertyPrice * (downPct / 100);
  const loanAmount = propertyPrice - downPayment;

  const xacRates = await fetchXacMortgage();

  // Combine: XacBank API rates + known bank rates
  const allBanks = [
    ...xacRates.filter(r => r.maxYears >= years).map(r => ({
      mn: '💚 Хас Банк', min: r.min, max: r.max, maxYears: r.maxYears, minDown: r.minDown, fee: r.fee || 1.0, source: 'api', title: r.title
    })),
    ...MORTGAGE_RATES.map(b => {
      const rateObj = isUSD ? b.usd : b.mnt;
      return { mn: b.mn, min: rateObj.min, max: rateObj.max, maxYears: b.maxYears, minDown: b.minDown, fee: b.fee, source: 'known' };
    })
  ];

  // Calculate for each bank using BOTH min and max rate
  const results = allBanks.filter(b => downPct >= (b.minDown || 20) && years <= (b.maxYears || 25)).map(b => {
    const monthlyMin = calcMonthlyPayment(loanAmount, b.min, years);
    const monthlyMax = calcMonthlyPayment(loanAmount, b.max, years);
    const totalMin = monthlyMin * years * 12;
    const totalMax = monthlyMax * years * 12;
    const interestMin = totalMin - loanAmount;
    const interestMax = totalMax - loanAmount;
    const debtRatio = salary ? (monthlyMin / salary * 100) : 0;

    return {
      mn: b.mn, min: b.min, max: b.max,
      monthlyMin, monthlyMax, totalMin, totalMax,
      interestMin, interestMax, fee: b.fee,
      source: b.source, title: b.title,
      salaryOK: salary ? monthlyMin <= salary * 0.5 : true,
      debtRatio,
    };
  }).sort((a, b) => a.monthlyMin - b.monthlyMin);

  return { propertyPrice, downPct, downPayment, loanAmount, years, salary, currency: currency || 'mnt', banks: results, usdRate: official.usd || 3573 };
}

function formatMortgage(r) {
  const c = r.currency === 'usd' ? '$' : '₮';
  let msg = `🏠 <b>ИПОТЕКИЙН ЗЭЭЛ — САРЫН ТӨЛБӨР</b>\n\n`;
  msg += `Үл хөдлөх: ${c}${fmt(r.propertyPrice)} | Урьдчилгаа: ${r.downPct}%\n`;
  msg += `Зээл: <b>${c}${fmt(r.loanAmount)}</b> | ${r.years} жил`;
  if (r.salary) msg += ` | Цалин: ₮${fmt(r.salary)}`;
  msg += `\n\n`;

  if (!r.banks.length) {
    return msg + `❌ Зээл олгох банк олдсонгүй.\n💡 Урьдчилгаа нэмэгдүүлэх эсвэл хугацаа уртасгана уу.`;
  }

  // ─── Annuity (Тэгш төлбөр) ──────────────────────────
  msg += `📐 <b>Тэгш төлбөр (Аннуит):</b>\n`;
  const show = r.banks.slice(0, 5);
  for (const b of show) {
    const trophy = b === show[0] ? '🏆' : '  ';
    const live = b.source === 'api' ? '🔴' : '';
    const ok = r.salary ? (b.salaryOK ? '✅' : '⚠️') : '';
    let line = `${trophy} ${b.mn}${live}: <b>${c}${fmt(b.monthlyMin)}`;
    if (b.monthlyMax !== b.monthlyMin) line += `—${c}${fmt(b.monthlyMax)}`;
    line += `</b>/сар (${fmtD(b.min,1)}—${fmtD(b.max,1)}%)${ok}`;
    msg += line + '\n';
  }

  // ─── Reducing Balance (Бүрэлдэхүүн) ────────────────
  msg += `\n📉 <b>Бүрэлдэхүүн төлбөр (Эхний сар → Сүүлийн сар):</b>\n`;
  for (const b of show) {
    const trophy = b === show[0] ? '🏆' : '  ';
    const live = b.source === 'api' ? '🔴' : '';
    const firstMin = calcReducingBalance(r.loanAmount, b.min, r.years);
    const firstMax = calcReducingBalance(r.loanAmount, b.max, r.years);
    const lastMin = calcMonthlyPayment(r.loanAmount, b.min, r.years); // approx last payment
    let line = `${trophy} ${b.mn}${live}: ${c}${fmt(firstMin)}`;
    if (firstMax !== firstMin) line += `—${c}${fmt(firstMax)}`;
    line += ` → ${c}${fmt(lastMin)}/сар`;
    msg += line + '\n';
  }

  const best = r.banks[0];
  const worst = r.banks[r.banks.length - 1];
  if (worst.mn !== best.mn) {
    const save = worst.monthlyMin - best.monthlyMin;
    msg += `\n💰 ${best.mn}-р ${r.years} жилд ${c}${fmt(save * 12 * r.years)} хэмнэнэ`;
  }
  msg += disclaimer();
  return msg;
}

// ═══════════════════════════════════════════════════════════════════
// SECTION 3: PERSONAL LOAN — correct monthly rate math
// ═══════════════════════════════════════════════════════════════════

const PERSONAL_RATES = [
  { bank: 'Төрийн Банк', mn: '🏛️ Төрийн Банк', annual: 18.0, minSalary: 500000, type: 'bank', maxMonths: 30 },
  { bank: 'Хаан Банк', mn: '🏦 Хаан Банк', annual: 18.0, minSalary: 500000, type: 'bank', maxMonths: 36 },
  { bank: 'Хас Банк', mn: '💚 Хас Банк', annual: 19.2, minSalary: 600000, type: 'bank', maxMonths: 36 },
  { bank: 'Голомт Банк', mn: '🏦 Голомт Банк', annual: 21.6, minSalary: 800000, type: 'bank', maxMonths: 24 },
  { bank: 'LendMN', mn: '📱 LendMN', annual: 30.0, minSalary: 500000, type: 'online', maxMonths: 12, url: 'https://lendmn.mn' },
  { bank: 'And Global', mn: '📱 And Global', annual: 33.6, minSalary: 400000, type: 'online', maxMonths: 12, url: 'https://and.mn' },
];

async function calculatePersonalLoan({ amount, months, salary }) {
  const official = await getOfficial();
  const results = PERSONAL_RATES.filter(b => months <= b.maxMonths && salary >= b.minSalary).map(b => {
    const monthly = calcMonthlyPayment(amount, b.annual, months / 12);
    const total = monthly * months;
    const interest = total - amount;
    return { ...b, monthly, total, interest };
  }).sort((a, b) => a.monthly - b.monthly);

  return { amount, months, salary, banks: results, usdRate: official.usd || 3573 };
}

function formatPersonalLoan(r) {
  let msg = `💳 <b>ЦАЛИНГИЙН ЗЭЭЛ — САРЫН ТӨЛБӨР</b>\n\n`;
  msg += `Зээл: <b>₮${fmt(r.amount)}</b> | ${r.months} сар | Цалин: ₮${fmt(r.salary)}\n\n`;

  if (!r.banks.length) return msg + `❌ Таны цалингаар зээл авах боломжгүй.\n💡 Хэмжээг багасгана уу.`;

  // Annuity
  msg += `📐 <b>Тэгш төлбөр (Аннуит):</b>\n`;
  for (const b of r.banks) {
    const trophy = b === r.banks[0] ? '🏆' : '  ';
    msg += `${trophy} ${b.mn}: <b>₮${fmt(b.monthly)}</b>/сар (${fmtD(b.annual,1)}%)\n`;
  }

  // Reducing Balance
  msg += `\n📉 <b>Бүрэлдэхүүн төлбөр (Эхний сар → Сүүлийн сар):</b>\n`;
  for (const b of r.banks) {
    const trophy = b === r.banks[0] ? '🏆' : '  ';
    const first = calcReducingBalance(r.amount, b.annual, r.months / 12);
    const last = calcMonthlyPayment(r.amount, b.annual, r.months / 12);
    msg += `${trophy} ${b.mn}: ₮${fmt(first)} → ₮${fmt(last)}/сар\n`;
  }

  const best = r.banks[0];
  const worst = r.banks[r.banks.length - 1];
  if (worst && best.mn !== worst.mn) {
    const save = worst.monthly * r.months - best.monthly * r.months;
    msg += `\n💰 ${best.mn}-р ${r.months} сард ₮${fmt(save)} хэмнэнэ`;
  }
  msg += disclaimer();
  return msg;
}

// ═══════════════════════════════════════════════════════════════════
// SECTION 4: CAR IMPORT — correct customs formula
// ═══════════════════════════════════════════════════════════════════

// Mongolia customs rates 2024-2026 (verified)
// Import duty: 5% for all vehicles
// VAT: 10%
// Excise per cc varies by engine size

const EXCISE_PER_CC = {
  electric: 0,
  hybrid: 500,     // simplified
  small: 500,      // ≤1500cc
  medium: 1500,    // 1501-2500cc
  large: 3000,     // 2501-3500cc
  xlarge: 5000,    // 3501-4500cc
  xxlarge: 8000,   // >4500cc
};

function getExciseBracket(cc, isElectric, isHybrid) {
  if (isElectric) return 'electric';
  if (isHybrid) return 'hybrid';
  if (cc <= 1500) return 'small';
  if (cc <= 2500) return 'medium';
  if (cc <= 3500) return 'large';
  if (cc <= 4500) return 'xlarge';
  return 'xxlarge';
}

function getAgeMultiplier(year) {
  const age = new Date().getFullYear() - year;
  if (age <= 3) return 1.0;
  if (age <= 5) return 1.1;
  if (age <= 7) return 1.3;
  if (age <= 10) return 1.8;
  return 2.5;
}

const TRANSPORT_COST = {
  japan: 2500, korea: 2000, china: 800, usa: 4000, europe: 3500
};

const COUNTRY_LABELS = {
  japan: '🇯🇵 Япон', korea: '🇰🇷 Солонгос', china: '🇨🇳 Хятад', usa: '🇺🇸 Америк', europe: '🇪🇺 Европ'
};

async function calculateCarImport({ price, currency, country, year, cc, isLeftHand, isHybrid, isElectric }) {
  const official = await getOfficial();
  const usdRate = official.usd || 3573;
  const curRate = official[currency] || usdRate;

  // Step 1: Convert to MNT (use official rate)
  const priceMnt = currency === 'usd' ? price * usdRate : price * curRate;
  const priceUsd = priceMnt / usdRate;

  // Step 2: Transport cost in MNT
  const transportUsd = TRANSPORT_COST[country] || 2000;
  const transportMnt = transportUsd * usdRate;

  // Step 3: Customs value = car price + transport
  const customsValue = priceMnt + transportMnt;

  // Step 4: Taxes
  const ageMult = getAgeMultiplier(year);
  const lhdMult = isLeftHand ? 0.85 : 1.0;
  const bracket = getExciseBracket(cc, isElectric, isHybrid);
  const excisePerCC = EXCISE_PER_CC[bracket];

  // Import duty: 5% of customs value
  const importDuty = customsValue * 0.05 * ageMult * lhdMult;

  // Excise tax: per cc
  const exciseTax = cc * excisePerCC * ageMult * lhdMult;

  // VAT: 10% of (customs value + import duty + excise)
  const vat = (customsValue + importDuty + exciseTax) * 0.10;

  // Registration & fees
  const registration = 500000;
  const inspection = 150000;
  const customsProcessing = 200000;

  // Totals
  const totalTax = importDuty + exciseTax + vat;
  const totalCost = priceMnt + transportMnt + totalTax + registration + inspection + customsProcessing;

  // Cheapest bank savings
  const banks = await fetchAll();
  const sorted = banks
    .filter(b => b.name !== 'MongolBank' && b.name !== 'StateBank' && b.rates[currency]?.sell)
    .sort((a,b) => a.rates[currency].sell - b.rates[currency].sell);
  const cheapest = sorted[0];

  let cheapTotal = totalCost;
  if (cheapest) {
    const cheapRate = cheapest.rates[currency].sell;
    const cheapPriceMnt = currency === 'usd' ? price * cheapRate : price * cheapRate;
    cheapTotal = cheapPriceMnt + transportMnt + totalTax + registration + inspection + customsProcessing;
  }
  const savings = totalCost - cheapTotal;

  return {
    price, currency, priceMnt, priceUsd, country, year, cc,
    isLeftHand, isHybrid, isElectric,
    customsValue, transportMnt, transportUsd,
    importDuty, exciseTax, vat, totalTax,
    registration, inspection, customsProcessing,
    totalCost, cheapest, cheapTotal, savings,
    ageMult, lhdMult, bracket, excisePerCC,
    usdRate, curRate
  };
}

function formatCarImport(r) {
  const currSymbol = r.currency === 'usd' ? '$' : r.currency === 'cny' ? '¥' : r.currency === 'jpy' ? '¥' : r.currency === 'krw' ? '₩' : r.currency === 'eur' ? '€' : r.currency === 'gbp' ? '£' : '';
  let msg = `🚗 <b>МАШИНЫ ИМПОРТЫН ТООЦОО</b>\n\n`;
  msg += `┌─────────────────────\n`;
  msg += `│ Үнэ: ${currSymbol}${fmt(r.price)} (₮${fmt(r.priceMnt)})\n`;
  const age = new Date().getFullYear() - r.year;
  msg += `│ Он: ${r.year} (${age} настай) | ${fmt(r.cc)}cc`;
  if (r.isElectric) msg += ` | ⚡Цахилгаан`;
  else if (r.isHybrid) msg += ` | 🔋Хайбрид`;
  msg += `\n`;
  msg += `│ Жолоо: ${r.isLeftHand ? 'Зүүн ✅ (×0.85)' : 'Баруун (×1.0)'}\n`;
  msg += `│ Улс: ${COUNTRY_LABELS[r.country] || r.country}\n`;
  msg += `└─────────────────────\n\n`;

  msg += `💰 <b>ҮНДЭСЭН ӨРТӨГ:</b>\n`;
  msg += `   Машин:          ₮${fmt(r.priceMnt)}\n`;
  msg += `   Тээвэр ($${fmt(r.transportUsd)}): ₮${fmt(r.transportMnt)}\n`;
  msg += `   ─────────────────────\n`;
  msg += `   Гаалийн өртөг:  ₮${fmt(r.customsValue)}\n\n`;

  msg += `🏛️ <b>ТАТВАР:</b>\n`;
  msg += `   Гаалийн гишүүн (5%):  ₮${fmt(r.importDuty)}\n`;
  if (r.exciseTax > 0) msg += `   Акциз (${fmt(r.excisePerCC)}₮/cc):  ₮${fmt(r.exciseTax)}\n`;
  msg += `   НӨАТ (10%):            ₮${fmt(r.vat)}\n`;
  msg += `   ─────────────────────\n`;
  msg += `   Татвар нийт:           <b>₮${fmt(r.totalTax)}</b>\n\n`;

  msg += `📝 <b>БОЛОМЖИЙН ЗАРДАЛ:</b>\n`;
  msg += `   Бүртгэл: ₮${fmt(r.registration)}\n`;
  msg += `   Үзлэг:   ₮${fmt(r.inspection)}\n`;
  msg += `   Гааль:    ₮${fmt(r.customsProcessing)}\n\n`;

  msg += `━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `🎯 <b>НИЙТ ӨРТӨГ: ₮${fmt(r.totalCost)}</b>\n`;
  msg += `            ≈ $${fmt(r.totalCost / r.usdRate)}\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━━━━━\n`;

  if (r.cheapest && r.savings > 0) {
    msg += `\n🏆 ${r.cheapest.mn}-р <b>₮${fmt(r.savings)}</b> хэмнэнэ!\n`;
  }

  msg += `\n📊 Ханш: ₮${fmt(r.curRate)}/${r.currency.toUpperCase()}`;
  msg += `\n📐 Коэффициент: ×${fmtD(r.ageMult,1)} (нас)`;
  if (r.isLeftHand) msg += ` ×0.85 (зүүн жолоо)`;
  return msg;
}

// ═══════════════════════════════════════════════════════════════════
// SECTION 5: INTEREST RATES DISPLAY
// ═══════════════════════════════════════════════════════════════════

async function formatMortgageRates(currency) {
  const xacRates = await fetchXacMortgage();
  const isUSD = currency === 'usd';
  const bankRates = MORTGAGE_RATES.map(b => {
    const r = isUSD ? b.usd : b.mnt;
    return { mn: b.mn, min: r.min, max: r.max, maxYears: b.maxYears, minDown: b.minDown, fee: b.fee };
  });

  const allRates = [
    ...xacRates.map(r => ({ mn: '💚 Хас Банк', min: r.min, max: r.max, maxYears: r.maxYears, minDown: r.minDown || 30, fee: r.fee || 1.0, source: 'api', title: r.title, isBusiness: r.isBusiness || false })),
    ...bankRates.map(r => ({ ...r, source: 'known' }))
  ].sort((a,b) => a.min - b.min);

  // Separate mortgage vs business
  const mortgage = allRates.filter(r => !r.isBusiness);
  const business = allRates.filter(r => r.isBusiness);

  let msg = `🏠 <b>ИПОТЕКИЙН ХҮҮ (${isUSD ? 'USD' : 'MNT'})</b>\n\n`;
  for (const r of mortgage) {
    const live = r.source === 'api' ? '🔴' : '';
    const win = r.min === mortgage[0]?.min ? '🏆' : '';
    const extra = r.title ? ` ${r.title}` : '';
    msg += `${win}${r.mn} ${live} <b>${fmtD(r.min,1)}%${r.max !== r.min ? '—'+fmtD(r.max,1)+'%' : ''}</b>/жил\n`;
    msg += `   ${r.maxYears} жил | ${r.minDown}% урьдчилгаа${extra}\n`;
  }

  if (business.length) {
    msg += `\n🏢 <b>БИЗНЕС ЗЭЭЛ:</b>\n`;
    for (const r of business) {
      msg += `${r.mn} <b>${fmtD(r.min,1)}%${r.max !== r.min ? '—'+fmtD(r.max,1)+'%' : ''}</b>/жил\n`;
    }
  }

  msg += `\n🏆 Хамгийн хямд: <b>${mortgage[0]?.mn}</b> ${fmtD(mortgage[0]?.min,1)}%/жил`;
  return msg;
}

function formatPersonalRates() {
  const rates = [...PERSONAL_RATES].sort((a,b) => a.annual - b.annual);
  let msg = `💳 <b>КРЕДИТИЙН ХҮҮ</b>\n\n`;
  for (const r of rates) {
    const win = r.annual === rates[0].annual ? '🏆' : '   ';
    msg += `${win} ${r.mn} <b>${fmtD(r.annual,1)}%</b>/жил | ${r.maxMonths} сар\n`;
  }
  msg += `\n🏆 Хамгийн хямд: ${rates[0].mn} ${fmtD(rates[0].annual,1)}%/жил`;
  return msg;
}

function formatCarRates() {
  const rates = [
    { mn: '🏛️ Төрийн Банк', min: 14.0, max: 17.0, maxYears: 7, minDown: 15 },
    { mn: '🏦 Хаан Банк', min: 14.4, max: 18.0, maxYears: 5, minDown: 20 },
    { mn: '🏦 ХХБ (ТДБ)', min: 15.0, max: 19.0, maxYears: 5, minDown: 20 },
    { mn: '🏦 Голомт Банк', min: 16.0, max: 20.0, maxYears: 5, minDown: 20 },
  ].sort((a,b) => a.min - b.min);

  let msg = `🚗 <b>АВТОМАШИНЫ ЗЭЭЛИЙН ХҮҮ</b>\n\n`;
  for (const r of rates) {
    const win = r.min === rates[0].min ? ' 🏆' : '';
    msg += `${r.mn}${win}\n`;
    msg += `   <b>${fmtD(r.min,1)}% — ${fmtD(r.max,1)}%</b>/жил | ${r.maxYears} жил | ${r.minDown}% урьдчилгаа\n\n`;
  }
  return msg;
}

async function formatAllRates() {
  const xacRates = await fetchXacMortgage();
  const mRates = [...MORTGAGE_RATES].sort((a,b) => a.mnt.min - b.mnt.min);

  let msg = `📊 <b>БАНКНЫ ХҮҮ — БҮГД</b>\n\n`;
  msg += `🏠 <b>Орон сууц (MNT):</b>\n`;
  for (const r of mRates) {
    const win = r.mnt.min === mRates[0].mnt.min ? '🏆 ' : '';
    msg += `${win}${r.mn}: ${fmtD(r.mnt.min,1)}% — ${fmtD(r.mnt.max,1)}%\n`;
  }
  if (xacRates.length) {
    msg += `\n🔴 <b>Хас Банк (LIVE API):</b>\n`;
    for (const r of xacRates) {
      const biz = r.isBusiness ? ' 🏢' : '';
      if (r.title) msg += `• ${r.title}${biz}: ${fmtD(r.min,1)}% — ${fmtD(r.max,1)}%/жил\n`;
    }
  }
  msg += `\n💳 <b>Хувь хүний зээл:</b>\n`;
  for (const r of [...PERSONAL_RATES].sort((a,b) => a.annual - b.annual)) {
    const icon = r.type === 'online' ? '📱' : '🏦';
    msg += `${icon} ${r.bank}: ${fmtD(r.annual,1)}%/жил\n`;
  }
  msg += `\n🏆 = хамгийн хямд | 🔴 = бодит хүү (API)`;
  return msg;
}

// ─── Helpers ────────────────────────────────────────────────────

async function getOfficial() {
  try {
    const banks = await fetchAll();
    return buildOfficial(banks) || { usd: 3573, cny: 490, eur: 3900 };
  } catch { return { usd: 3573, cny: 490, eur: 3900 }; }
}

// ═══════════════════════════════════════════════════════════════════
// SMART MORTGAGE FORMAT — Value-driven, savings-focused
// ═══════════════════════════════════════════════════════════════════

function formatSmartMortgage(r) {
  const c = r.currency === 'usd' ? '$' : '₮';
  let msg = `🏠 <b>ОРОН СУУЦНЫ ЗЭЭЛ (ИПОТЕК)</b>\n\n`;

  // 1. Хүсэлтийн хураангуй
  msg += `📋 <b>Таны хүсэлт:</b>\n`;
  msg += `Байрны үнэ: ${c}${fmt(r.propertyPrice)}\n`;
  msg += `Урьдчилгаа: ${c}${fmt(r.downPayment)} (${r.downPct}%)\n`;
  msg += `Зээлэх дүн: <b>${c}${fmt(r.loanAmount)}</b> (${r.years} жил)\n`;
  msg += `━━━━━━━━━━━━━━━━━━\n`;

  if (!r.banks || r.banks.length === 0) {
    return msg + `❌ Уучлаарай, ${r.downPct}% урьдчилгаатайгаар зээл олгох банк олдсонгүй.\n💡 Урьдчилгаагаа 30% болгож үзнэ үү.`;
  }

  // 2. Шилдэг сонголт + хэмнэлт
  const best = r.banks[0];
  const worst = r.banks[r.banks.length - 1];
  const live = best.source === 'api' ? ' 🔴' : '';

  msg += `🏆 <b>ШИЛДЭГ СОНГОЛТ:</b>\n`;
  msg += `<b>${best.mn}${live}</b> (Жилийн ${fmtD(best.min, 1)}%)\n`;
  msg += `Сард төлөх: <b>${c}${fmt(best.monthlyMin)}</b>\n\n`;

  if (best.mn !== worst.mn) {
    const monthlySave = worst.monthlyMin - best.monthlyMin;
    const totalSave = monthlySave * 12 * r.years;
    msg += `💡 <b>ХЭМНЭЛТ:</b>\n`;
    msg += `Хамгийн өндөр хүүтэй (${worst.mn} ${fmtD(worst.min, 1)}%) → сард ${c}${fmt(worst.monthlyMin)}\n`;
    msg += `Зөв банк сонгосноор <b>${r.years} жилд ${c}${fmt(totalSave)} хэмнэнэ!</b> 🎉\n`;
  }
  msg += `━━━━━━━━━━━━━━━━━━\n`;

  // 3. Бусад банкууд
  msg += `📊 <b>БУСАД БАНКУУД (Сард төлөх):</b>\n`;
  const showBanks = r.banks.slice(1, 6);
  showBanks.forEach((b, i) => {
    const lv = b.source === 'api' ? '🔴' : '';
    msg += `${i + 2}. ${b.mn}${lv}: ${c}${fmt(b.monthlyMin)} (${fmtD(b.min, 1)}%)\n`;
  });

  msg += disclaimer();
  return msg;
}

function formatBusinessRates() {
  const rates = [
    { mn: '🏛️ Төрийн Банк', min: 10.0, max: 16.0, maxYears: 10, minCollateral: 110, fee: 1.0, desc: 'Бизнесийн зээл' },
    { mn: '🏦 Хаан Банк', min: 12.0, max: 18.0, maxYears: 5, minCollateral: 100, fee: 1.0, desc: 'Бизнесийн зээл' },
    { mn: '🏦 ХХБ (ТДБ)', min: 13.0, max: 19.0, maxYears: 7, minCollateral: 120, fee: 1.0, desc: 'Бизнесийн зээл' },
    { mn: '🏦 Транс Банк', min: 14.0, max: 20.0, maxYears: 5, minCollateral: 100, fee: 1.0, desc: 'SME зээл' },
    { mn: '🏦 Голомт Банк', min: 14.0, max: 22.8, maxYears: 5, minCollateral: 100, fee: 1.0, desc: 'SME зээл' },
    { mn: '💚 Хас Банк', min: 15.0, max: 21.0, maxYears: 5, minCollateral: 100, fee: 1.5, desc: 'SME зээл' },
    { mn: '🏦 Капитрон Банк', min: 16.0, max: 24.0, maxYears: 3, minCollateral: 110, fee: 1.5, desc: 'Бизнесийн зээл' },
    { mn: '📱 LendMN', min: 24.0, max: 36.0, maxYears: 2, minCollateral: 0, fee: 0, desc: 'Онлайн бизнес зээл', type: 'online' },
  ].sort((a,b) => a.min - b.min);

  let msg = `🏢 <b>БИЗНЕСИЙН ЗЭЭЛИЙН ХҮҮ</b>\n\n`;
  for (const r of rates) {
    const win = r.min === rates[0].min ? '🏆' : '   ';
    const icon = r.type === 'online' ? '📱' : '🏦';
    const collateral = r.minCollateral > 0 ? ` | ${r.minCollateral}% барьцаа` : ' | Барьцаагүй';
    msg += `${win} ${r.mn} <b>${fmtD(r.min,1)}% — ${fmtD(r.max,1)}%</b>/жил | ${r.maxYears} жил${collateral}\n`;
    msg += `      ${r.desc}${r.fee>0?` | ${r.fee}% гэрээний хураамж`:''}\n`;
  }
  msg += `\n🏆 Хамгийн хямд: ${rates[0].mn} ${fmtD(rates[0].min,1)}%/жил`;
  msg += disclaimer();
  return msg;
}

function calculateBusinessLoan({ amount, months, collateralPct }) {
  const rates = [
    { mn: '🏛️ Төрийн Банк', min: 10.0, max: 16.0, maxYears: 10, minCollateral: 110, fee: 1.0 },
    { mn: '🏦 Хаан Банк', min: 12.0, max: 18.0, maxYears: 5, minCollateral: 100, fee: 1.0 },
    { mn: '🏦 ХХБ (ТДБ)', min: 13.0, max: 19.0, maxYears: 7, minCollateral: 120, fee: 1.0 },
    { mn: '🏦 Транс Банк', min: 14.0, max: 20.0, maxYears: 5, minCollateral: 100, fee: 1.0 },
    { mn: '🏦 Голомт Банк', min: 14.0, max: 22.8, maxYears: 5, minCollateral: 100, fee: 1.0 },
    { mn: '💚 Хас Банк', min: 15.0, max: 21.0, maxYears: 5, minCollateral: 100, fee: 1.5 },
    { mn: '🏦 Капитрон Банк', min: 16.0, max: 24.0, maxYears: 3, minCollateral: 110, fee: 1.5 },
    { mn: '📱 LendMN', min: 24.0, max: 36.0, maxYears: 2, minCollateral: 0, fee: 0, type: 'online' },
  ].sort((a,b) => a.min - b.min);

  const years = months / 12;
  const banks = rates.filter(r => years <= r.maxYears).map(r => {
    const monthly = calcMonthlyPayment(amount, r.min, years);
    const total = monthly * months;
    const feeAmt = r.fee > 0 ? amount * r.fee / 100 : 0;
    return {
      ...r, monthlyMin: Math.round(monthly),
      totalMin: Math.round(total), feeAmt: Math.round(feeAmt),
      annualMin: r.min
    };
  }).sort((a,b) => a.monthlyMin - b.monthlyMin);

  return { amount, months, banks };
}

function formatBusinessLoan(r) {
  let msg = `🏢 <b>БИЗНЕСИЙН ЗЭЭЛ</b>\n\n`;
  msg += `📋 Зээлийн дүн: <b>₮${fmt(r.amount)}</b> | ${r.months} сар\n`;
  msg += `━━━━━━━━━━━━━━━━━━\n`;

  if (!r.banks.length) {
    return msg + `❌ Энэ хугацаанд зээл олгох банк олдсонгүй. Хугацаагаа богиносгоно уу.`;
  }

  const best = r.banks[0];
  const worst = r.banks[r.banks.length - 1];

  msg += `🏆 <b>ШИЛДЭГ СОНГОЛТ:</b>\n`;
  msg += `<b>${best.mn}</b> (${fmtD(best.annualMin,1)}%/жил)\n`;
  msg += `Сард төлөх: <b>₮${fmt(best.monthlyMin)}</b>\n`;
  if (best.feeAmt > 0) msg += `Гэрээний хураамж: ₮${fmt(best.feeAmt)}\n`;

  if (r.banks.length > 1) {
    const monthlySave = worst.monthlyMin - best.monthlyMin;
    const totalSave = monthlySave * r.months;
    if (totalSave > 0) msg += `\n💡 ${r.months} сард <b>₮${fmt(totalSave)} хэмнэнэ!</b> 🎉\n`;
    msg += `━━━━━━━━━━━━━━━━━━\n`;
    msg += `📊 <b>Бусад банк:</b>\n`;
    for (let i = 1; i < r.banks.length; i++) {
      const b = r.banks[i];
      msg += `${b.mn}: ₮${fmt(b.monthlyMin)}/сар (${fmtD(b.annualMin,1)}%)\n`;
    }
  }
  msg += disclaimer();
  return msg;
}

module.exports = {
  fmt, fmtD, FLAGS, NAMES, disclaimer,
  getOfficial,
  convertCurrency, formatConversion,
  calcMonthlyPayment, calcReducingBalance,
  calculateMortgage, formatMortgage, formatSmartMortgage,
  calculatePersonalLoan, formatPersonalLoan,
  calculateBusinessLoan, formatBusinessLoan, formatBusinessRates,
  calculateCarImport, formatCarImport,
  formatMortgageRates, formatPersonalRates, formatCarRates, formatAllRates,
  MORTGAGE_RATES, PERSONAL_RATES, EXCISE_PER_CC, TRANSPORT_COST, COUNTRY_LABELS
};

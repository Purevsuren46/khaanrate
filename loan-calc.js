// 🏠 Loan Calculator — REAL bank rates from XacBank API
// Auto-fetches actual interest rates like we do with exchange rates

const axios = require('axios');
const { fetchAll, buildOfficial } = require('./bank-rates');
function num(n) { return Number(n).toLocaleString('en-US',{maximumFractionDigits:0}); }

// ─── XacBank Loan API ────────────────────────────────────────────
const XAC_LOAN_API = 'https://xacbank.mn/api/loans';

// Fallback rates (used when API fails)
const FALLBACK_RATES = {
  mortgage: [
    { bank: 'Хас Банк', rateMNT: {min:13.2, max:18.0}, rateUSD: {min:13.2, max:18.0}, maxYears: 5, minDown: 30, fee: 1.0, mn: 'Хас Банк' },
    { bank: 'Голомт Банк', rateMNT: {min:14.0, max:18.0}, rateUSD: {min:12.0, max:16.0}, maxYears: 25, minDown: 20, fee: 1.5, mn: 'Голомт Банк' },
    { bank: 'Төрийн Банк', rateMNT: {min:12.0, max:15.0}, rateUSD: {min:10.0, max:14.0}, maxYears: 30, minDown: 20, fee: 1.0, mn: 'Төрийн Банк' },
    { bank: 'ХХБ', rateMNT: {min:14.5, max:18.0}, rateUSD: {min:12.5, max:16.0}, maxYears: 20, minDown: 30, fee: 1.5, mn: 'ХХБ' },
    { bank: 'Капитрон Банк', rateMNT: {min:15.0, max:20.0}, rateUSD: {min:13.0, max:17.0}, maxYears: 20, minDown: 25, fee: 1.0, mn: 'Капитрон Банк' },
  ],
  personal: [
    { bank: 'LendMN', rateMonthly: 2.5, term: 12, minSalary: 500000, mn: 'LendMN', url: 'https://lendmn.mn', type: 'online' },
    { bank: 'And Global', rateMonthly: 2.8, term: 12, minSalary: 400000, mn: 'And Global', url: 'https://and.mn', type: 'online' },
    { bank: 'Голомт Банк', rateMonthly: 1.8, term: 24, minSalary: 800000, mn: 'Голомт Банк', type: 'bank' },
    { bank: 'Хас Банк', rateMonthly: 1.6, term: 36, minSalary: 600000, mn: 'Хас Банк', type: 'bank' },
    { bank: 'Төрийн Банк', rateMonthly: 1.5, term: 24, minSalary: 500000, mn: 'Төрийн Банк', type: 'bank' },
  ],
};

// Cache for loan rates
let cachedLoanRates = null;
let loanCacheTime = 0;
const LOAN_CACHE_TTL = 60 * 60 * 1000; // 1 hour

async function fetchLoanRates() {
  if (cachedLoanRates && Date.now() - loanCacheTime < LOAN_CACHE_TTL) return cachedLoanRates;
  
  try {
    const { data } = await axios.get(XAC_LOAN_API, { timeout: 10000 });
    const rates = { mortgage: [], personal: FALLBACK_RATES.personal };
    
    for (const doc of data.docs || []) {
      const title = doc.title || '';
      const layout = doc.layout || [];
      
      for (const block of layout) {
        if (block.blockType !== 'productConditions') continue;
        const conditions = block.conditions || [];
        
        let loanData = { bank: 'Хас Банк', mn: 'Хас Банк', source: 'xacbank_api' };
        
        for (const cond of conditions) {
          const val = cond.value || {};
          try {
            const root = val.root || {};
            const children = root.children || [];
            for (const child of children) {
              if (child.type !== 'table') continue;
              for (const row of child.children || []) {
                const cells = row.children || [];
                const texts = [];
                for (const cell of cells) {
                  for (const p of cell.children || []) {
                    for (const t of p.children || []) {
                      if (t.type === 'text') texts.push(t.text || '');
                    }
                  }
                }
                const rowText = texts.join(' | ');
                
                if (rowText.includes('Зээлийн хүү') || rowText.includes('Зээлийн зарласан хүү')) {
                  // Parse rates like "18.0% -22.8%" or "1.5% - 1.9%"
                  const pctMatch = rowText.match(/(\d+\.?\d*)%\s*-?\s*(\d+\.?\d*)%/);
                  if (pctMatch) {
                    loanData.rateMin = parseFloat(pctMatch[1]);
                    loanData.rateMax = parseFloat(pctMatch[2]);
                  }
                  // Monthly rate check
                  const monthlyMatch = rowText.match(/жилийн\s*(\d+\.?\d*)/);
                  if (monthlyMatch) {
                    loanData.rateMin = parseFloat(monthlyMatch[1]);
                    loanData.rateMax = loanData.rateMax || loanData.rateMin;
                  }
                }
                
                if (rowText.includes('хугацаа')) {
                  const yearMatch = rowText.match(/(\d+)\s*сар/);
                  const yrMatch = rowText.match(/(\d+)\s*жил/);
                  if (yrMatch) loanData.maxYears = parseInt(yrMatch[1]);
                  else if (yearMatch) loanData.maxMonths = parseInt(yearMatch[1]);
                }
                
                if (rowText.includes('шимтгэл')) {
                  const feeMatch = rowText.match(/(\d+\.?\d*)%/);
                  if (feeMatch) loanData.fee = parseFloat(feeMatch[1]);
                }
              }
            }
          } catch(e) {}
        }
        
        if (loanData.rateMin) {
          loanData.mn = 'Хас Банк';
          loanData.title = title;
          // Determine type
          if (title.includes('барилг') || title.includes('Барилг')) {
            loanData.type = 'construction';
          } else if (title.includes('Ногоон') || title.includes('ногоон')) {
            loanData.type = 'green';
          } else if (title.includes('ЖАЙКА') || title.includes('JICA')) {
            loanData.type = 'jica';
          } else if (title.includes('Органик')) {
            loanData.type = 'organic';
          } else if (title.includes('Ажил эрхлэлт')) {
            loanData.type = 'employment';
          } else {
            loanData.type = 'other';
          }
          
          if (loanData.maxYears || loanData.maxMonths) {
            rates.mortgage.push(loanData);
          }
        }
      }
    }
    
    // If API returned data, combine with fallback for other banks
    if (rates.mortgage.length > 0) {
      // Add fallback banks that aren't XacBank
      rates.mortgage = [...rates.mortgage, ...FALLBACK_RATES.mortgage.filter(b => b.bank !== 'Хас Банк')];
    } else {
      rates.mortgage = FALLBACK_RATES.mortgage;
    }
    
    cachedLoanRates = rates;
    loanCacheTime = Date.now();
    return rates;
  } catch(e) {
    console.error('Loan API error:', e.message?.substring(0, 50));
    cachedLoanRates = FALLBACK_RATES;
    loanCacheTime = Date.now();
    return FALLBACK_RATES;
  }
}

// ─── Mortgage Calculation ────────────────────────────────────────

function monthlyPayment(principal, annualRate, years) {
  const monthlyRate = annualRate / 100 / 12;
  const months = years * 12;
  if (monthlyRate === 0) return principal / months;
  const x = Math.pow(1 + monthlyRate, months);
  return principal * (monthlyRate * x) / (x - 1);
}

async function calculateMortgage({ propertyPrice, downPaymentPct, years, salary, currency }) {
  const rates = await fetchLoanRates();
  const official = await getRate();
  const usdRate = official.usd || 3573;
  
  const downPayment = propertyPrice * (downPaymentPct / 100);
  const loanAmount = propertyPrice - downPayment;
  const isUSD = currency === 'usd';
  
  const results = rates.mortgage.map(bank => {
    // Use API data or fallback
    let rateMin, rateMax, maxYears, minDown, fee;
    
    if (bank.source === 'xacbank_api') {
      rateMin = bank.rateMin;
      rateMax = bank.rateMax;
      maxYears = bank.maxYears || Math.round((bank.maxMonths || 60) / 12);
      minDown = 30; // default for XacBank
      fee = bank.fee || 1.0;
    } else {
      const rateObj = isUSD ? bank.rateUSD : bank.rateMNT;
      rateMin = rateObj.min;
      rateMax = rateObj.max;
      maxYears = bank.maxYears;
      minDown = bank.minDown;
      fee = bank.fee;
    }
    
    const avgRate = (rateMin + rateMax) / 2;
    const eligible = downPaymentPct >= (minDown || 20) && years <= (maxYears || 25);
    const monthly = eligible ? monthlyPayment(loanAmount, avgRate, years) : 0;
    const total = monthly * years * 12;
    const totalInterest = total - loanAmount;
    const salaryOK = salary ? monthly <= salary * 0.5 : true;
    
    return {
      bank: bank.bank || bank.mn,
      mn: bank.mn,
      rateMin, rateMax, avgRate,
      maxYears, minDown, fee,
      eligible, monthly, total, totalInterest,
      salaryOK,
      debtRatio: salary ? (monthly / salary * 100) : 0,
      source: bank.source || 'fallback',
      title: bank.title || '',
      type: bank.type || 'standard',
    };
  }).filter(r => r.eligible).sort((a,b) => a.monthly - b.monthly);
  
  return {
    propertyPrice, downPaymentPct, downPayment, loanAmount, years, salary,
    currency: currency || 'mnt',
    banks: results,
    usdRate,
  };
}

function formatMortgage(r) {
  const curr = r.currency === 'usd' ? '$' : '₮';
  let msg = `🏠 <b>ЗЭЭЛИЙН ТООЦОООЛУУР</b>\n\n`;
  msg += `📋 <b>Орон сууц:</b>\n`;
  msg += `   Үнэ: <b>${curr}${num(r.propertyPrice)}</b>`;
  if (r.currency === 'usd') msg += ` (₮${num(r.propertyPrice * r.usdRate)})`;
  msg += `\n`;
  msg += `   Урьдчилгаа: ${r.downPaymentPct}% = ${curr}${num(r.downPayment)}\n`;
  msg += `   Зээл: <b>${curr}${num(r.loanAmount)}</b>\n`;
  msg += `   Хугацаа: ${r.years} жил\n`;
  if (r.salary) msg += `   Цалин: ₮${num(r.salary)}/сар\n\n`;
  
  if (!r.banks.length) {
    msg += `❌ Таны нөхцөлд зээл олгох банк олдсонгүй.\n`;
    msg += `💡 Урьдчилгаа нэмэгдүүлэх эсвэл хугацаа уртасгана уу.`;
    return msg;
  }
  
  msg += `🏦 <b>БАНКУУДЫН ХАРЬЦУУЛАЛТ:</b>\n\n`;
  r.banks.forEach((b, i) => {
    const trophy = i === 0 ? '🏆' : `${i+1}.`;
    const liveTag = b.source === 'xacbank_api' ? ' 🔴 LIVE' : '';
    msg += `${trophy} <b>${b.mn}</b>${liveTag} — ${b.rateMin}%-${b.rateMax}%\n`;
    msg += `   Сарын төлбөр: <b>${curr}${num(b.monthly)}</b>\n`;
    msg += `   Нийт төлөх: ${curr}${num(b.total)}\n`;
    msg += `   Хүү: ${curr}${num(b.totalInterest)}\n`;
    if (b.fee) msg += `   Шимтгэл: ${b.fee}%\n`;
    if (r.salary) msg += `   Цалингийн ${b.debtRatio.toFixed(0)}% ${b.salaryOK ? '✅' : '⚠️'}\n`;
    msg += `\n`;
  });
  
  const best = r.banks[0];
  const worst = r.banks[r.banks.length - 1];
  msg += `━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `🏆 <b>ШИЛДЭГ: ${best.mn}</b>\n`;
  msg += `   Сард ${curr}${num(best.monthly)} төлнө\n`;
  if (worst.mn !== best.mn) {
    const savings = worst.monthly - best.monthly;
    msg += `   ${worst.mn}-аас сард ${curr}${num(savings)} хэмнэнэ!\n`;
    msg += `   ${r.years} жилд ${curr}${num(savings * 12 * r.years)} хэмнэлт 🎉\n`;
  }
  msg += `━━━━━━━━━━━━━━━━━━━━\n\n`;
  
  // Show special XacBank programs
  const xacLoans = r.banks.filter(b => b.source === 'xacbank_api');
  if (xacLoans.length > 0) {
    msg += `🔴 <b>ХАС БАНКНЫ ОНЦЛОГ ЗЭЭЛ:</b>\n`;
    xacLoans.forEach(b => {
      if (b.title) msg += `• ${b.title}: ${b.rateMin}%-${b.rateMax}%\n`;
    });
    msg += `\n`;
  }
  
  msg += `💡 <b>ЗӨВЛӨГӨӨ:</b>\n`;
  msg += `• Сарын төлбөр цалингийн 50%-аас хэтрэхгүй байх\n`;
  msg += `• Хүүгээ бага байлгахын тулд урьдчилгаа нэмэх\n`;
  msg += `• 🔴 = бодит хүү (API-аас татсан)\n`;
  
  return msg;
}

// ─── Personal Loan Calculation ───────────────────────────────────

async function calculatePersonalLoan({ amount, months, salary }) {
  const rates = await fetchLoanRates();
  const official = await getRate();
  
  const results = rates.personal.map(bank => {
    const monthlyRate = bank.rateMonthly / 100;
    const eligible = salary >= bank.minSalary;
    const monthly = eligible ? monthlyPayment(amount, monthlyRate * 12, months / 12) : 0;
    const total = monthly * months;
    const totalInterest = total - amount;
    
    return { ...bank, eligible, monthly, total, totalInterest };
  }).filter(r => r.eligible).sort((a,b) => a.monthly - b.monthly);
  
  return { amount, months, salary, banks: results, usdRate: official.usd || 3573 };
}

function formatPersonalLoan(r) {
  let msg = `💳 <b>ХУВИЙН ЗЭЭЛИЙН ТООЦОООЛУУР</b>\n\n`;
  msg += `📋 Зээл: <b>₮${num(r.amount)}</b> ($${num(r.amount / r.usdRate)})\n`;
  msg += `Хугацаа: ${r.months} сар\n`;
  msg += `Цалин: ₮${num(r.salary)}/сар\n\n`;
  
  if (!r.banks.length) {
    msg += `❌ Таны цалингаар зээл авах боломжгүй байна.`;
    return msg;
  }
  
  msg += `🏦 <b>БОЛОМЖИТ ЗЭЭЛ:</b>\n\n`;
  r.banks.forEach((b, i) => {
    const trophy = i === 0 ? '🏆' : `${i+1}.`;
    const tag = b.type === 'online' ? '📱' : '🏦';
    msg += `${trophy} ${tag} <b>${b.mn}</b> — ${b.rateMonthly}%/сар\n`;
    msg += `   Сарын төлбөр: <b>₮${num(b.monthly)}</b>\n`;
    msg += `   Нийт төлөх: ₮${num(b.total)}\n`;
    msg += `   Хүү: ₮${num(b.totalInterest)}\n\n`;
  });
  
  const best = r.banks[0];
  msg += `━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `🏆 <b>ШИЛДЭГ: ${best.mn}</b> — сард ₮${num(best.monthly)}\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━\n\n`;
  
  msg += `📱 <b>ОНЛАЙН ЗЭЭЛ</b> — 15 минутад баталгаажна!\n`;
  r.banks.filter(b => b.type === 'online').forEach(b => {
    msg += `• ${b.mn}: ${b.rateMonthly}%/сар\n`;
  });
  
  return msg;
}

async function getRate() {
  try {
    const banks = await fetchAll();
    const official = buildOfficial(banks);
    return official || { usd: 3573, cny: 490, eur: 3900 };
  } catch { return { usd: 3573, cny: 490, eur: 3900 }; }
}

module.exports = {
  calculateMortgage, formatMortgage,
  calculatePersonalLoan, formatPersonalLoan,
  monthlyPayment, fetchLoanRates,
  FALLBACK_RATES
};

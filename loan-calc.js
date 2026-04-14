// 🏠 Loan Calculator + 💳 Credit — KhaanRate Revenue Engine
// First ₮1M revenue path

const { fetchAll, buildOfficial } = require('./bank-rates');
function num(n) { return Number(n).toLocaleString('en-US',{maximumFractionDigits:0}); }

// ─── Mortgage Calculator ─────────────────────────────────────────
// Mongolia banks: 8-18% annual, 10-30 years, 20-30% down payment

const MORTGAGE_RATES = [
  { bank: 'Голомм Банк', rate: 14.5, maxYears: 25, minDown: 20, mn: 'Голомт Банк' },
  { bank: 'Хас Банк', rate: 13.8, maxYears: 30, minDown: 20, mn: 'Хас Банк' },
  { bank: 'ХХБ', rate: 15.2, maxYears: 20, minDown: 30, mn: 'ХХБ' },
  { bank: 'Төрийн Банк', rate: 12.5, maxYears: 30, minDown: 20, mn: 'Төрийн Банк' },
  { bank: 'Капитрон Банк', rate: 16.0, maxYears: 20, minDown: 25, mn: 'Капитрон Банк' },
];

// Personal loan rates
const PERSONAL_RATES = [
  { bank: 'LendMN', rate: 2.5, term: 12, minSalary: 500000, mn: 'LendMN', url: 'https://lendmn.mn', type: 'online' },
  { bank: 'And Global', rate: 2.8, term: 12, minSalary: 400000, mn: 'And Global', url: 'https://and.mn', type: 'online' },
  { bank: 'Голомт Банк', rate: 1.8, term: 24, minSalary: 800000, mn: 'Голомт Банк', type: 'bank' },
  { bank: 'Хас Банк', rate: 1.6, term: 36, minSalary: 600000, mn: 'Хас Банк', type: 'bank' },
  { bank: 'Төрийн Банк', rate: 1.5, term: 24, minSalary: 500000, mn: 'Төрийн Банк', type: 'bank' },
];

function monthlyPayment(principal, annualRate, years) {
  const monthlyRate = annualRate / 100 / 12;
  const months = years * 12;
  if (monthlyRate === 0) return principal / months;
  const x = Math.pow(1 + monthlyRate, months);
  return principal * (monthlyRate * x) / (x - 1);
}

function totalPaid(monthly, months) {
  return monthly * months;
}

// ─── Mortgage Calculation ────────────────────────────────────────

async function calculateMortgage({ propertyPrice, downPaymentPct, years, salary }) {
  const official = await getRate();
  const downPayment = propertyPrice * (downPaymentPct / 100);
  const loanAmount = propertyPrice - downPayment;
  
  const results = MORTGAGE_RATES.map(bank => {
    const eligible = downPaymentPct >= bank.minDown && years <= bank.maxYears;
    const monthly = eligible ? monthlyPayment(loanAmount, bank.rate, years) : 0;
    const total = monthly * years * 12;
    const totalInterest = total - loanAmount;
    const salaryOK = salary ? monthly <= salary * 0.5 : true; // 50% max debt ratio
    
    return {
      ...bank,
      eligible,
      monthly,
      total,
      totalInterest,
      salaryOK,
      debtRatio: salary ? (monthly / salary * 100) : 0,
    };
  }).filter(r => r.eligible).sort((a,b) => a.monthly - b.monthly);
  
  return {
    propertyPrice, downPaymentPct, downPayment, loanAmount, years, salary,
    banks: results,
    usdRate: official.usd,
  };
}

function formatMortgage(r) {
  let msg = `🏠 <b>ЗЭЭЛИЙН ТООЦОООЛУУР</b>\n\n`;
  msg += `📋 <b>Орон сууц:</b>\n`;
  msg += `   Үнэ: <b>₮${num(r.propertyPrice)}</b> ($${num(r.propertyPrice / r.usdRate)})\n`;
  msg += `   Урьдчилгаа: ${r.downPaymentPct}% = ₮${num(r.downPayment)}\n`;
  msg += `   Зээл: <b>₮${num(r.loanAmount)}</b> ($${num(r.loanAmount / r.usdRate)})\n`;
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
    msg += `${trophy} <b>${b.mn}</b> — ${b.rate}%\n`;
    msg += `   Сарын төлбөр: <b>₮${num(b.monthly)}</b>\n`;
    msg += `   Нийт төлөх: ₮${num(b.total)}\n`;
    msg += `   Хүү: ₮${num(b.totalInterest)}\n`;
    if (r.salary) {
      msg += `   Цалингийн ${b.debtRatio.toFixed(0)}% ${b.salaryOK ? '✅' : '⚠️'}\n`;
    }
    msg += `\n`;
  });
  
  // Best option
  const best = r.banks[0];
  const worst = r.banks[r.banks.length - 1];
  msg += `━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `🏆 <b>ШИЛДЭГ: ${best.mn}</b>\n`;
  msg += `   Сард ₮${num(best.monthly)} төлнө\n`;
  if (worst.mn !== best.mn) {
    const savings = worst.monthly - best.monthly;
    msg += `   ${worst.mn}-аас сард ₮${num(savings)} хэмнэнэ!\n`;
    msg += `   ${r.years} жилд ₮${num(savings * 12 * r.years)} хэмнэлт 🎉\n`;
  }
  msg += `━━━━━━━━━━━━━━━━━━━━\n\n`;
  
  // Tips
  msg += `💡 <b>ЗӨВЛӨГӨӨ:</b>\n`;
  msg += `• Сарын төлбөр цалингийн 50%-аас хэтрэхгүй байх\n`;
  msg += `• Хүүгээ бага байлгахын тулд урьдчилгаа нэмэх\n`;
  msg += `• USD ханш өссөөр байвал MNT зээл хямд байна\n`;
  msg += `• Ханшны мэдэгдэл тохируул → /alert USD 3600`;
  
  return msg;
}

// ─── Personal Loan Calculation ───────────────────────────────────

async function calculatePersonalLoan({ amount, months, salary }) {
  const official = await getRate();
  
  const results = PERSONAL_RATES.map(bank => {
    const monthlyRate = bank.rate / 100; // rates are monthly %
    const eligible = salary >= bank.minSalary;
    const monthly = eligible ? monthlyPayment(amount, monthlyRate * 12, months / 12) : 0;
    const total = monthly * months;
    const totalInterest = total - amount;
    
    return {
      ...bank,
      eligible,
      monthly,
      total,
      totalInterest,
      monthlyRatePct: bank.rate,
    };
  }).filter(r => r.eligible).sort((a,b) => a.monthly - b.monthly);
  
  return { amount, months, salary, banks: results, usdRate: official.usd };
}

function formatPersonalLoan(r) {
  let msg = `💳 <b>ХУВИЙН ЗЭЭЛИЙН ТООЦОООЛУУР</b>\n\n`;
  msg += `📋 Зээл: <b>₮${num(r.amount)}</b> ($${num(r.amount / r.usdRate)})\n`;
  msg += `Хугацаа: ${r.months} сар\n`;
  msg += `Цалин: ₮${num(r.salary)}/сар\n\n`;
  
  if (!r.banks.length) {
    msg += `❌ Таны цалингаар зээл авах боломжгүй байна.\n`;
    msg += `💡 Цалингаа нэмэгдүүлэх эсвэл зээлийн хэмжээг багасгана уу.`;
    return msg;
  }
  
  msg += `🏦 <b>БОЛОМЖИТ ЗЭЭЛ:</b>\n\n`;
  r.banks.forEach((b, i) => {
    const trophy = i === 0 ? '🏆' : `${i+1}.`;
    const tag = b.type === 'online' ? '📱' : '🏦';
    msg += `${trophy} ${tag} <b>${b.mn}</b> — ${b.rate}%/сар\n`;
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
    msg += `• ${b.mn}: ${b.rate}%/сар\n`;
  });
  
  return msg;
}

// ─── Quick Estimate Messages ─────────────────────────────────────

async function mortgageQuickEstimate() {
  const official = await getRate();
  const prices = [50000000, 80000000, 120000000, 200000000, 500000000];
  
  let msg = `🏠 <b>ОРОН СУУЦНЫ ЗЭЭЛ — ХУРДАН ТОООЦОО</b>\n\n`;
  msg += `30% урьдчилгаа, 20 жил:\n\n`;
  
  for (const p of prices) {
    const loan = p * 0.7;
    const bestRate = 12.5; // StateBank
    const monthly = monthlyPayment(loan, bestRate, 20);
    msg += `🏠 ₮${num(p)} → сард <b>₮${num(monthly)}</b>\n`;
  }
  
  msg += `\n💡 Дэлгэрэнгүй → 🏠 Зээлийн тооцоолуур`;
  return msg;
}

async function getRate() {
  try {
    const banks = await fetchAll();
    const official = buildOfficial(banks);
    return official || { usd: 3573, cny: 490, eur: 3900 };
  } catch {
    return { usd: 3573, cny: 490, eur: 3900 };
  }
}

module.exports = {
  calculateMortgage, formatMortgage,
  calculatePersonalLoan, formatPersonalLoan,
  mortgageQuickEstimate, monthlyPayment,
  MORTGAGE_RATES, PERSONAL_RATES
};

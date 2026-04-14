const { fetchAll, buildOfficial, CURRENCIES } = require('./bank-rates');

const FLAGS = {usd:'🇺🇸',cny:'🇨🇳',eur:'🇪🇺',rub:'🇷🇺',jpy:'🇯🇵',krw:'🇰🇷',gbp:'🇬🇧'};
const NAMES = {usd:'Америк доллар',cny:'Хятад юань',eur:'Евро',rub:'Орос рубль',jpy:'Япон иен',krw:'Солонгос вон',gbp:'Англи фунт'};
const CHANNEL_ID = '-1003918347360';
const BOT_LINK = 'https://t.me/KhaanRateBot';

// ─── Content types with rotation ─────────────────────────────────

const CONTENT_TYPES = [
  'daily_rates',
  'bank_compare',
  'savings_tip',
  'market_facts',
  'alert_promo',
  'weekend_lifestyle',
  'business_tip',
  'quiz',
];

let contentIndex = 0;

async function generateContent() {
  const banks = await fetchAll();
  const official = buildOfficial(banks);
  if (!official) return null;

  const type = CONTENT_TYPES[contentIndex % CONTENT_TYPES.length];
  contentIndex++;

  const generators = {
    daily_rates: () => genDailyRates(official),
    bank_compare: () => genBankCompare(banks, official),
    savings_tip: () => genSavingsTip(banks, official),
    market_facts: () => genMarketFacts(official),
    alert_promo: () => genAlertPromo(official),
    weekend_lifestyle: () => genLifestyle(official),
    business_tip: () => genBusinessTip(official),
    quiz: () => genQuiz(official),
  };

  const msg = generators[type]();
  if (msg) msg += `\n\n📱 ${BOT_LINK}`;
  return msg;
}

// ─── Generators ──────────────────────────────────────────────────

function genDailyRates(off) {
  return `📊 <b>ӨДРИЙН ХАНШ</b>\n📅 ${new Date().toISOString().split('T')[0]}\n\n` +
    `🇺🇸 USD: ₮${num(off.usd)}\n🇨🇳 CNY: ₮${num(off.cny)}\n🇪🇺 EUR: ₮${num(off.eur)}\n🇷🇺 RUB: ₮${num(off.rub)}`;
}

function genBankCompare(banks, off) {
  const usdBanks = banks.filter(b=>b.name!=='MongolBank'&&b.rates.usd?.sell)
    .sort((a,b)=>a.rates.usd.sell-b.rates.usd.sell);
  if (!usdBanks.length) return genDailyRates(off);

  let msg = `🏦 <b>USD АВАХ — БАНК ХАРЬЦУУЛАЛТ</b>\n\n`;
  usdBanks.forEach((b,i) => {
    const medal = i===0?'🥇':i===1?'🥈':'⚪';
    const diff = b.rates.usd.sell - off.usd;
    msg += `${medal} ${b.mn}: ₮${num(b.rates.usd.sell)} (${diff>0?'+':''}₮${num(diff)})\n`;
  });
  msg += `\n🏛️ Монголбанк: ₮${num(off.usd)}`;
  return msg;
}

function genSavingsTip(banks, off) {
  const usdBanks = banks.filter(b=>b.name!=='MongolBank'&&b.rates.usd?.sell&&b.rates.usd?.buy)
    .sort((a,b)=>a.rates.usd.sell-b.rates.usd.sell);
  if (!usdBanks.length) return genDailyRates(off);

  const cheapest = usdBanks[0];
  const mostExpensive = usdBanks[usdBanks.length-1];
  const savings = mostExpensive.rates.usd.sell - cheapest.rates.usd.sell;

  return `💡 <b>ХЭМНЭЛТИЙН ЗӨВЛӨГӨӨ</b>\n\n` +
    `1000$ авахад:\n` +
    `${cheapest.mn}: ₮${num(cheapest.rates.usd.sell * 1000)}\n` +
    `${mostExpensive.mn}: ₮${num(mostExpensive.rates.usd.sell * 1000)}\n\n` +
    `💰 Зөв банк сонгож <b>₮${num(savings * 1000)}</b> хэмнэж болно!\n\n` +
    `🏆 Хамгийн хямд: ${cheapest.mn}`;
}

function genMarketFacts(off) {
  const facts = [
    `📈 <b>ХАНШНЫ ТООНҮҮД</b>\n\n1$ = ₮${num(off.usd)}\n1€ = ₮${num(off.eur)}\n1¥ = ₮${num(off.cny)}\n\nМонголын импортын 80% нь USD, CNY-аар төлөгддөг. Ханш 1% өөрчлөгдвөл ₮8 тэрбум нөлөөлнө.`,
    `📊 <b>ХАНШ ХЭНД ХАМААТАЙ ВЭ?</b>\n\n• Ажилтнууд: цалингийн 30% гадаад валют\n• Импортлогчид: 1% өөрчлөлт = ₮500М нөөц\n• Аялал: 1$ нэмэгдвэл визийн хураамж өснө\n\nОдоогийн USD: ₮${num(off.usd)}`,
    `🔢 <b>ХАНШЫН АРД ТЭСЭРГҮҮ</b>\n\nМонголбанк өдөрт ~₮2 тэрбум ханшны интервенци хийдэг.\n\nОдоо: USD ₮${num(off.usd)} | CNY ₮${num(off.cny)} | EUR ₮${num(off.eur)}`,
  ];
  return facts[Math.floor(Math.random()*facts.length)];
}

function genAlertPromo(off) {
  return `🔔 <b>ХАНШ ХҮРЭХЭД МЭДЭГДЭ!</b>\n\nUSD одоо ₮${num(off.usd)} байна.\n\nТа ₮3600-д хүрэхэд шууд мэдэгдэл авмаар байна уу?\n\n📱 ${BOT_LINK} руу орж /alert USD 3600 бичнэ үү!\n\nБүртгэл үнэгүй, мөнгө шингэдэггүй 🎉`;
}

function genLifestyle(off) {
  const lifestyles = [
    `✈️ <b>АЯЛАЛЫН ТӨСӨӨЛӨЛ</b>\n\nБээжин рүү нисвэл:\n🎫 Нислэг ~₮1,200,000\n🏠 Буудал ~₮150,000/шөнө (CNY ₮${num(off.cny)})\n🍜 Хоол ~₮15,000/идэх\n\nНийт: ~₮1,500,000\n1$ = ₮${num(off.usd)}`,
    `🛒 <b>ИНТЕРНЕТ ДЭЛГЭЦЭНД ХУДАЛДАЖ АВАХ</b>\n\nAliexpress-ээс авахад CNY ханш чухал:\n🇨🇳 1¥ = ₮${num(off.cny)}\n\n₮100,000-аар авах боломжтой:\n• Утас хувьсагч\n• Гутал 5 хос\n• Цүнх 2 ширхэг`,
    `🎓 <b>ГADAAD СУРГАЛТ</b>\n\nСолонгост суръя гэж байна уу?\n🇰🇷 1₩ = ₮${num(off.krw)}\n1 жилийн зардал: ~₮20,000,000\n\nОдоогийн ханшаар тооцоол → ${BOT_LINK}`,
  ];
  return lifestyles[Math.floor(Math.random()*lifestyles.length)];
}

function genBusinessTip(off) {
  const tips = [
    `💼 <b>БИЗНЕС ЗӨВЛӨГӨӨ</b>\n\nИмпортын компаниудад:\nUSD ₮${num(off.usd)} үед 10,000$ авбал:\n• Хамгийн хямд банк: хэмнэлт их\n• Хамгийн үнэтэй банк: ₮${num(30*10000)} илүү төлнө\n\n/api -р өдөр тутмын JSON ханш аваарай → /business`,
    `📊 <b>ЭКСПОРТЛОГЧДОО</b>\n\nГадаадад борлуулалт хийгддэг үү?\n\nUSD ханш 1% өсвөл орлого ₮1М нэмэгдэнэ (100к$ экспортлогчдод).\n\nХанш хянах → /alert USD above 3600`,
  ];
  return tips[Math.floor(Math.random()*tips.length)];
}

function genQuiz(off) {
  const quizzes = [
    { q: `🧠 <b>АСУУЛТ:</b> 1000$ авахад хэдэн төгрөг хэрэгтэй вэ?`, a: `✅ Хариулт: ₮${num(off.usd * 1000)} (USD ₮${num(off.usd)})` },
    { q: `🧠 <b>АСУУЛТ:</b> 5000¥ (юань) хэдэн төгрөг болох вэ?`, a: `✅ Хариулт: ₮${num(off.cny * 5000)} (CNY ₮${num(off.cny)})` },
    { q: `🧠 <b>АСУУЛТ:</b> EUR-аас USD хэдэн хувь илүү үнэтэй вэ?`, a: `✅ Хариулт: ~${Math.round(off.eur/off.usd*100-100)}% илүү (EUR ₮${num(off.eur)} vs USD ₮${num(off.usd)})` },
  ];
  const quiz = quizzes[Math.floor(Math.random()*quizzes.length)];
  return `${quiz.q}\n\n(2 секунды бодох хэрэгтэй...)\n\n${quiz.a}`;
}

function num(n) { return Number(n).toLocaleString('en-US',{maximumFractionDigits:2}); }

module.exports = { generateContent, CONTENT_TYPES, CHANNEL_ID };

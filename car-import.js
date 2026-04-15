// 🚗 Car Import Calculator — KhaanRate v13
// Reads tax rates from tax-config.json (no more hardcoded constants)

const { fetchAll, buildOfficial, CURRENCIES } = require('./bank-rates');
const taxConfig = require('./tax-config.json');

function num(n) { return Number(n).toLocaleString('en-US',{maximumFractionDigits:0}); }

// Car age adjustment (older = higher tax)
function ageMultiplier(year) {
  const age = new Date().getFullYear() - year;
  if (age <= 3) return 1.0;
  if (age <= 5) return 1.1;
  if (age <= 7) return 1.3;
  if (age <= 10) return 1.8;
  return 2.5;
}

// Left-hand drive discount
const LHD_DISCOUNT = 0.85;

// Transport costs from config (fallback if missing)
const TRANSPORT = taxConfig.transport || {
  japan: 2500, korea: 2000, china: 800, usa: 4000, europe: 3500,
};
// Ensure all keys exist
TRANSPORT.japan = TRANSPORT.japan || TRANSPORT.port || 2500;
TRANSPORT.korea = TRANSPORT.korea || 2000;
TRANSPORT.china = TRANSPORT.china || 800;
TRANSPORT.usa = TRANSPORT.usa || 4000;
TRANSPORT.europe = TRANSPORT.europe || 3500;

const COUNTRY_NAMES = {
  japan: '🇯🇵 Япон',
  korea: '🇰🇷 Солонгос',
  china: '🇨🇳 Хятад',
  usa: '🇺🇸 Америк',
  europe: '🇪🇺 Европ',
};

// Get excise rate per CC from config
function getExciseRate(cc, isHybrid, isElectric) {
  if (isElectric && taxConfig.excise.electric_exempt) return 0;
  const brackets = taxConfig.excise.engine_cc || [];
  let rate = 500; // fallback
  for (const b of brackets) {
    if (cc >= b.min && cc < b.max) { rate = b.rate; break; }
  }
  if (isHybrid && taxConfig.excise.hybrid_discount_pct) {
    rate = rate * (1 - taxConfig.excise.hybrid_discount_pct / 100);
  }
  return rate;
}

// ─── Main Calculation ────────────────────────────────────────────

async function calculateCarImport({ price, currency, country, year, cc, isLeftHand, isHybrid, isElectric }) {
  const banks = await fetchAll();
  const official = buildOfficial(banks);

  const rate = official[currency] || (currency === 'usd' ? 3573 : 490);
  const priceUsd = currency === 'usd' ? price : price * rate / (official.usd || 3573);
  const priceMnt = priceUsd * (official.usd || 3573);

  // From config
  const customsDutyPct = taxConfig.customs_duty_pct || 5;
  const vatPct = taxConfig.vat || 10;
  const exciseRate = getExciseRate(cc, isHybrid, isElectric);

  const ageMult = ageMultiplier(year);
  const lhdMult = isLeftHand ? LHD_DISCOUNT : 1.0;

  // Customs value
  const customsValue = priceMnt + (TRANSPORT[country] || TRANSPORT.japan || 2500) * (official.usd || 3573);

  // Import tax
  const importTax = customsValue * (customsDutyPct / 100) * ageMult * lhdMult;

  // Excise tax
  const exciseTax = cc * exciseRate * ageMult * lhdMult;

  // VAT
  const vatBase = customsValue + importTax + exciseTax;
  const vat = vatBase * (vatPct / 100);

  // Transport
  const transportMnt = (TRANSPORT[country] || 2500) * (official.usd || 3573);

  // Fees (from config or defaults)
  const registration = taxConfig.transport?.registration || 500000;
  const inspection = taxConfig.transport?.inspection || 150000;
  const customsFee = 200000;

  const totalTax = importTax + exciseTax + vat;
  const totalCost = priceMnt + totalTax + transportMnt + registration + inspection + customsFee;

  // Cheapest bank
  const sortedBanks = banks
    .filter(b => b.name !== 'MongolBank' && b.rates[currency]?.sell)
    .sort((a,b) => a.rates[currency].sell - b.rates[currency].sell);
  const cheapest = sortedBanks[0];

  const cheapRate = cheapest?.rates[currency]?.sell || rate;
  const cheapPriceMnt = (currency === 'usd' ? priceUsd : price) * cheapRate;
  const cheapTotal = cheapPriceMnt + totalTax + transportMnt + registration + inspection + customsFee;
  const savings = totalCost - cheapTotal;

  return {
    price, currency, priceUsd, priceMnt,
    country, year, cc, isLeftHand, isHybrid, isElectric,
    customsValue, importTax, exciseTax, vat, totalTax,
    transportMnt, registration, inspection, customsFee,
    totalCost, cheapest, cheapRate, cheapTotal, savings,
    rate: currency === 'usd' ? (official.usd || 3573) : (official[currency] || rate),
    officialRate: currency === 'usd' ? (official.usd || 3573) : (official[currency] || rate),
    ageMult, lhdMult,
    customsDutyPct, vatPct,
  };
}

function formatCarResult(r) {
  let msg = `🚗 <b>АВТОМАШИНЫ ИМПОРТЫН ТООЦОО</b>\n\n`;

  msg += `📋 <b>Машин:</b>\n`;
  msg += `   Үнэ: ${r.currency === 'usd' ? '$' : '¥'}${num(r.price)} (₮${num(r.priceMnt)})\n`;
  msg += `   Он: ${r.year} (${num(r.ageMult)}x насны коэффициент)\n`;
  msg += `   Хөдөлгүүр: ${r.isElectric ? '⚡ Цахилгаан' : r.isHybrid ? '🔋 Хайбрид' : `${num(r.cc)}cc`}\n`;
  msg += `   Жолоо: ${r.isLeftHand ? 'Зүүн ✅ (-15% татвар)' : 'Баруун'}\n`;
  msg += `   Улс: ${COUNTRY_NAMES[r.country] || r.country}\n\n`;

  msg += `💰 <b>ҮНДЭСЭН ӨРТӨГ:</b>\n`;
  msg += `   Машин: ₮${num(r.priceMnt)}\n`;
  msg += `   Тээвэр: ₮${num(r.transportMnt)}\n`;
  msg += `   ────────────────\n`;
  msg += `   Нийт үндсэн: ₮${num(r.customsValue)}\n\n`;

  msg += `🏛️ <b>ТАТВАР:</b>\n`;
  msg += `   Гаалийн татвар (${r.customsDutyPct}%): ₮${num(r.importTax)}\n`;
  if (r.exciseTax > 0) msg += `   Акциз: ₮${num(r.exciseTax)}\n`;
  msg += `   НӨАТ (${r.vatPct}%): ₮${num(r.vat)}\n`;
  msg += `   ────────────────\n`;
  msg += `   Татвар нийт: <b>₮${num(r.totalTax)}</b>\n\n`;

  msg += `📝 <b>НЭМЭЛТ ЗАРДУУЛАЛТ:</b>\n`;
  msg += `   Бүртгэл: ₮${num(r.registration)}\n`;
  msg += `   Үзлэг: ₮${num(r.inspection)}\n`;
  msg += `   Гаалийн хураамж: ₮${num(r.customsFee)}\n\n`;

  msg += `━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `🎯 <b>НИЙТ ӨРТӨГ: ₮${num(r.totalCost)}</b>\n`;
  msg += `   ≈ $${num(r.totalCost / (r.officialRate || 3573))}\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━\n\n`;

  if (r.cheapest && r.savings > 0) {
    msg += `🏆 <b>ХЭМНЭЛТ:</b> ${r.cheapest.mn}-р ₮${num(r.savings)} хэмнэнэ!\n\n`;
  }

  msg += `⚠️ <i>Энэхүү тооцооллууд нь ойролцоо утга бөгөөд албан ёсны баримт бичиг болохгүй.</i>`;
  return msg;
}

// ─── Interactive car import flow ─────────────────────────────────
const carSessions = {};

function carStartMessage() {
  return `🚗 <b>АВТОМАШИНЫ ИМПОРТЫН ТООЦООЛОЛЧ</b>\n\n` +
    `Машин авах бүх зардлыг урьдчилан мэдээрэй!\n\n` +
    `👇 Улсаа сонгоно уу:`;
}

function carCountryKeyboard() {
  return {
    reply_markup: { inline_keyboard: [
      [{text:'🇯🇵 Япон', callback_data:'car_japan'}, {text:'🇰🇷 Солонгос', callback_data:'car_korea'}],
      [{text:'🇨🇳 Хятад', callback_data:'car_china'}, {text:'🇺🇸 Америк', callback_data:'car_usa'}],
      [{text:'🇪🇺 Европ', callback_data:'car_europe'}],
    ]}
  };
}

function carPriceKeyboard(country) {
  return `🚗 <b>Улс: ${COUNTRY_NAMES[country]}</b>\n\n` +
    `Жишээ:\n` +
    `<code>car 2000000 jpy 2020 2000</code>\n` +
    `<code>car 15000 usd 2022 2000 left hybrid</code>`;
}

function carPresetsKeyboard() {
  return {
    reply_markup: { inline_keyboard: [
      [{text:'🇯🇵 Prius 2019 ¥2M', callback_data:'carpre_japan_2000000_jpy_2019_1800_left_hybrid'},
       {text:'🇯🇵 Prius 2022 ¥2.5M', callback_data:'carpre_japan_2500000_jpy_2022_1800_left_hybrid'}],
      [{text:'🇯🇵 Land Cruiser ¥5M', callback_data:'carpre_japan_5000000_jpy_2019_4500'},
       {text:'🇨🇳 BYD Song 80,000¥', callback_data:'carpre_china_80000_cny_2024_1500_left'}],
    ]}
  };
}

module.exports = {
  calculateCarImport, formatCarResult,
  carStartMessage, carCountryKeyboard, carPriceKeyboard, carPresetsKeyboard,
  carSessions, COUNTRY_NAMES, TRANSPORT, getExciseRate
};

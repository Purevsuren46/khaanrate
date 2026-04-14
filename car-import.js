// 🚗 Car Import Calculator — KhaanRate
// The #1 financial pain point for Mongolians

const { fetchAll, buildOfficial, CURRENCIES } = require('./bank-rates');

function num(n) { return Number(n).toLocaleString('en-US',{maximumFractionDigits:0}); }

// ─── Mongolia Customs Tax Rates (2024-2026) ──────────────────────
// Based on Mongolian Customs Law — realistic estimates

// Engine displacement brackets for customs tax
const ENGINE_TAX = {
  // displacement_cc: { import_tax_percent, vat_percent, excise_mnt_per_cc }
  electric:   { import: 5,  vat: 10, excise: 0 },
  hybrid:     { import: 5,  vat: 10, excise: 500 },
  small:      { import: 5,  vat: 10, excise: 500 },   // ≤1500cc
  medium:     { import: 5,  vat: 10, excise: 1500 },  // 1501-2500cc
  large:      { import: 5,  vat: 10, excise: 3000 },  // 2501-3500cc
  xlarge:     { import: 5,  vat: 10, excise: 5000 },  // 3501-4500cc
  xxlarge:    { import: 5,  vat: 10, excise: 8000 },  // >4500cc
};

// Car age adjustment (older = higher tax)
function ageMultiplier(year) {
  const age = new Date().getFullYear() - year;
  if (age <= 3) return 1.0;
  if (age <= 5) return 1.1;
  if (age <= 7) return 1.3;
  if (age <= 10) return 1.8;
  return 2.5; // >10 years
}

// Left-hand drive discount
const LHD_DISCOUNT = 0.85; // 15% off customs for left-hand drive

// Transport costs (approximate)
const TRANSPORT = {
  japan: 2500,   // $2,500 Japan → Mongolia (ship + train)
  korea: 2000,   // $2,000 Korea → Mongolia
  china: 800,    // $800 China → Mongolia (truck)
  usa: 4000,     // $4,000 USA → Mongolia
  europe: 3500,  // $3,500 Europe → Mongolia
};

const COUNTRY_NAMES = {
  japan: '🇯🇵 Япон',
  korea: '🇰🇷 Солонгос',
  china: '🇨🇳 Хятад',
  usa: '🇺🇸 Америк',
  europe: '🇪🇺 Европ',
};

// ─── Main Calculation ────────────────────────────────────────────

async function calculateCarImport({ price, currency, country, year, cc, isLeftHand, isHybrid, isElectric }) {
  const banks = await fetchAll();
  const official = buildOfficial(banks);
  
  // Get exchange rate
  const rate = official[currency] || (currency === 'usd' ? 3573 : 490);
  const priceUsd = currency === 'usd' ? price : price * rate / official.usd;
  const priceMnt = priceUsd * (official.usd || 3573);
  
  // Determine engine bracket
  let bracket;
  if (isElectric) bracket = ENGINE_TAX.electric;
  else if (isHybrid) bracket = ENGINE_TAX.hybrid;
  else if (cc <= 1500) bracket = ENGINE_TAX.small;
  else if (cc <= 2500) bracket = ENGINE_TAX.medium;
  else if (cc <= 3500) bracket = ENGINE_TAX.large;
  else if (cc <= 4500) bracket = ENGINE_TAX.xlarge;
  else bracket = ENGINE_TAX.xxlarge;
  
  // Calculate taxes in MNT
  const ageMult = ageMultiplier(year);
  const lhdMult = isLeftHand ? LHD_DISCOUNT : 1.0;
  
  // Customs value (for tax calculation)
  const customsValue = priceMnt + (TRANSPORT[country] || 2000) * (official.usd || 3573);
  
  // Import tax
  const importTax = customsValue * (bracket.import / 100) * ageMult * lhdMult;
  
  // Excise tax (per cc)
  const exciseTax = cc * bracket.excise * ageMult * lhdMult;
  
  // VAT
  const vatBase = customsValue + importTax + exciseTax;
  const vat = vatBase * (bracket.vat / 100);
  
  // Transport
  const transportMnt = (TRANSPORT[country] || 2000) * (official.usd || 3573);
  
  // Registration & other fees
  const registration = 500000; // ₮500K approximate
  const inspection = 150000;   // ₮150K
  const customsFee = 200000;   // ₮200K customs processing
  
  // Total
  const totalTax = importTax + exciseTax + vat;
  const totalCost = priceMnt + totalTax + transportMnt + registration + inspection + customsFee;
  
  // Cheapest bank to buy currency
  const sortedBanks = banks
    .filter(b => b.name !== 'MongolBank' && b.name !== 'StateBank' && b.rates[currency]?.sell)
    .sort((a,b) => a.rates[currency].sell - b.rates[currency].sell);
  const cheapest = sortedBanks[0];
  
  // With cheapest bank
  const cheapRate = cheapest?.rates[currency]?.sell || rate;
  const cheapPriceMnt = (currency === 'usd' ? priceUsd : price) * cheapRate;
  const cheapTotal = cheapPriceMnt + totalTax + transportMnt + registration + inspection + customsFee;
  const savings = totalCost - cheapTotal;
  
  return {
    price, currency, priceUsd, priceMnt,
    country, year, cc, isLeftHand, isHybrid, isElectric,
    customsValue,
    importTax, exciseTax, vat,
    totalTax,
    transportMnt, registration, inspection, customsFee,
    totalCost,
    cheapest, cheapRate, cheapTotal, savings,
    rate: currency === 'usd' ? (official.usd || 3573) : (official[currency] || rate),
    officialRate: currency === 'usd' ? (official.usd || 3573) : (official[currency] || rate),
    ageMult, lhdMult, bracket,
  };
}

function formatCarResult(r) {
  let msg = `🚗 <b>АВТОМАШИНЫ ИМПОРТЫН ТОООЦОО</b>\n\n`;
  
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
  msg += `   Гаалийн гишүүн: ₮${num(r.importTax)}\n`;
  if (r.exciseTax > 0) msg += `   Акциз: ₮${num(r.exciseTax)}\n`;
  msg += `   НӨАТ: ₮${num(r.vat)}\n`;
  msg += `   ────────────────\n`;
  msg += `   Татвар нийт: <b>₮${num(r.totalTax)}</b>\n\n`;
  
  msg += `📝 <b>БОЛОМЖИЙН ЗАРДАЛ:</b>\n`;
  msg += `   Бүртгэл: ₮${num(r.registration)}\n`;
  msg += `   Үзлэг: ₮${num(r.inspection)}\n`;
  msg += `   Гаалийн хураамж: ₮${num(r.customsFee)}\n\n`;
  
  msg += `━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `🎯 <b>НИЙТ ӨРТӨГ: ₮${num(r.totalCost)}</b>\n`;
  msg += `   ≈ $${num(r.totalCost / (r.officialRate || 3573))}\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━\n\n`;
  
  if (r.cheapest && r.savings > 0) {
    msg += `🏆 <b>ХЭМНЭЛТ:</b> ${r.cheapest.mn}-р ${num(r.savings)}₮ хэмнэнэ!\n`;
    msg += `   ${r.cheapest.mn}: ₮${num(r.cheapTotal)} vs Албан: ₮${num(r.totalCost)}\n\n`;
  }
  
  msg += `💡 Татварын коэффициент: ${num(r.ageMult)}x (нас) × ${r.isLeftHand ? '0.85x (зүүн жолоо)' : '1.0x'}\n`;
  msg += `📊 Ханш: ₮${num(r.officialRate)}/${r.currency.toUpperCase()}`;
  
  return msg;
}

// ─── Interactive car import flow ─────────────────────────────────

const carSessions = {}; // temporary session storage

function carStartMessage() {
  return `🚗 <b>АВТОМАШИНЫ ИМПОРТЫН ТОООЦООЛОЛЧ</b>\n\n` +
    `Машин авах бүх зардлыг урьдчилан мэдээрэй!\n\n` +
    `Үнэ, он, хөдөлгүүр зэргээ оруулаад бүх татвар + зардал + тээврийг нэг дор харна.\n\n` +
    `👇 Эхлэхийн тулд улсаа сонгоно уу:`;
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
    `Машинны үнийг оруулна уу:\n\n` +
    `Жишээ:\n` +
    `<code>car 2000000 jpy</code> — 2 сая иен\n` +
    `<code>car 15000 usd</code> — 15,000 доллар\n` +
    `<code>car 80000 cny</code> — 80,000 юань\n\n` +
    `Дараа нь он, хөдөлгүүрийн багтаамж оруулна уу:\n` +
    `<code>car 2000000 jpy 2020 2000</code> — 2M¥ 2020 он 2000cc\n` +
    `<code>car 2000000 jpy 2020 2000 left hybrid</code> — + зүүн жолоо + хайбрид`;
}

// Quick presets
function carPresetsKeyboard() {
  return {
    reply_markup: { inline_keyboard: [
      [{text:'🇯🇵 Prius 2019 ¥2M', callback_data:'carpre_japan_2000000_jpy_2019_1800_left_hybrid'},
       {text:'🇯🇵 Prius 2022 ¥2.5M', callback_data:'carpre_japan_2500000_jpy_2022_1800_left_hybrid'}],
      [{text:'🇯🇵 Land Cruiser ¥5M', callback_data:'carpre_japan_5000000_jpy_2019_4500'},
       {text:'🇯🇵 Civic 2021 ¥2.5M', callback_data:'carpre_japan_2500000_jpy_2021_1500_left'}],
      [{text:'🇨🇳 BYD Song 80,000¥', callback_data:'carpre_china_80000_cny_2024_1500_left'},
       {text:'🇰🇷 Sonata 2022 $15K', callback_data:'carpre_korea_15000_usd_2022_2000_left'}],
    ]}
  };
}

module.exports = {
  calculateCarImport, formatCarResult,
  carStartMessage, carCountryKeyboard, carPriceKeyboard, carPresetsKeyboard,
  carSessions, COUNTRY_NAMES, TRANSPORT, ENGINE_TAX
};

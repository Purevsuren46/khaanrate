const { fetchAll, buildOfficial, CURRENCIES } = require('./bank-rates');
const axios = require('axios');

// ─── Config ─────────────────────────────────────────────────────
const BUSINESS_PRICE = 50000;
const BUSINESS_CONTACT = '@khaanrate_support';
const CHANNEL_ID = '-1003918347360';

const ADS = [
  { text: '💳 Голомт Банк — Гадаадад мөнгө илгээх 0% шимтгэлээр! → golomtbank.com', active: true, impressions: 0 },
  { text: '💱 Хас Банк — Валют солилцоо хамгийн хямд ханшаар! → xacbank.mn', active: true, impressions: 0 },
];

const REFERRALS = {
  GolomtBank: { url: 'https://www.golomtbank.com/mn/open-account', label: '🏦 Голомт Банк — Данс нээх', bonus: '₮10,000 урамшуулал' },
  XacBank: { url: 'https://www.xacbank.mn/mn/open-account', label: '💚 Хас Банк — Данс нээх', bonus: '₮5,000 урамшуулал' },
  StateBank: { url: 'https://www.statebank.mn/mn/open-account', label: '🏛️ Төрийн Банк — Данс нээх', bonus: '' },
};

// ─── Functions ──────────────────────────────────────────────────
function addReferralButtons(banks) {
  const buttons = [];
  for (const b of banks) {
    const ref = REFERRALS[b.name];
    if (!ref) continue;
    buttons.push([{ text: ref.label + (ref.bonus ? ` (${ref.bonus})` : ''), url: ref.url }]);
  }
  return buttons;
}

function getAd() {
  const active = ADS.filter(a => a.active);
  if (!active.length) return null;
  const ad = active[Math.floor(Math.random() * active.length)];
  ad.impressions++;
  return ad.text;
}

function generateApiKey(company) {
  const key = 'kr_' + Buffer.from(company + Date.now()).toString('base64').slice(0, 24);
  return key;
}

async function businessReport() {
  const banks = await fetchAll();
  const official = buildOfficial(banks);
  if (!official) return null;
  const FLAGS = {usd:'🇺🇸',cny:'🇨🇳',eur:'🇪🇺',rub:'🇷🇺',jpy:'🇯🇵',krw:'🇰🇷',gbp:'🇬🇧'};
  let report = `📊 KhaanRate ӨДРИЙН ХАНШНЫ ТАЙЛАН\n📅 ${new Date().toISOString().split('T')[0]}\n\nАлбан ханш:\n`;
  for (const c of CURRENCIES) {
    const r = official[c];
    if (r) report += `${c.toUpperCase()}: ₮${Number(r).toLocaleString()}\n`;
  }
  report += `\nБанкны харьцуулалт:\n`;
  for (const b of banks) {
    if (b.name==='MongolBank'||b.name==='StateBank') continue;
    report += `\n${b.mn}:\n`;
    for (const c of CURRENCIES) {
      const br = b.rates[c];
      if (br) report += `  ${c.toUpperCase()}: Авах ₮${br.sell} | Зарах ₮${br.buy}\n`;
    }
  }
  return report;
}

let lastChannelPost = 0;
async function postToChannel(bot) {
  const now = Date.now();
  if (now - lastChannelPost < 86400000) return;
  const banks = await fetchAll();
  const official = buildOfficial(banks);
  if (!official) return;
  const FLAGS = {usd:'🇺🇸',cny:'🇨🇳',eur:'🇪🇺',rub:'🇷🇺',jpy:'🇯🇵',krw:'🇰🇷',gbp:'🇬🇧'};
  let msg = `📊 ӨДРИЙН ХАНШ\n📅 ${new Date().toISOString().split('T')[0]}\n\n`;
  for (const c of CURRENCIES) {
    const r = official[c];
    if (!r) continue;
    msg += `${FLAGS[c]} ${c.toUpperCase()}: ₮${Number(r).toLocaleString()}\n`;
  }
  msg += '\n📱 @KhaanRateBot — Ханш шалгах бот';
  try {
    await bot.sendMessage(CHANNEL_ID, msg);
    lastChannelPost = now;
  } catch {}
}

module.exports = { REFERRALS, addReferralButtons, generateApiKey, businessReport, getAd, postToChannel, BUSINESS_PRICE, BUSINESS_CONTACT, ADS };

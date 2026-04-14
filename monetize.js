const { fetchAll, buildOfficial, CURRENCIES } = require('./bank-rates');
const axios = require('axios');

// Bank referral links — earn commission per new account
const REFERRALS = {
  GolomtBank: {
    url: 'https://www.golomtbank.com/mn/open-account',
    label: '🏦 Голомт Банк — Данс нээх',
    bonus: '₮10,000 урамшуулал',
  },
  XacBank: {
    url: 'https://www.xacbank.mn/mn/open-account',
    label: '💚 Хас Банк — Данс нээх',
    bonus: '₮5,000 урамшуулал',
  },
  StateBank: {
    url: 'https://www.statebank.mn/mn/open-account',
    label: '🏛️ Төрийн Банк — Данс нээх',
    bonus: '',
  },
};

// Add referral buttons to rate messages
function addReferralButtons(banks) {
  const buttons = [];
  for (const b of banks) {
    const ref = REFERRALS[b.name];
    if (!ref) continue;
    buttons.push([{
      text: ref.label + (ref.bonus ? ` (${ref.bonus})` : ''),
      url: ref.url,
    }]);
  }
  return buttons;
}

// Business API key management
// Companies pay for API access to daily rates
const API_KEYS = new Map(); // key -> {company, expires, requests}

function generateApiKey(company) {
  const key = 'kr_' + Buffer.from(company + Date.now()).toString('base64').slice(0, 24);
  API_KEYS.set(key, { company, expires: Date.now() + 30*24*60*60*1000, requests: 0 });
  return key;
}

// Daily business report
async function businessReport() {
  const banks = await fetchAll();
  const official = buildOfficial(banks);
  if (!official) return null;

  let report = `📊 KhaanRate ӨДӨРИЙН ХАНШНЫ ТАЙЛАН\n`;
  report += `📅 ${new Date().toISOString().split('T')[0]}\n\n`;
  report += `Албан ханш:\n`;
  for (const c of CURRENCIES) {
    const r = official[c];
    if (r) report += `${c.toUpperCase()}: ₮${Number(r).toLocaleString()}\n`;
  }
  report += `\nБанкны харьцуулалт:\n`;
  for (const b of banks) {
    if (b.name === 'MongolBank' || b.name === 'StateBank') continue;
    report += `\n${b.mn}:\n`;
    for (const c of CURRENCIES) {
      const br = b.rates[c];
      if (br) report += `  ${c.toUpperCase()}: Авах ₮${br.sell} | Зарах ₮${br.buy}\n`;
    }
  }
  return report;
}

module.exports = { REFERRALS, addReferralButtons, generateApiKey, businessReport, getAd, postToChannel, BUSINESS_PRICE, BUSINESS_CONTACT, ADS };

// ─── Sponsored messages ─────────────────────────────────────────
// Advertisers pay to have their message shown in bot replies
const ADS = [
  { text: '💳 Голомт Банк — Гадаадад мөнгө илгээх 0% шимтгэлээр! → golomtbank.com', active: true, impressions: 0 },
  { text: '💱 Хас Банк — Валют солилцоо хамгийн хямд ханшаар! → xacbank.mn', active: true, impressions: 0 },
];

function getAd() {
  const active = ADS.filter(a => a.active);
  if (!active.length) return null;
  const ad = active[Math.floor(Math.random() * active.length)];
  ad.impressions++;
  return ad.text;
}

// ─── Business subscription ───────────────────────────────────────
// ₮50,000/сар — daily API access + email report
const BUSINESS_PRICE = 50000;
const BUSINESS_CONTACT = '@khaanrate_support';

// ─── Channel auto-post ───────────────────────────────────────────
const CHANNEL_ID = '@khaanrate'; // create this channel manually
let lastChannelPost = 0;

async function postToChannel(bot) {
  // Post once per day at ~9am UTC+8 (1am UTC)
  const now = Date.now();
  if (now - lastChannelPost < 86400000) return;
  
  const banks = await fetchAll();
  const official = buildOfficial(banks);
  if (!official) return;
  
  let msg = '📊 ӨДРИЙН ХАНШ\n';
  msg += `📅 ${new Date().toISOString().split('T')[0]}\n\n`;
  const FLAGS = {usd:'🇺🇸',cny:'🇨🇳',eur:'🇪🇺',rub:'🇷🇺',jpy:'🇯🇵',krw:'🇰🇷',gbp:'🇬🇧'};
  const CURRENCIES = ['usd','cny','eur','rub','jpy','krw','gbp'];
  
  for (const c of CURRENCIES) {
    const r = official[c];
    if (!r) continue;
    msg += `${FLAGS[c]} ${c.toUpperCase()}: ₮${Number(r).toLocaleString()}`;
    // Add cheapest bank
    for (const b of banks) {
      if (b.name==='MongolBank'||b.name==='StateBank') continue;
      const br = b.rates[c];
      if (br?.sell && br.sell <= r * 1.005) {
        msg += ` | ${b.mn} ₮${br.sell}`;
        break;
      }
    }
    msg += '\n';
  }
  
  msg += '\n📱 @KhaanRateBot — Ханш шалгах бот';
  
  try {
    await bot.sendMessage(CHANNEL_ID, msg);
    lastChannelPost = now;
    console.log('📢 Channel post sent');
  } catch (e) {
    console.log('📢 Channel not found — create @khaanrate channel and add bot as admin');
  }
}

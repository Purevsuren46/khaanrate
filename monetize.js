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

module.exports = { REFERRALS, addReferralButtons, generateApiKey, businessReport };

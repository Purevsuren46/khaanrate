// KhaanRate API — Paid tiers for businesses, free for individuals
// Revenue model: freemium API with rate limits

const { fetchAll, buildOfficial, CURRENCIES } = require('./bank-rates');
const crypto = require('crypto');

// ─── API Key Management (Supabase) ───────────────────────────────
// Table: api_keys (key, chat_id, plan, requests_today, created_at)
// Plans: free (100/day), pro (10,000/day ₮50k/mo), enterprise (unlimited ₮500k/mo)

const PLANS = {
  free:       { limit: 100,      price: 0,         name: 'Үнэгүй' },
  pro:        { limit: 10000,    price: 50000,      name: 'Pro' },
  enterprise: { limit: Infinity, price: 500000,     name: 'Enterprise' },
};

function generateApiKey() {
  return 'kr_' + crypto.randomBytes(24).toString('hex');
}

async function getApiKey(supabase, key) {
  if (!supabase) return null;
  const { data } = await supabase.from('api_keys').select('*').eq('key', key).single();
  return data;
}

async function incrementUsage(supabase, key) {
  if (!supabase) return;
  await supabase.rpc('increment_api_usage', { api_key: key });
}

// ─── Rate Endpoints ──────────────────────────────────────────────

async function currentRates() {
  const banks = await fetchAll();
  const official = buildOfficial(banks);
  if (!official) return null;

  const result = {
    timestamp: new Date().toISOString(),
    source: 'MongolBank + GolomtBank + XacBank + StateBank',
    official: {},
    banks: [],
  };

  for (const c of CURRENCIES) {
    if (official[c]) result.official[c] = parseFloat(official[c]);
  }

  for (const b of banks) {
    if (b.name === 'MongolBank' || b.name === 'StateBank') continue;
    const bankData = { name: b.name, name_mn: b.mn, rates: {} };
    for (const c of CURRENCIES) {
      if (b.rates[c]?.sell || b.rates[c]?.buy) {
        bankData.rates[c] = {
          buy: parseFloat(b.rates[c]?.buy || 0),
          sell: parseFloat(b.rates[c]?.sell || 0),
        };
      }
    }
    result.banks.push(bankData);
  }

  return result;
}

async function cheapestBank(currency = 'usd') {
  const banks = await fetchAll();
  const sorted = banks
    .filter(b => b.name !== 'MongolBank' && b.name !== 'StateBank' && b.rates[currency]?.sell)
    .sort((a, b) => a.rates[currency].sell - b.rates[currency].sell);
  
  return sorted.map((b, i) => ({
    rank: i + 1,
    bank: b.mn,
    buy: parseFloat(b.rates[currency].buy || 0),
    sell: parseFloat(b.rates[currency].sell),
    spread: parseFloat((b.rates[currency].sell - b.rates[currency].buy).toFixed(2)),
  }));
}

// ─── API Documentation Message ───────────────────────────────────

function apiDocsMessage() {
  return `🔌 <b>KhaanRate API — Ханшны мэдээлэл</b>

📊 <b>Боломжууд:</b>
• Одоогийн ханш (7 валют, 3 банк)
• Банк харьцуулалт
• Хамгийн хямд банк
• Өдөр тутмын JSON feed

💰 <b>Төлөвлөгөөнүүд:</b>

🆓 <b>Үнэгүй</b> — 100 хүсэлт/өдөр
₮0/сар — Хувь хүнд зориулсан

⭐ <b>Pro</b> — 10,000 хүсэлт/өдөр
₮50,000/сар — Жижиг бизнес, апп

🏢 <b>Enterprise</b> — Хязгааргүй
₮500,000/сар — Банк, финтех

📌 <b>Хэрхэн ашиглах:</b>
1. /api_key — API түлхүүр авах
2. GET https://khaanrate.api/rates?key=YOUR_KEY
3. JSON хариулт авах

🔧 <b>Жишээ хариулт:</b>
<code>{
  "timestamp": "2026-04-14",
  "official": {"usd": 3573.09},
  "banks": [
    {"name": "GolomtBank",
     "rates": {"usd": {"buy": 3565, "sell": 3585}}}
  ]
}</code>

📝 API баримтжаарай → /api_docs`;
}

function apiPricingMessage() {
  return `🔌 <b>KhaanRate API Үнэ</b>

━━━━━━━━━━━━━━━━━━━━
🆓 ҮНЭГҮЙ
├ 100 хүсэлт/өдөр
├ Одоогийн ханш
└ ₮0/сар
━━━━━━━━━━━━━━━━━━━━
⭐ PRO
├ 10,000 хүсэлт/өдөр
├ Банк харьцуулалт
├ Хамгийн хямд банк
├ Historical rates*
└ ₮50,000/сар ($15)
━━━━━━━━━━━━━━━━━━━━
🏢 ENTERPRISE
├ Хязгааргүй хүсэлт
├ Webhook (ханш өөрчлөгдвөл push)
├ White-label боломж
├ Priority support
└ ₮500,000/сар ($140)
━━━━━━━━━━━━━━━━━━━━

📌 10 хэрэглэгчтэй бол сард ₮500,000
📌 50 хэрэглэгчтэй бол сард ₮2,500,000
📌 100 хэрэглэгчтэй бол сард ₮5,000,000

💰 Эхлэх → /api_key`;
}

module.exports = { 
  currentRates, cheapestBank, generateApiKey, getApiKey, incrementUsage,
  apiDocsMessage, apiPricingMessage, PLANS 
};

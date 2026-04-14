require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');

// ─── Config ─────────────────────────────────────────────────────────
const BOT_TOKEN = process.env.BOT_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const BANKS_API = 'https://mongolian-bank-exchange-rate-6620c122ff22.herokuapp.com';
const FX_API = 'https://open.er-api.com/v6/latest/USD'; // Fallback
const MONGOLBANK_API = 'https://www.mongolbank.mn/mn/currency-rates';

const bot = new TelegramBot(BOT_TOKEN, { polling: true });
const supabase = SUPABASE_URL ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;

// ─── Constants ─────────────────────────────────────────────────────
const BANK_NAMES = {
  KhanBank: '🦁 Хаан Банк',
  GolomtBank: '🏦 Голомт Банк',
  TDBM: '🏛️ ХХБ',
  XacBank: '💚 Хас Банк',
  StateBank: '🇲🇳 Төрийн Банк',
  CapitronBank: '💼 Капитрон Банк',
  CKBank: '⚔️ Чингис Хаан Банк',
  BogdBank: '🏔️ Богд Банк',
  ArigBank: '🔹 Ариг Банк',
  NIBank: '🔄 ҮХОБ',
  TransBank: '🚀 Транс Банк',
  MBank: '📱 М Банк',
  MongolBank: '🏛️ Монгол Банк',
};

const PRIORITY_CURRENCIES = ['usd', 'cny', 'eur', 'rub', 'jpy', 'krw', 'gbp'];
const CURRENCY_FLAGS = { usd: '🇺🇸', cny: '🇨🇳', eur: '🇪🇺', rub: '🇷🇺', jpy: '🇯🇵', krw: '🇰🇷', gbp: '🇬🇧' };

// ─── Rate fetching ──────────────────────────────────────────────────
let cachedBankRates = null;
let cachedBankAt = 0;
let cachedFxRates = null;
let cachedFxAt = 0;

// Official rates from Mongolbank (via Puppeteer) with open.er-api.com fallback
async function getOfficialRates() {
  const now = Date.now();
  if (cachedFxRates && now - cachedFxAt < 3600000) return cachedFxRates; // 1hr cache

  // Try Mongolbank first (official rates)
  try {
    const puppeteer = require('puppeteer');
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    
    let rateData = null;
    page.on('response', async (response) => {
      if (response.url().includes('currency-rates/data')) {
        try { rateData = await response.json(); } catch(e) {}
      }
    });
    
    await page.goto(MONGOLBANK_API, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 5000));
    await browser.close();
    
    if (rateData && rateData.success && rateData.data) {
      const latest = rateData.data[rateData.data.length - 1];
      // Parse formatted numbers like "3,573.09"
      const parseNum = s => parseFloat((s || '0').replace(/,/g, ''));
      cachedFxRates = {
        _date: latest.RATE_DATE,
        _source: 'Монголбанк',
        usd: { cash: { buy: parseNum(latest.USD), sell: parseNum(latest.USD) } },
        cny: { cash: { buy: parseNum(latest.CNY), sell: parseNum(latest.CNY) } },
        eur: { cash: { buy: parseNum(latest.EUR), sell: parseNum(latest.EUR) } },
        rub: { cash: { buy: parseNum(latest.RUB), sell: parseNum(latest.RUB) } },
        jpy: { cash: { buy: parseNum(latest.JPY), sell: parseNum(latest.JPY) } },
        krw: { cash: { buy: parseNum(latest.KRW), sell: parseNum(latest.KRW) } },
        gbp: { cash: { buy: parseNum(latest.GBP), sell: parseNum(latest.GBP) } },
      };
      cachedFxAt = now;
      console.log('📊 Mongolbank rates loaded:', latest.RATE_DATE);
      return cachedFxRates;
    }
  } catch (err) {
    console.error('Mongolbank scrape error:', err.message);
  }

  // Fallback to open.er-api.com
  try {
    const { data } = await axios.get(FX_API, { timeout: 10000 });
    if (!data || !data.rates) throw new Error('No rates');
    const mnt = data.rates.MNT;
    cachedFxRates = {
      _date: data.time_last_update_utc,
      _source: 'open.er-api.com',
      usd: { cash: { buy: Math.round(mnt), sell: Math.round(mnt) } },
      cny: { cash: { buy: Math.round(mnt / data.rates.CNY * 100) / 100, sell: Math.round(mnt / data.rates.CNY * 100) / 100 } },
      eur: { cash: { buy: Math.round(mnt / data.rates.EUR), sell: Math.round(mnt / data.rates.EUR) } },
      rub: { cash: { buy: Math.round(mnt / data.rates.RUB * 100) / 100, sell: Math.round(mnt / data.rates.RUB * 100) / 100 } },
      jpy: { cash: { buy: Math.round(mnt / data.rates.JPY * 100) / 100, sell: Math.round(mnt / data.rates.JPY * 100) / 100 } },
      krw: { cash: { buy: Math.round(mnt / data.rates.KRW * 100) / 100, sell: Math.round(mnt / data.rates.KRW * 100) / 100 } },
      gbp: { cash: { buy: Math.round(mnt / data.rates.GBP), sell: Math.round(mnt / data.rates.GBP) } },
    };
    cachedFxAt = now;
    return cachedFxRates;
  } catch (err) {
    console.error('FX API error:', err.message);
    return cachedFxRates;
  }
}

async function getBankRates() {
  const now = Date.now();
  if (cachedBankRates && now - cachedBankAt < 3600000) return cachedBankRates; // 1hr cache

  try {
    const { fetchAllBanks, fetchGolomt } = require('./bank-scraper');
    const liveRates = await fetchAllBanks();
    if (liveRates && liveRates.length > 0) {
      cachedBankRates = liveRates;
      cachedBankAt = now;
      return cachedBankRates;
    }
  } catch (err) {
    console.error('Live bank scrape error:', err.message);
  }

  // Fallback to Heroku API
  try {
    const { data } = await axios.get(`${BANKS_API}/rates/latest`, { timeout: 15000 });
    cachedBankRates = data;
    cachedBankAt = now;
    return data;
  } catch (err) {
    console.error('Bank API error:', err.message);
    return cachedBankRates || [];
  }
}

function getBestRates(bankRates, currency) {
  const results = [];
  for (const bank of bankRates) {
    if (!bank.rates || !bank.rates[currency]) continue;
    const r = bank.rates[currency];
    if (r.cash && r.cash.buy > 0 && r.cash.sell > 0) {
      results.push({ bank: bank.bank_name, buy: r.cash.buy, sell: r.cash.sell });
    } else if (r.noncash && r.noncash.buy > 0 && r.noncash.sell > 0) {
      results.push({ bank: bank.bank_name, buy: r.noncash.buy, sell: r.noncash.sell, noncash: true });
    }
  }
  results.sort((a, b) => a.sell - b.sell);
  return results;
}

// ─── Format helpers ─────────────────────────────────────────────────
async function formatOfficialRates() {
  const rates = await getOfficialRates();
  if (!rates) return '📊 Ханшны мэдээлэл одоогоор байхгүй байна.';

  const bankRates = await getBankRates();
  const source = rates._source || '';
  const dateStr = rates._date || '';
  let msg = `<b>📊 ${source === 'Монголбанк' ? 'Монголбанкны албан ёсны ханш' : 'Төгрөгийн ханш'}</b>`;
  if (dateStr) msg += `\n📅 ${dateStr}\n`;
  msg += '\n';
  for (const code of PRIORITY_CURRENCIES) {
    const r = rates[code];
    if (r) {
      const flag = CURRENCY_FLAGS[code] || '💱';
      const rate = r.cash.buy;
      msg += `${flag} ${code.toUpperCase()}: ₮${rate.toLocaleString()}`;

      const bestRates = getBestRates(bankRates, code);
      if (bestRates.length > 0) {
        const cheapest = bestRates[0];
        const bankLabel = BANK_NAMES[cheapest.bank] || cheapest.bank;
        msg += `\n  └ 🏆 ${bankLabel}: ₮${cheapest.sell.toLocaleString()}`;
      }
      msg += '\n';
    }
  }
  return msg;
}

function formatBankComparison(bankRates, currency) {
  const rates = getBestRates(bankRates, currency);
  if (rates.length === 0) return `❌ ${currency.toUpperCase()} ханш олдсонгүй.`;

  const flag = CURRENCY_FLAGS[currency] || '💱';
  let msg = `<b>${flag} ${currency.toUpperCase()} — Банкуудын харьцуулалт</b>\n\n`;
  msg += 'Хямд (авах) → Үнэт (зарах)\n\n';

  for (let i = 0; i < Math.min(rates.length, 8); i++) {
    const r = rates[i];
    const bankName = BANK_NAMES[r.bank] || r.bank;
    const nc = r.noncash ? ' 📱' : '';
    let badge = '';
    if (i === 0) badge = ' 🏆';
    else if (i === rates.length - 1 && rates.length > 2) badge = ' 📉';
    msg += `${bankName}${nc}${badge}\n  Авах: ₮${r.sell.toLocaleString()} | Зарах: ₮${r.buy.toLocaleString()}\n`;
  }

  if (rates.length >= 2) {
    const diff = rates[rates.length - 1].sell - rates[0].sell;
    msg += `\n💡 Хамгийн хямд болон үнэт банкны зөрүү: ₮${diff.toLocaleString()}`;
  }

  return msg;
}

// ─── User management ────────────────────────────────────────────────
async function getUser(chatId) {
  if (!supabase) return { chat_id: chatId, alert_count: 0 };
  const { data } = await supabase.from('users').select('*').eq('chat_id', chatId).single();
  return data || { chat_id: chatId, alert_count: 0 };
}

async function getAlerts(chatId) {
  if (!supabase) return [];
  const { data } = await supabase.from('alerts').select('*').eq('chat_id', chatId).eq('active', true);
  return data || [];
}

async function createAlert(chatId, currency, targetRate, direction) {
  if (!supabase) return { id: 'local' };
  const user = await getUser(chatId);

  const { data } = await supabase.from('alerts').insert({
    chat_id: chatId, currency, target_rate: targetRate, direction, active: true,
  }).select().single();

  await supabase.from('users').update({ alert_count: (user.alert_count || 0) + 1 }).eq('chat_id', chatId);
  return data;
}

async function deleteAlert(chatId, alertId) {
  if (!supabase) return false;
  await supabase.from('alerts').delete().eq('id', alertId).eq('chat_id', chatId);
  const user = await getUser(chatId);
  if (user.alert_count > 0) {
    await supabase.from('users').update({ alert_count: user.alert_count - 1 }).eq('chat_id', chatId);
  }
  return true;
}

// ─── Send helper ────────────────────────────────────────────────────
function send(chatId, text, extra = {}) {
  extra.parse_mode = 'HTML';
  return bot.sendMessage(chatId, text, extra);
}

// ─── Handlers ───────────────────────────────────────────────────────

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  send(chatId, '🦁 <b>KhaanRate — Төгрөгийн ханш</b>\n\nМонголын 13 банкны ханш харьцуулах, анхааруулга тохируулах.\nДоорх командыг сонгоно уу:', {
    reply_markup: {
      keyboard: [
        [{ text: '📊 Ханш' }, { text: '🏦 Банк харьцуулалт' }],
        [{ text: '🔔 Анхааруулга' }, { text: '❓ Тусламж' }],
      ],
      resize_keyboard: true,
    },
  });

  if (supabase) {
    supabase.from('users').upsert({
      chat_id: chatId, username: msg.chat.username,
      first_name: msg.chat.first_name, language: 'mn',
    }, { onConflict: 'chat_id' }).then(() => {});
  }
});

// 📊 Ханш
bot.onText(/📊 Ханш|\/rate/, async (msg) => {
  const bankRates = await getBankRates();
  send(msg.chat.id, await formatOfficialRates());
});

// 🏦 Банк харьцуулалт
function showCompareMenu(chatId) {
  bot.sendMessage(chatId, '💱 Харьцуулах валют сонгоно уу:', {
    reply_markup: {
      inline_keyboard: [
        [{ text: '🇺🇸 USD', callback_data: 'compare_usd' }, { text: '🇨🇳 CNY', callback_data: 'compare_cny' }],
        [{ text: '🇪🇺 EUR', callback_data: 'compare_eur' }, { text: '🇷🇺 RUB', callback_data: 'compare_rub' }],
        [{ text: '🇯🇵 JPY', callback_data: 'compare_jpy' }, { text: '🇰🇷 KRW', callback_data: 'compare_krw' }],
        [{ text: '🇬🇧 GBP', callback_data: 'compare_gbp' }],
      ],
    },
  });
}

bot.onText(/Банк харьцуулалт/, (msg) => showCompareMenu(msg.chat.id));
bot.onText(/\/banks/, (msg) => showCompareMenu(msg.chat.id));

// /compare
bot.onText(/\/compare (.+)/, async (msg, match) => {
  const currency = match[1].toLowerCase().trim();
  if (!PRIORITY_CURRENCIES.includes(currency)) {
    send(msg.chat.id, `❌ Тийм валют байхгүй. Боломжит: ${PRIORITY_CURRENCIES.map(c => c.toUpperCase()).join(', ')}`);
    return;
  }
  const bankRates = await getBankRates();
  send(msg.chat.id, formatBankComparison(bankRates, currency));
});

// Callbacks
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;

  // Bank comparison
  if (query.data.startsWith('compare_')) {
    const currency = query.data.replace('compare_', '');
    const bankRates = await getBankRates();
    bot.answerCallbackQuery(query.id);
    send(chatId, formatBankComparison(bankRates, currency));
    return;
  }

  // Delete alert
  if (query.data.startsWith('delete_alert_')) {
    const alertId = query.data.replace('delete_alert_', '');
    await deleteAlert(chatId, alertId);
    bot.answerCallbackQuery(query.id, { text: '🗑️ Анхааруулга устгагдлаа' });
    send(chatId, '✅ Анхааруулга устгагдлаа.');
    return;
  }
});

// 🔔 Анхааруулга
bot.onText(/🔔 Анхааруулга/, (msg) => {
  send(msg.chat.id, '🔔 <b>Анхааруулга тохируулах</b>\n\nХанш хэдэн төгрөгт хүрэхэд анхааруулах вэ?\n\n<b>Жишээ:</b>\n/alert USD 3580 — USD 3580-д хүрэхэд\n/alert CNY below 505 — CNY 505-аас доош унахад\n\n/alerts — одоогийн анхааруулгууд');
});

// /alert
bot.onText(/\/alert (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const input = match[1].toUpperCase().trim();

  const parsed = input.match(/^(USD|CNY|EUR|RUB|JPY|KRW|GBP)\s+(ABOVE|BELOW)?\s*(\d+\.?\d*)$/i);
  if (!parsed) {
    send(chatId, '❌ Буруу формат. Жишээ: /alert USD 3580');
    return;
  }

  const [, currency, dir, rateStr] = parsed;
  const direction = (dir || 'above').toLowerCase();
  const targetRate = parseFloat(rateStr);

  const alert = await createAlert(chatId, currency, targetRate, direction);

  const flag = CURRENCY_FLAGS[currency.toLowerCase()] || '💱';
  const dirMn = direction === 'above' ? 'дээш' : 'доош';
  send(chatId, `✅ Анхааруулга үүслээ!\n${flag} ${currency} ${dirMn} ₮${targetRate.toLocaleString()} хүрэхэд анхааруулна.`);
});

// /alerts
bot.onText(/\/alerts/, async (msg) => {
  const alerts = await getAlerts(msg.chat.id);
  if (alerts.length === 0) {
    send(msg.chat.id, 'Анхааруулга байхгүй байна. /alert командыг ашиглана уу.');
    return;
  }

  let text = '🔔 <b>Таны анхааруулгууд:</b>\n\n';
  const buttons = [];
  for (const a of alerts) {
    const flag = CURRENCY_FLAGS[a.currency.toLowerCase()] || '💱';
    const dir = a.direction === 'above' ? '↑' : '↓';
    text += `${flag} ${a.currency} ${dir} ₮${a.target_rate.toLocaleString()}\n`;
    buttons.push([{ text: `🗑️ ${a.currency} ${dir} ₮${a.target_rate.toLocaleString()}`, callback_data: `delete_alert_${a.id}` }]);
  }

  send(msg.chat.id, text, { reply_markup: { inline_keyboard: buttons } });
});

// ❓ Тусламж
bot.onText(/❓ Тусламж|\/help/, (msg) => {
  send(msg.chat.id, '❓ <b>Тусламж</b>\n\n📊 <b>Ханш</b> — Монголбанкны ханш + хамгийн хямд банк\n🏦 <b>Банк харьцуулалт</b> — 13 банк харьцуулах\n/banks эсвэл /compare USD\n/alert USD 3580 — Анхааруулга\n/alerts — Анхааруулгууд\n/best USD — Хамгийн хямд банк\n/history USD — 7 хоногийн ханш\n\n💬 Санал хүсэлт: @khaanrate_support');
});

// /best
bot.onText(/\/best (.+)/, async (msg, match) => {
  const currency = match[1].toLowerCase().trim();
  if (!PRIORITY_CURRENCIES.includes(currency)) {
    send(msg.chat.id, `❌ Тийм валют байхгүй. Боломжит: ${PRIORITY_CURRENCIES.map(c => c.toUpperCase()).join(', ')}`);
    return;
  }

  const bankRates = await getBankRates();
  const rates = getBestRates(bankRates, currency);
  if (rates.length === 0) {
    send(msg.chat.id, `❌ ${currency.toUpperCase()} ханш олдсонгүй.`);
    return;
  }

  const flag = CURRENCY_FLAGS[currency] || '💱';
  const cheapest = rates[0];
  const bestName = BANK_NAMES[cheapest.bank] || cheapest.bank;
  const mostExpensive = rates[rates.length - 1];
  const worstName = BANK_NAMES[mostExpensive.bank] || mostExpensive.bank;

  let text = `${flag} <b>${currency.toUpperCase()} — Шилдэг санал</b>\n\n`;
  text += `🟢 Валют хямд авах: ${bestName}\n  ₮${cheapest.sell.toLocaleString()}\n\n`;
  text += `🔴 Валют үнэт зарах: ${worstName}\n  ₮${mostExpensive.buy.toLocaleString()}\n\n`;

  if (rates.length >= 2) {
    const spread = mostExpensive.sell - cheapest.sell;
    text += `💡 Банк хооронд зөрүү: ₮${spread.toLocaleString()}`;
  }

  send(msg.chat.id, text);
});

// /history
bot.onText(/\/history (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const currency = match[1].toLowerCase().trim();

  if (!PRIORITY_CURRENCIES.includes(currency)) {
    send(chatId, `❌ Тийм валют байхгүй. Боломжит: ${PRIORITY_CURRENCIES.map(c => c.toUpperCase()).join(', ')}`);
    return;
  }

  try {
    const { data } = await axios.get(`${BANKS_API}/rates/bank/MongolBank`, { timeout: 10000 });
    if (!data || data.length === 0) {
      send(chatId, '❌ Түүхэн мэдээлэл олдсонгүй.');
      return;
    }

    const recent = data.slice(-7).reverse();
    const flag = CURRENCY_FLAGS[currency] || '💱';
    let text = `${flag} <b>${currency.toUpperCase()} — Сүүлийн 7 хоног</b>\n\n`;

    for (const entry of recent) {
      const r = entry.rates[currency];
      if (r) {
        const rate = r.cash ? r.cash.buy : (r.noncash ? r.noncash.buy : 0);
        if (rate > 0) {
          text += `📅 ${entry.date}: ₮${rate.toLocaleString()}\n`;
        }
      }
    }

    if (recent.length >= 2) {
      const first = recent[recent.length - 1];
      const last = recent[0];
      const firstRate = first.rates[currency]?.cash?.buy || first.rates[currency]?.noncash?.buy || 0;
      const lastRate = last.rates[currency]?.cash?.buy || last.rates[currency]?.noncash?.buy || 0;
      if (firstRate > 0 && lastRate > 0) {
        const diff = lastRate - firstRate;
        const pct = ((diff / firstRate) * 100).toFixed(2);
        const trend = diff > 0 ? '📈' : diff < 0 ? '📉' : '➡️';
        text += `\n${trend} Өөрчлөлт: ${diff > 0 ? '+' : ''}${pct}%`;
      }
    }

    send(chatId, text);
  } catch (err) {
    send(chatId, '❌ Түүхэн мэдээлэл татаж чадсангүй.');
  }
});

// ─── Alert checker (every 5 min) ─────────────────────────────────────
async function checkAlerts() {
  if (!supabase) return;
  const officialRates = await getOfficialRates();
  if (!officialRates) return;

  const { data: alerts } = await supabase.from('alerts').select('*').eq('active', true);
  if (!alerts) return;

  for (const alert of alerts) {
    const cur = alert.currency.toLowerCase();
    const r = officialRates[cur];
    if (!r) continue;

    const currentRate = r.cash.buy;
    if (currentRate <= 0) continue;

    const triggered =
      (alert.direction === 'above' && currentRate >= alert.target_rate) ||
      (alert.direction === 'below' && currentRate <= alert.target_rate);

    if (triggered) {
      const flag = CURRENCY_FLAGS[cur] || '💱';
      const dir = alert.direction === 'above' ? 'дээш' : 'доош';
      send(alert.chat_id, `🔔 <b>Анхааруулга!</b>\n${flag} ${alert.currency} ${dir} ₮${alert.target_rate.toLocaleString()} хүрлээ!\nОдоогийн ханш: ₮${currentRate.toLocaleString()}`);
      await supabase.from('alerts').update({ active: false, triggered_at: new Date().toISOString() }).eq('id', alert.id);
    }
  }
}

setInterval(checkAlerts, 300000);

// ─── Error handling ─────────────────────────────────────────────────
bot.on('polling_error', (err) => {
  console.error('Polling error:', err.message);
});

// ─── Start ──────────────────────────────────────────────────────────
console.log('🦁 KhaanRate bot is running...');
console.log('📡 Supabase:', supabase ? 'connected' : 'not configured');
console.log('🏦 Bank API:', BANKS_API);

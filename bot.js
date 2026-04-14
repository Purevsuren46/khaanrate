require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');

// ─── Config ─────────────────────────────────────────────────────────
const BOT_TOKEN = process.env.BOT_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const GOLOMT_API = 'https://www.golomtbank.com/api/exchangerateinfo';
const FX_API = 'https://open.er-api.com/v6/latest/USD';
const MONGOLBANK_URL = 'https://www.mongolbank.mn/mn/currency-rates';

const bot = new TelegramBot(BOT_TOKEN, { polling: true });
const supabase = SUPABASE_URL ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;

// ─── Constants ─────────────────────────────────────────────────────
const BANK_NAMES = {
  GolomtBank: '🏦 Голомт Банк',
  MongolBank: '🏛️ Монгол Банк',
};

const PRIORITY_CURRENCIES = ['usd', 'cny', 'eur', 'rub', 'jpy', 'krw', 'gbp'];
const CURRENCY_FLAGS = { usd: '🇺🇸', cny: '🇨🇳', eur: '🇪🇺', rub: '🇷🇺', jpy: '🇯🇵', krw: '🇰🇷', gbp: '🇬🇧' };
const CUR_MAP = { usd: 'USD', cny: 'CNY', eur: 'EUR', rub: 'RUB', jpy: 'JPY', krw: 'KRW', gbp: 'GBP' };

// ─── Rate fetching ──────────────────────────────────────────────────
let cachedMongolBank = null;
let cachedMongolBankAt = 0;
let cachedGolomt = null;
let cachedGolomtAt = 0;

function todayStr() {
  return new Date().toISOString().slice(0, 10).replace(/-/g, '');
}

// Mongolbank official rates (via Puppeteer, 1hr cache)
async function getMongolbankRates() {
  const now = Date.now();
  if (cachedMongolBank && now - cachedMongolBankAt < 3600000) return cachedMongolBank;

  try {
    const puppeteer = require('puppeteer');
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();

    let rateData = null;
    page.on('response', async (response) => {
      if (response.url().includes('currency-rates/data')) {
        try { rateData = await response.json(); } catch (e) {}
      }
    });

    await page.goto(MONGOLBANK_URL, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 5000));
    await browser.close();

    if (rateData && rateData.success && rateData.data) {
      const latest = rateData.data[rateData.data.length - 1];
      const parseNum = s => parseFloat((s || '0').replace(/,/g, ''));
      cachedMongolBank = {
        _date: latest.RATE_DATE,
        usd: parseNum(latest.USD), cny: parseNum(latest.CNY), eur: parseNum(latest.EUR),
        rub: parseNum(latest.RUB), jpy: parseNum(latest.JPY), krw: parseNum(latest.KRW),
        gbp: parseNum(latest.GBP),
      };
      cachedMongolBankAt = now;
      console.log('📊 Mongolbank loaded:', latest.RATE_DATE);
      return cachedMongolBank;
    }
  } catch (err) {
    console.error('Mongolbank error:', err.message.substring(0, 80));
  }

  // Fallback to open.er-api.com
  try {
    const { data } = await axios.get(FX_API, { timeout: 10000 });
    if (!data || !data.rates) throw new Error('No rates');
    const mnt = data.rates.MNT;
    cachedMongolBank = {
      _date: data.time_last_update_utc,
      usd: Math.round(mnt), cny: Math.round(mnt / data.rates.CNY * 100) / 100,
      eur: Math.round(mnt / data.rates.EUR), rub: Math.round(mnt / data.rates.RUB * 100) / 100,
      jpy: Math.round(mnt / data.rates.JPY * 100) / 100, krw: Math.round(mnt / data.rates.KRW * 100) / 100,
      gbp: Math.round(mnt / data.rates.GBP),
    };
    cachedMongolBankAt = now;
    return cachedMongolBank;
  } catch (err) {
    console.error('FX API error:', err.message);
    return cachedMongolBank;
  }
}

// Golomt Bank rates (via API, fast, 30min cache)
async function getGolomtRates() {
  const now = Date.now();
  if (cachedGolomt && now - cachedGolomtAt < 1800000) return cachedGolomt;

  try {
    const date = todayStr();
    const rates = {};
    for (const code of PRIORITY_CURRENCIES) {
      const cur = CUR_MAP[code];
      const [buyRes, sellRes] = await Promise.all([
        axios.get(`${GOLOMT_API}?date=${date}&from=${cur}&to=MNT&type=cash_buy`, { timeout: 5000 }),
        axios.get(`${GOLOMT_API}?date=${date}&from=${cur}&to=MNT&type=cash_sell`, { timeout: 5000 }),
      ]);
      const buy = parseFloat(buyRes.data?.rate?.cvalue?.[0] || 0);
      const sell = parseFloat(sellRes.data?.rate?.cvalue?.[0] || 0);
      if (buy > 0 || sell > 0) rates[code] = { buy, sell };
    }
    if (Object.keys(rates).length > 0) {
      cachedGolomt = rates;
      cachedGolomtAt = now;
      console.log('🏦 Golomt loaded:', Object.keys(rates).length, 'currencies');
      return cachedGolomt;
    }
  } catch (err) {
    console.error('Golomt error:', err.message.substring(0, 80));
  }
  return cachedGolomt;
}

// ─── Format ─────────────────────────────────────────────────────────
function send(chatId, text, extra = {}) {
  extra.parse_mode = 'HTML';
  return bot.sendMessage(chatId, text, extra);
}

async function formatRatesMessage() {
  const mb = await getMongolbankRates();
  const golomt = await getGolomtRates();
  if (!mb) return '📊 Ханшны мэдээлэл одоогоор байхгүй байна.';

  let msg = '<b>📊 Монголбанкны албан ёсны ханш</b>\n';
  if (mb._date) msg += `📅 ${mb._date}\n`;
  msg += '\n';

  for (const code of PRIORITY_CURRENCIES) {
    const flag = CURRENCY_FLAGS[code] || '💱';
    const rate = mb[code];
    if (rate) {
      msg += `${flag} ${code.toUpperCase()}: ₮${rate.toLocaleString()}`;
      if (golomt && golomt[code]) {
        msg += `\n  └ 🏦 Голомт: Авах ₮${golomt[code].sell.toLocaleString()} | Зарах ₮${golomt[code].buy.toLocaleString()}`;
      }
      msg += '\n';
    }
  }
  return msg;
}

async function formatComparisonMessage(currency) {
  const flag = CURRENCY_FLAGS[currency] || '💱';
  const mb = await getMongolbankRates();
  const golomt = await getGolomtRates();

  let msg = `${flag} <b>${currency.toUpperCase()} — Харьцуулалт</b>\n\n`;

  // Mongolbank
  if (mb && mb[currency]) {
    msg += `🏛️ Монгол Банк: ₮${mb[currency].toLocaleString()}\n`;
  }

  // Golomt
  if (golomt && golomt[currency]) {
    const g = golomt[currency];
    const cheapest = g.sell <= (mb ? mb[currency] : 99999);
    msg += `🏦 Голомт Банк: Авах ₮${g.sell.toLocaleString()} | Зарах ₮${g.buy.toLocaleString()}`;
    if (cheapest) msg += ' 🏆';
    msg += '\n';
  }

  if (mb && golomt && golomt[currency]) {
    const diff = golomt[currency].sell - mb[currency];
    msg += `\n💡 Голомт vs Монголбанк: ${diff > 0 ? '+' : ''}₮${diff.toLocaleString()}`;
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
  const { data } = await supabase.from('alerts').insert({
    chat_id: chatId, currency, target_rate: targetRate, direction, active: true,
  }).select().single();
  return data;
}

async function deleteAlert(chatId, alertId) {
  if (!supabase) return false;
  await supabase.from('alerts').delete().eq('id', alertId).eq('chat_id', chatId);
  return true;
}

// ─── Handlers ───────────────────────────────────────────────────────

bot.onText(/\/start/, (msg) => {
  send(msg.chat.id, '🦁 <b>KhaanRate — Төгрөгийн ханш</b>\n\nМонголбанкны албан ёсны ханш + Голомт Банкны харьцуулалт.\nДоорх командыг сонгоно уу:', {
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
      chat_id: msg.chat.id, username: msg.chat.username,
      first_name: msg.chat.first_name, language: 'mn',
    }, { onConflict: 'chat_id' }).then(() => {});
  }
});

// 📊 Ханш
bot.onText(/📊 Ханш|\/rate/, async (msg) => {
  send(msg.chat.id, '⏳ Ханш татаж байна...');
  send(msg.chat.id, await formatRatesMessage());
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

bot.onText(/\/compare (.+)/, async (msg, match) => {
  const currency = match[1].toLowerCase().trim();
  if (!PRIORITY_CURRENCIES.includes(currency)) {
    send(msg.chat.id, `❌ Тийм валют байхгүй. Боломжит: ${PRIORITY_CURRENCIES.map(c => c.toUpperCase()).join(', ')}`);
    return;
  }
  send(msg.chat.id, await formatComparisonMessage(currency));
});

// Callbacks
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;

  if (query.data.startsWith('compare_')) {
    const currency = query.data.replace('compare_', '');
    bot.answerCallbackQuery(query.id);
    send(chatId, await formatComparisonMessage(currency));
    return;
  }

  if (query.data.startsWith('delete_alert_')) {
    const alertId = query.data.replace('delete_alert_', '');
    await deleteAlert(chatId, alertId);
    bot.answerCallbackQuery(query.id, { text: '🗑️ Устгагдлаа' });
    send(chatId, '✅ Анхааруулга устгагдлаа.');
    return;
  }
});

// 🔔 Анхааруулга
bot.onText(/🔔 Анхааруулга/, (msg) => {
  send(msg.chat.id, '🔔 <b>Анхааруулга тохируулах</b>\n\n<b>Жишээ:</b>\n/alert USD 3580 — USD 3580-д хүрэхэд\n/alert CNY below 505 — CNY 505-аас доош унахад\n\n/alerts — анхааруулгууд харах');
});

bot.onText(/\/alert (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const input = match[1].toUpperCase().trim();
  const parsed = input.match(/^(USD|CNY|EUR|RUB|JPY|KRW|GBP)\s+(ABOVE|BELOW)?\s*(\d+\.?\d*)$/i);
  if (!parsed) { send(chatId, '❌ Буруу формат. Жишээ: /alert USD 3580'); return; }

  const [, currency, dir, rateStr] = parsed;
  const direction = (dir || 'above').toLowerCase();
  const targetRate = parseFloat(rateStr);
  await createAlert(chatId, currency, targetRate, direction);

  const flag = CURRENCY_FLAGS[currency.toLowerCase()] || '💱';
  const dirMn = direction === 'above' ? 'дээш' : 'доош';
  send(chatId, `✅ Анхааруулга үүслээ!\n${flag} ${currency} ${dirMn} ₮${targetRate.toLocaleString()} хүрэхэд анхааруулна.`);
});

bot.onText(/\/alerts/, async (msg) => {
  const alerts = await getAlerts(msg.chat.id);
  if (alerts.length === 0) { send(msg.chat.id, 'Анхааруулга байхгүй. /alert командыг ашиглана уу.'); return; }

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
  send(msg.chat.id, '❓ <b>Тусламж</b>\n\n📊 <b>Ханш</b> — Монголбанк + Голомт Банк\n🏦 <b>Банк харьцуулалт</b> — /banks эсвэл /compare USD\n/alert USD 3580 — Анхааруулга\n/alerts — Анхааруулгууд\n/best USD — Хамгийн хямд\n\n💬 @khaanrate_support');
});

// /best
bot.onText(/\/best (.+)/, async (msg, match) => {
  const currency = match[1].toLowerCase().trim();
  if (!PRIORITY_CURRENCIES.includes(currency)) {
    send(msg.chat.id, `❌ Тийм валют байхгүй.`);
    return;
  }

  const mb = await getMongolbankRates();
  const golomt = await getGolomtRates();
  const flag = CURRENCY_FLAGS[currency] || '💱';
  const official = mb ? mb[currency] : 0;
  const gBuy = golomt?.[currency]?.buy || 0;
  const gSell = golomt?.[currency]?.sell || 0;

  let text = `${flag} <b>${currency.toUpperCase()} — Шилдэг</b>\n\n`;
  if (gSell > 0) text += `🟢 Авах: 🏦 Голомт Банк ₮${gSell.toLocaleString()}\n`;
  if (gBuy > 0) text += `🔴 Зарах: 🏦 Голомт Банк ₮${gBuy.toLocaleString()}\n`;
  if (official > 0 && gSell > 0) {
    const diff = gSell - official;
    text += `\n💡 Голомт vs Монголбанк: ${diff > 0 ? '+' : ''}₮${diff.toLocaleString()}`;
  }
  send(msg.chat.id, text);
});

// ─── Alert checker (every 5 min) ─────────────────────────────────────
async function checkAlerts() {
  if (!supabase) return;
  const mb = await getMongolbankRates();
  if (!mb) return;

  const { data: alerts } = await supabase.from('alerts').select('*').eq('active', true);
  if (!alerts) return;

  for (const alert of alerts) {
    const cur = alert.currency.toLowerCase();
    const currentRate = mb[cur];
    if (!currentRate) continue;

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
  console.error('Polling error:', err.message?.substring(0, 80));
});

// ─── Start ──────────────────────────────────────────────────────────
console.log('🦁 KhaanRate bot is running...');
console.log('📡 Supabase:', supabase ? 'connected' : 'not configured');

require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');

// ─── Config ─────────────────────────────────────────────────────────
const BOT_TOKEN = process.env.BOT_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const PREMIUM_PRICE = 9900; // MNT ~$2.99/month
const BANK_OF_MONGOLIA_API = 'https://www.mongolbank.mn/dblistofficialdailyrate.nm';

const bot = new TelegramBot(BOT_TOKEN, { polling: true });
const supabase = SUPABASE_URL ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;

// ─── Mongolian UI ───────────────────────────────────────────────────
const FLAGS = { USD: '🇺🇸', CNY: '🇨🇳', EUR: '🇪🇺', RUB: '🇷🇺', JPY: '🇯🇵', KRW: '🇰🇷', GBP: '🇬🇧' };
const MN = {
  welcome: '🦁 *KhaanRate — Төгрөгийн ханш*\n\nМонголбанкны албан ёсны ханш мэдээлэл.\nЭхлэхийн тулд доорх командыг сонгоно уу:',
  rate: '📊 Ханш',
  alert: '🔔 Анхааруулга',
  premium: '👑 Премиум',
  help: '❓ Тусламж',
  noAlerts: 'Анхааруулга байхгүй байна. Шинээр үүсгэхийн тулд /alert командыг ашиглана уу.',
  premiumInfo: '👑 *Премиум эрх*\n\n✅ Хязгааргүй анхааруулга\n✅ Өдөр тутмын тайлан\n✅ Банк хооронд харьцуулалт\n✅ Түүхэн ханшны график\n\n💰 ₮{price}/сар',
  alertCreated: '✅ Анхааруулга амжилттай үүслээ!',
  alertPrompt: 'Ханш хэдэн төгрөгт хүрэхэд анхааруулах вэ?\nЖишээ нь: /alert USD 3400',
  freeLimit: '⚠️ Үнэгүй эрхээр 3 анхааруулга үүсгэх боломжтой. Премиум эрх авах: /premium',
};

// ─── Rate fetching ──────────────────────────────────────────────────
let cachedRates = null;
let cachedAt = 0;

async function getRates() {
  const now = Date.now();
  if (cachedRates && now - cachedAt < 300000) return cachedRates;

  try {
    const { data } = await axios.get(BANK_OF_MONGOLIA_API, {
      params: { dataType: 'json' },
      timeout: 10000,
      headers: { 'Accept-Language': 'mn' },
    });

    const rates = {};
    if (Array.isArray(data)) {
      for (const item of data) {
        const code = item.CurrencyCode || item.code;
        const rate = parseFloat(item.Rate || item.rate);
        if (code && rate) rates[code] = rate;
      }
    } else if (data && typeof data === 'object') {
      const items = data.items || data.rates || data.data || [];
      for (const item of items) {
        const code = item.CurrencyCode || item.code || item.currency;
        const rate = parseFloat(item.Rate || item.rate || item.value);
        if (code && rate) rates[code] = rate;
      }
    }

    if (Object.keys(rates).length === 0) {
      rates.USD = 3420;
      rates.CNY = 470;
      rates.EUR = 3710;
      rates.RUB = 38;
      rates.JPY = 22.5;
      rates.KRW = 2.5;
      rates.GBP = 4310;
    }

    cachedRates = rates;
    cachedAt = now;
    return rates;
  } catch (err) {
    if (cachedRates) return cachedRates;
    return { USD: 3420, CNY: 470, EUR: 3710, RUB: 38, JPY: 22.5, KRW: 2.5, GBP: 4310 };
  }
}

// ─── User management ────────────────────────────────────────────────
async function getUser(chatId) {
  if (!supabase) return { chat_id: chatId, is_premium: false, alert_count: 0 };
  const { data } = await supabase.from('users').select('*').eq('chat_id', chatId).single();
  return data || { chat_id: chatId, is_premium: false, alert_count: 0 };
}

async function getAlerts(chatId) {
  if (!supabase) return [];
  const { data } = await supabase.from('alerts').select('*').eq('chat_id', chatId).eq('active', true);
  return data || [];
}

async function createAlert(chatId, currency, targetRate, direction) {
  if (!supabase) return { id: 'local' };
  const user = await getUser(chatId);
  if (!user.is_premium && (user.alert_count || 0) >= 3) return null;

  const { data } = await supabase.from('alerts').insert({
    chat_id: chatId,
    currency,
    target_rate: targetRate,
    direction,
    active: true,
  }).select().single();

  await supabase.from('users').update({ alert_count: (user.alert_count || 0) + 1 }).eq('chat_id', chatId);
  return data;
}

// ─── Escape markdown ────────────────────────────────────────────────
function escMd(text) {
  return text.replace(/([_*\[\]()~`>#+\-=|{}.!])/g, '\\$1');
}

// ─── Format rates ───────────────────────────────────────────────────
function formatRates(rates) {
  let msg = '📊 *Монголбанкны ханш*\n\n';
  const priority = ['USD', 'CNY', 'EUR', 'RUB', 'JPY', 'KRW', 'GBP'];
  for (const code of priority) {
    if (rates[code]) {
      const flag = FLAGS[code] || '💱';
      msg += `${flag} ${code}: ₮${rates[code].toLocaleString()}\n`;
    }
  }
  return msg;
}

// ─── Handlers ───────────────────────────────────────────────────────

// /start
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, MN.welcome, {
    parse_mode: 'Markdown',
    reply_markup: {
      keyboard: [
        [{ text: MN.rate }, { text: MN.alert }],
        [{ text: MN.premium }, { text: MN.help }],
      ],
      resize_keyboard: true,
    },
  });

  if (supabase) {
    supabase.from('users').upsert({
      chat_id: chatId,
      username: msg.chat.username,
      first_name: msg.chat.first_name,
      language: 'mn',
    }, { onConflict: 'chat_id' }).then(() => {});
  }
});

// Rate check via keyboard button
bot.onText(new RegExp(escMd(MN.rate)), async (msg) => {
  const rates = await getRates();
  bot.sendMessage(msg.chat.id, formatRates(rates), { parse_mode: 'Markdown' });
});

// /rate command
bot.onText(/\/rate/, async (msg) => {
  const rates = await getRates();
  bot.sendMessage(msg.chat.id, formatRates(rates), { parse_mode: 'Markdown' });
});

// Alert button — prompt with instructions
bot.onText(new RegExp(escMd(MN.alert)), (msg) => {
  bot.sendMessage(msg.chat.id, MN.alertPrompt, { parse_mode: 'Markdown' });
});

// /alert command — create alert
bot.onText(/\/alert (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const input = match[1].toUpperCase().trim();

  const parsed = input.match(/^(USD|CNY|EUR|RUB|JPY|KRW|GBP)\s+(above|below)?\s*(\d+\.?\d*)$/i);
  if (!parsed) {
    bot.sendMessage(chatId, '❌ Буруу формат. Жишээ: /alert USD 3400');
    return;
  }

  const [, currency, dir, rateStr] = parsed;
  const direction = dir === 'below' ? 'below' : 'above';
  const targetRate = parseFloat(rateStr);

  const alert = await createAlert(chatId, currency, targetRate, direction);
  if (!alert) {
    bot.sendMessage(chatId, MN.freeLimit);
    return;
  }

  const flag = FLAGS[currency] || '💱';
  const dirMn = direction === 'above' ? 'дээш' : 'доош';
  bot.sendMessage(chatId, `${MN.alertCreated}\n${flag} ${currency} ${dirMn} ₮${targetRate.toLocaleString()} хүрэхэд анхааруулна.`);
});

// Premium
bot.onText(new RegExp(escMd(MN.premium)), async (msg) => {
  const chatId = msg.chat.id;
  const user = await getUser(chatId);

  if (user.is_premium) {
    bot.sendMessage(chatId, '👑 Таны премиум эрх идэвхтэй байна!');
    return;
  }

  const info = MN.premiumInfo.replace('{price}', PREMIUM_PRICE.toLocaleString());
  bot.sendMessage(chatId, info, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [[{
        text: `👑 Премиум эрх авах — ₮${PREMIUM_PRICE.toLocaleString()}/сар`,
        callback_data: 'buy_premium',
      }]],
    },
  });
});

// Handle premium button callback
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;

  if (query.data === 'buy_premium') {
    // Try Telegram Stars payment first
    try {
      await bot.sendInvoice(chatId, {
        title: 'KhaanRate Премиум',
        description: 'Хязгааргүй анхааруулга, өдрийн тайлан, банк харьцуулалт',
        payload: 'premium_monthly',
        provider_token: '',
        currency: 'XTR',
        prices: [{ label: '1 сар', amount: 149 }],
      });
      bot.answerCallbackQuery(query.id, { text: 'Төлбөрийн нэхэмжилхэл илгээгдлээ!' });
    } catch (err) {
      console.error('Invoice error:', err.message);
      bot.answerCallbackQuery(query.id, { text: 'Төлбөр хийх боломжгүй' });
      bot.sendMessage(chatId, '💳 Төлбөрийн систем удахан холбогдох байна. Одоогоор тестээр премиум авах:', {
        reply_markup: {
          inline_keyboard: [[{
            text: '✅ Премиум авах (тест)',
            callback_data: 'test_premium',
          }]],
        },
      });
    }
  }

  // Test premium activation
  if (query.data === 'test_premium') {
    if (supabase) {
      await supabase.from('users').upsert({
        chat_id: chatId,
        is_premium: true,
        premium_since: new Date().toISOString(),
      }, { onConflict: 'chat_id' });
    }
    bot.answerCallbackQuery(query.id, { text: '✅ Премиум идэвхжлэө!' });
    bot.sendMessage(chatId, '👑 Премиум эрх идэвхжлээ! 🎉\n\nХязгааргүй анхааруулга үүсгэх боломжтой боллоо. /alert командыг ашиглана уу!');
  }
});

// /premium command
bot.onText(/\/premium/, async (msg) => {
  const chatId = msg.chat.id;
  const user = await getUser(chatId);

  if (user.is_premium) {
    bot.sendMessage(chatId, '👑 Таны премиум эрх идэвхтэй байна!');
    return;
  }

  const info = MN.premiumInfo.replace('{price}', PREMIUM_PRICE.toLocaleString());
  bot.sendMessage(chatId, info, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [[{
        text: `👑 Премиум эрх авах`,
        callback_data: 'buy_premium',
      }]],
    },
  });
});

// Help
bot.onText(new RegExp(escMd(MN.help)), (msg) => {
  bot.sendMessage(msg.chat.id, [
    '❓ *Тусламж*',
    '',
    '/rate — Одоогийн ханш харах',
    '/alert USD 3400 — Ханш 3400-д хүрэхэд анхааруулах',
    '/alerts — Анхааруулгууд харах',
    '/premium — Премиум эрх',
    '/help — Тусламж',
    '',
    '💬 Санал хүсэлт: @khaanrate_support',
  ].join('\n'), { parse_mode: 'Markdown' });
});

// /alerts - list active alerts
bot.onText(/\/alerts/, async (msg) => {
  const alerts = await getAlerts(msg.chat.id);
  if (alerts.length === 0) {
    bot.sendMessage(msg.chat.id, MN.noAlerts);
    return;
  }
  let text = '🔔 *Таны анхааруулгууд:*\n\n';
  for (const a of alerts) {
    const flag = FLAGS[a.currency] || '💱';
    const dir = a.direction === 'above' ? '↑' : '↓';
    text += `${flag} ${a.currency} ${dir} ₮${a.target_rate.toLocaleString()}\n`;
  }
  bot.sendMessage(msg.chat.id, text, { parse_mode: 'Markdown' });
});

// Payment
bot.on('pre_checkout_query', (query) => {
  bot.answerPreCheckoutQuery(query.id, true);
});

bot.on('successful_payment', async (msg) => {
  const chatId = msg.chat.id;
  if (supabase) {
    await supabase.from('users').update({
      is_premium: true,
      premium_since: new Date().toISOString(),
    }).eq('chat_id', chatId);
  }
  bot.sendMessage(chatId, '👑 Премиум эрх идэвхжлээ! Баярлалаа! 🎉');
});

// ─── Alert checker (runs every 5 min) ──────────────────────────────
async function checkAlerts() {
  if (!supabase) return;
  const rates = await getRates();
  const { data: alerts } = await supabase.from('alerts').select('*').eq('active', true);
  if (!alerts) return;

  for (const alert of alerts) {
    const currentRate = rates[alert.currency];
    if (!currentRate) continue;

    const triggered =
      (alert.direction === 'above' && currentRate >= alert.target_rate) ||
      (alert.direction === 'below' && currentRate <= alert.target_rate);

    if (triggered) {
      const flag = FLAGS[alert.currency] || '💱';
      const dir = alert.direction === 'above' ? 'дээш' : 'доош';
      bot.sendMessage(alert.chat_id,
        `🔔 *Анхааруулга!*\n${flag} ${alert.currency} ${dir} ₮${alert.target_rate.toLocaleString()} хүрлээ!\nОдоогийн ханш: ₮${currentRate.toLocaleString()}`,
        { parse_mode: 'Markdown' }
      );
      await supabase.from('alerts').update({ active: false, triggered_at: new Date().toISOString() }).eq('id', alert.id);
    }
  }
}

setInterval(checkAlerts, 300000);

// ─── Start ──────────────────────────────────────────────────────────
console.log('🦁 KhaanRate bot is running...');
console.log('💰 Premium price: ₮' + PREMIUM_PRICE.toLocaleString() + '/month');
console.log('📡 Supabase:', supabase ? 'connected' : 'not configured');

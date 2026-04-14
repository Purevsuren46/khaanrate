require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');

// ─── Config ─────────────────────────────────────────────────────────
const BOT_TOKEN = process.env.BOT_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const PREMIUM_PRICE = 9900;
const BANKS_API = 'https://mongolian-bank-exchange-rate-6620c122ff22.herokuapp.com';

const bot = new TelegramBot(BOT_TOKEN, { polling: true });
const supabase = SUPABASE_URL ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;

// ─── Bank names in Mongolian ────────────────────────────────────────
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

const PRIORITY_BANKS = ['KhanBank', 'GolomtBank', 'TDBM', 'XacBank', 'MongolBank'];
const PRIORITY_CURRENCIES = ['usd', 'cny', 'eur', 'rub', 'jpy', 'krw', 'gbp'];
const CURRENCY_FLAGS = { usd: '🇺🇸', cny: '🇨🇳', eur: '🇪🇺', rub: '🇷🇺', jpy: '🇯🇵', krw: '🇰🇷', gbp: '🇬🇧' };

// ─── Rate fetching ──────────────────────────────────────────────────
let cachedBankRates = null;
let cachedBankAt = 0;

async function getBankRates() {
  const now = Date.now();
  if (cachedBankRates && now - cachedBankAt < 300000) return cachedBankRates;

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

// Get best rates across all banks for a currency
function getBestRates(bankRates, currency) {
  const results = [];
  for (const bank of bankRates) {
    if (!bank.rates || !bank.rates[currency]) continue;
    const r = bank.rates[currency];
    // Use cash rates; skip if 0
    if (r.cash && r.cash.buy > 0 && r.cash.sell > 0) {
      results.push({
        bank: bank.bank_name,
        buy: r.cash.buy,
        sell: r.cash.sell,
      });
    } else if (r.noncash && r.noncash.buy > 0 && r.noncash.sell > 0) {
      results.push({
        bank: bank.bank_name,
        buy: r.noncash.buy,
        sell: r.noncash.sell,
        noncash: true,
      });
    }
  }
  // Sort by best sell (lowest = cheapest to buy currency)
  results.sort((a, b) => a.sell - b.sell);
  return results;
}

// ─── Format helpers ─────────────────────────────────────────────────
function escMd(text) {
  return text.replace(/([_*\[\]()~`>#+\-=|{}.!])/g, '\\$1');
}

function formatOfficialRates(bankRates) {
  const mongolBank = bankRates.find(b => b.bank_name === 'MongolBank');
  if (!mongolBank || !mongolBank.rates) return '📊 Ханшны мэдээлэл одоогоор байхгүй байна.';

  let msg = '📊 *Монголбанкны албан ёсны ханш*\n\n';
  for (const code of PRIORITY_CURRENCIES) {
    const r = mongolBank.rates[code];
    if (r) {
      const flag = CURRENCY_FLAGS[code] || '💱';
      const rate = r.cash ? r.cash.buy : r.noncash.buy;
      msg += `${flag} ${code.toUpperCase()}: ₮${rate.toLocaleString()}\n`;
    }
  }
  return msg;
}

function formatBankComparison(bankRates, currency) {
  const rates = getBestRates(bankRates, currency);
  if (rates.length === 0) return `❌ ${currency.toUpperCase()} ханш олдсонгүй.`;

  const flag = CURRENCY_FLAGS[currency] || '💱';
  let msg = `${flag} *${currency.toUpperCase()} — Банкуудын харьцуулалт*\n\n`;
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

async function deleteAlert(chatId, alertId) {
  if (!supabase) return false;
  await supabase.from('alerts').delete().eq('id', alertId).eq('chat_id', chatId);
  const user = await getUser(chatId);
  if (user.alert_count > 0) {
    await supabase.from('users').update({ alert_count: user.alert_count - 1 }).eq('chat_id', chatId);
  }
  return true;
}

// ─── Handlers ───────────────────────────────────────────────────────

// /start
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, [
    '🦁 *KhaanRate — Төгрөгийн ханш*',
    '',
    'Монголын 13 банкны ханш харьцуулах, анхааруулга тохируулах.',
    'Доорх командыг сонгоно уу:',
  ].join('\n'), {
    parse_mode: 'Markdown',
    reply_markup: {
      keyboard: [
        [{ text: '📊 Ханш' }, { text: '🏦 Банк харьцуулалт' }],
        [{ text: '🔔 Анхааруулга' }, { text: '👑 Премиум' }],
        [{ text: '❓ Тусламж' }],
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

// 📊 Ханш — Official rates
bot.onText(/📊 Ханш|\/rate/, async (msg) => {
  const bankRates = await getBankRates();
  bot.sendMessage(msg.chat.id, formatOfficialRates(bankRates), { parse_mode: 'Markdown' });
});

// 🏦 Банк харьцуулалт — Bank comparison
bot.onText(/🏦 Банк харьцуулалт/, (msg) => {
  bot.sendMessage(msg.chat.id, '💱 Харьцуулах валют сонгоно уу:', {
    reply_markup: {
      inline_keyboard: [
        [{ text: '🇺🇸 USD', callback_data: 'compare_usd' }, { text: '🇨🇳 CNY', callback_data: 'compare_cny' }],
        [{ text: '🇪🇺 EUR', callback_data: 'compare_eur' }, { text: '🇷🇺 RUB', callback_data: 'compare_rub' }],
        [{ text: '🇯🇵 JPY', callback_data: 'compare_jpy' }, { text: '🇰🇷 KRW', callback_data: 'compare_krw' }],
        [{ text: '🇬🇧 GBP', callback_data: 'compare_gbp' }],
      ],
    },
  });
});

// /compare command
bot.onText(/\/compare (.+)/, async (msg, match) => {
  const currency = match[1].toLowerCase().trim();
  if (!PRIORITY_CURRENCIES.includes(currency)) {
    bot.sendMessage(msg.chat.id, `❌ Тийм валют байхгүй. Боломжит: ${PRIORITY_CURRENCIES.map(c => c.toUpperCase()).join(', ')}`);
    return;
  }
  const bankRates = await getBankRates();
  bot.sendMessage(msg.chat.id, formatBankComparison(bankRates, currency), { parse_mode: 'Markdown' });
});

// Handle comparison callbacks
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;

  // Bank comparison callbacks
  if (query.data.startsWith('compare_')) {
    const currency = query.data.replace('compare_', '');
    const bankRates = await getBankRates();
    const msg = formatBankComparison(bankRates, currency);
    bot.answerCallbackQuery(query.id);
    bot.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
    return;
  }

  // Premium purchase
  if (query.data === 'buy_premium') {
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
      bot.answerCallbackQuery(query.id, { text: 'Төлбөр хийх боломжгүй' });
      bot.sendMessage(chatId, '💳 Төлбөрийн систем удахан холбогдох байна. Одоогоор тестээр премиум авах:', {
        reply_markup: {
          inline_keyboard: [[{ text: '✅ Премиум авах (тест)', callback_data: 'test_premium' }]],
        },
      });
    }
    return;
  }

  // Test premium
  if (query.data === 'test_premium') {
    if (supabase) {
      await supabase.from('users').upsert({
        chat_id: chatId,
        is_premium: true,
        premium_since: new Date().toISOString(),
      }, { onConflict: 'chat_id' });
    }
    bot.answerCallbackQuery(query.id, { text: '✅ Премиум идэвхжлэө!' });
    bot.sendMessage(chatId, '👑 Премиум эрх идэвхжлээ! 🎉\n\nХязгааргүй анхааруулга үүсгэх боломжтой боллоо!');
    return;
  }

  // Delete alert callback
  if (query.data.startsWith('delete_alert_')) {
    const alertId = query.data.replace('delete_alert_', '');
    await deleteAlert(chatId, alertId);
    bot.answerCallbackQuery(query.id, { text: '🗑️ Анхааруулга устгагдлаа' });
    bot.sendMessage(chatId, '✅ Анхааруулга устгагдлаа.');
    return;
  }
});

// 🔔 Анхааруулга
bot.onText(/🔔 Анхааруулга/, (msg) => {
  bot.sendMessage(msg.chat.id, [
    '🔔 *Анхааруулга тохируулах*',
    '',
    'Ханш хэдэн төгрөгт хүрэхэд анхааруулах вэ?',
    '',
    '_Жишээ:_',
    '/alert USD 3580 — USD 3580-д хүрэхэд',
    '/alert CNY below 505 — CNY 505-аас доош унахад',
    '',
    '/alerts — одоогийн анхааруулгууд',
  ].join('\n'), { parse_mode: 'Markdown' });
});

// /alert command
bot.onText(/\/alert (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const input = match[1].toUpperCase().trim();

  const parsed = input.match(/^(USD|CNY|EUR|RUB|JPY|KRW|GBP)\s+(above|below)?\s*(\d+\.?\d*)$/i);
  if (!parsed) {
    bot.sendMessage(chatId, '❌ Буруу формат. Жишээ: /alert USD 3580');
    return;
  }

  const [, currency, dir, rateStr] = parsed;
  const direction = dir === 'below' ? 'below' : 'above';
  const targetRate = parseFloat(rateStr);

  const alert = await createAlert(chatId, currency, targetRate, direction);
  if (!alert) {
    bot.sendMessage(chatId, '⚠️ Үнэгүй эрхээр 3 анхааруулга үүсгэх боломжтой. Премиум эрх авах: /premium');
    return;
  }

  const flag = CURRENCY_FLAGS[currency.toLowerCase()] || '💱';
  const dirMn = direction === 'above' ? 'дээш' : 'доош';
  bot.sendMessage(chatId, `✅ Анхааруулга үүслээ!\n${flag} ${currency} ${dirMn} ₮${targetRate.toLocaleString()} хүрэхэд анхааруулна.`);
});

// /alerts — list active alerts
bot.onText(/\/alerts/, async (msg) => {
  const alerts = await getAlerts(msg.chat.id);
  if (alerts.length === 0) {
    bot.sendMessage(msg.chat.id, 'Анхааруулга байхгүй байна. /alert командыг ашиглана уу.');
    return;
  }

  let text = '🔔 *Таны анхааруулгууд:*\n\n';
  const buttons = [];
  for (const a of alerts) {
    const flag = CURRENCY_FLAGS[a.currency.toLowerCase()] || '💱';
    const dir = a.direction === 'above' ? '↑' : '↓';
    text += `${flag} ${a.currency} ${dir} ₮${a.target_rate.toLocaleString()}\n`;
    buttons.push([{ text: `🗑️ ${a.currency} ${dir} ₮${a.target_rate.toLocaleString()}`, callback_data: `delete_alert_${a.id}` }]);
  }

  bot.sendMessage(msg.chat.id, text, {
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: buttons },
  });
});

// 👑 Премиум
bot.onText(/👑 Премиум|\/premium/, async (msg) => {
  const chatId = msg.chat.id;
  const user = await getUser(chatId);

  if (user.is_premium) {
    bot.sendMessage(chatId, '👑 Таны премиум эрх идэвхтэй байна!');
    return;
  }

  bot.sendMessage(chatId, [
    '👑 *Премиум эрх*',
    '',
    '✅ Хязгааргүй анхааруулга',
    '✅ Өдөр тутмын тайлан',
    '✅ Банк хооронд харьцуулалт',
    '✅ Түүхэн ханшны мэдээлэл',
    '',
    '💰 ₮9,900/сар (~149 ⭐)',
  ].join('\n'), {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [[{ text: '👑 Премиум эрх авах', callback_data: 'buy_premium' }]],
    },
  });
});

// ❓ Тусламж
bot.onText(/❓ Тусламж|\/help/, (msg) => {
  bot.sendMessage(msg.chat.id, [
    '❓ *Тусламж*',
    '',
    '📊 *Ханш* — Монголбанкны албан ёсны ханш',
    '🏦 *Банк харьцуулалт* — 13 банкны ханш харьцуулах',
    '/compare USD — Текстээр харьцуулах',
    '/alert USD 3580 — Анхааруулга тохируулах',
    '/alerts — Анхааруулгууд харах, устгах',
    '/premium — Премиум эрх',
    '/history USD — 7 хоногийн ханш (премиум)',
    '',
    '💬 Санал хүсэлт: @khaanrate_support',
  ].join('\n'), { parse_mode: 'Markdown' });
});

// /history — Rate history (premium)
bot.onText(/\/history (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const user = await getUser(chatId);
  const currency = match[1].toLowerCase().trim();

  if (!user.is_premium) {
    bot.sendMessage(chatId, '👑 /history нь премиум эрх шаардана. /premium');
    return;
  }

  if (!PRIORITY_CURRENCIES.includes(currency)) {
    bot.sendMessage(chatId, `❌ Тийм валют байхгүй. Боломжит: ${PRIORITY_CURRENCIES.map(c => c.toUpperCase()).join(', ')}`);
    return;
  }

  try {
    const { data } = await axios.get(`${BANKS_API}/rates/bank/MongolBank`, { timeout: 10000 });
    if (!data || data.length === 0) {
      bot.sendMessage(chatId, '❌ Түүхэн мэдээлэл олдсонгүй.');
      return;
    }

    // Get last 7 entries
    const recent = data.slice(-7).reverse();
    const flag = CURRENCY_FLAGS[currency] || '💱';
    let text = `${flag} *${currency.toUpperCase()} — Сүүлийн 7 хоног*\n\n`;

    for (const entry of recent) {
      const date = entry.date;
      const r = entry.rates[currency];
      if (r) {
        const rate = r.cash ? r.cash.buy : (r.noncash ? r.noncash.buy : 0);
        if (rate > 0) {
          text += `📅 ${date}: ₮${rate.toLocaleString()}\n`;
        }
      }
    }

    // Calculate trend
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

    bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
  } catch (err) {
    bot.sendMessage(chatId, '❌ Түүхэн мэдээлэл татаж чадсангүй.');
  }
});

// /best — Find best bank to buy/sell a currency
bot.onText(/\/best (.+)/, async (msg, match) => {
  const currency = match[1].toLowerCase().trim();
  if (!PRIORITY_CURRENCIES.includes(currency)) {
    bot.sendMessage(msg.chat.id, `❌ Тийм валют байхгүй. Боломжит: ${PRIORITY_CURRENCIES.map(c => c.toUpperCase()).join(', ')}`);
    return;
  }

  const bankRates = await getBankRates();
  const rates = getBestRates(bankRates, currency);
  if (rates.length === 0) {
    bot.sendMessage(msg.chat.id, `❌ ${currency.toUpperCase()} ханш олдсонгүй.`);
    return;
  }

  const flag = CURRENCY_FLAGS[currency] || '💱';
  const cheapest = rates[0];
  const bestSell = BANK_NAMES[cheapest.bank] || cheapest.bank;
  const mostExpensive = rates[rates.length - 1];
  const worstSell = BANK_NAMES[mostExpensive.bank] || mostExpensive.bank;

  let text = `${flag} *${currency.toUpperCase()} — Шилдэг санал*\n\n`;
  text += `🟢 Валют хямд авах: ${bestSell}\n  ₮${cheapest.sell.toLocaleString()}\n\n`;
  text += `🔴 Валют үнэт зарах: ${worstSell}\n  ₮${mostExpensive.buy.toLocaleString()}\n\n`;

  if (rates.length >= 2) {
    const spread = mostExpensive.sell - cheapest.sell;
    text += `💡 Банк хооронд зөрүү: ₮${spread.toLocaleString()}`;
  }

  bot.sendMessage(msg.chat.id, text, { parse_mode: 'Markdown' });
});

// Payment handlers
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

// ─── Alert checker (every 5 min) ──────────────────────────────────
async function checkAlerts() {
  if (!supabase) return;
  const bankRates = await getBankRates();
  const mongolBank = bankRates.find(b => b.bank_name === 'MongolBank');
  if (!mongolBank) return;

  const { data: alerts } = await supabase.from('alerts').select('*').eq('active', true);
  if (!alerts) return;

  for (const alert of alerts) {
    const cur = alert.currency.toLowerCase();
    const r = mongolBank.rates[cur];
    if (!r) continue;

    const currentRate = r.cash ? r.cash.buy : (r.noncash ? r.noncash.buy : 0);
    if (currentRate <= 0) continue;

    const triggered =
      (alert.direction === 'above' && currentRate >= alert.target_rate) ||
      (alert.direction === 'below' && currentRate <= alert.target_rate);

    if (triggered) {
      const flag = CURRENCY_FLAGS[cur] || '💱';
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

// ─── Daily report for premium users ─────────────────────────────────
async function sendDailyReport() {
  if (!supabase) return;
  const bankRates = await getBankRates();
  const { data: premiumUsers } = await supabase.from('users').select('chat_id').eq('is_premium', true);
  if (!premiumUsers || premiumUsers.length === 0) return;

  const report = `📊 *Өдрийн ханшны тайлан*\n\n${formatOfficialRates(bankRates)}\n\n💸 Хамгийн хямд USD: ${(() => {
    const usdRates = getBestRates(bankRates, 'usd');
    return usdRates.length > 0 ? `${BANK_NAMES[usdRates[0].bank]} ₮${usdRates[0].sell.toLocaleString()}` : '-';
  })()}\n\n_KhaanRate Premium_`;

  for (const user of premiumUsers) {
    bot.sendMessage(user.chat_id, report, { parse_mode: 'Markdown' }).catch(() => {});
  }
}

// ─── Error handling ─────────────────────────────────────────────────
bot.on('polling_error', (err) => {
  console.error('Polling error:', err.message);
});

// ─── Start ──────────────────────────────────────────────────────────
console.log('🦁 KhaanRate bot is running...');
console.log('💰 Premium price: ₮' + PREMIUM_PRICE.toLocaleString() + '/month');
console.log('📡 Supabase:', supabase ? 'connected' : 'not configured');
console.log('🏦 Bank API:', BANKS_API);

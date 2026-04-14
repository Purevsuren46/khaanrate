require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
const { fetchAll, buildOfficial, CURRENCIES, CUR_MAP } = require('./bank-rates');

const BOT_TOKEN = process.env.BOT_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const FX_API = 'https://open.er-api.com/v6/latest/USD';

const bot = new TelegramBot(BOT_TOKEN, { polling: true });
const supabase = SUPABASE_URL ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;

const FLAGS = {usd:'🇺🇸',cny:'🇨🇳',eur:'🇪🇺',rub:'🇷🇺',jpy:'🇯🇵',krw:'🇰🇷',gbp:'🇬🇧'};

// ─── Cache ──────────────────────────────────────────────────────
let cachedBanks = null, cachedAt = 0;
async function getBanks() {
  if (cachedBanks && Date.now()-cachedAt < 1800000) return cachedBanks; // 30min
  cachedBanks = await fetchAll();
  if (cachedBanks.length) cachedAt = Date.now();
  return cachedBanks;
}

// Fallback official rates if no bank has them
async function getFallbackOfficial() {
  try {
    const {data} = await axios.get(FX_API, {timeout:10000});
    if (!data?.rates?.MNT) throw new Error('no MNT');
    const mnt = data.rates.MNT;
    return {usd:Math.round(mnt), cny:Math.round(mnt/data.rates.CNY*100)/100,
      eur:Math.round(mnt/data.rates.EUR), rub:Math.round(mnt/data.rates.RUB*100)/100,
      jpy:Math.round(mnt/data.rates.JPY*100)/100, krw:Math.round(mnt/data.rates.KRW*100)/100,
      gbp:Math.round(mnt/data.rates.GBP)};
  } catch { return null; }
}

// ─── Format helpers ─────────────────────────────────────────────
function send(chatId, text, extra={}) { extra.parse_mode='HTML'; return bot.sendMessage(chatId,text,extra); }
function fmt(n) { return Number(n).toLocaleString('en-US',{maximumFractionDigits:2}); }

function findCheapest(banks, currency, type) {
  let best = null, bestVal = type==='buy' ? Infinity : 0;
  for (const b of banks) {
    const v = b.rates[currency]?.[type];
    if (!v) continue;
    if (type==='buy' && v < bestVal) { bestVal=v; best=b; }
    if (type==='sell' && v > bestVal) { bestVal=v; best=b; }
  }
  return best;
}

// ─── Rate message ───────────────────────────────────────────────
async function ratesMsg() {
  const banks = await getBanks();
  const official = buildOfficial(banks) || await getFallbackOfficial();
  if (!official) return '📊 Ханшны мэдээлэл одоогоор байхгүй.';

  let msg = '<b>📊 Албан ёсны ханш</b>\n\n';
  for (const c of CURRENCIES) {
    const r = official[c];
    if (!r) continue;
    msg += `${FLAGS[c]||'💱'} ${c.toUpperCase()}: ₮${fmt(r)}\n`;
    for (const b of banks) {
      if (b.name==='MongolBank'||b.name==='StateBank') continue;
      const br = b.rates[c];
      if (!br) continue;
      const cheapBuy = findCheapest(banks,c,'buy')?.name===b.name;
      const cheapSell = findCheapest(banks,c,'sell')?.name===b.name;
      const trophy = cheapBuy ? ' 🏆' : '';
      msg += `  └ ${b.mn}: Авах ₮${fmt(br.sell)} | Зарах ₮${fmt(br.buy)}${trophy}\n`;
    }
  }
  return msg;
}

// ─── Compare message ────────────────────────────────────────────
async function compareMsg(currency) {
  const banks = await getBanks();
  const official = buildOfficial(banks) || await getFallbackOfficial();
  let msg = `${FLAGS[currency]||'💱'} <b>${currency.toUpperCase()} — Харьцуулалт</b>\n\n`;
  if (official?.[currency]) msg += `🏛️ Монгол Банк: ₮${fmt(official[currency])}\n`;
  for (const b of banks) {
    if (b.name==='MongolBank') continue;
    const r = b.rates[currency];
    if (!r) continue;
    msg += `${b.mn}: Авах ₮${fmt(r.sell)} | Зарах ₮${fmt(r.buy)}\n`;
  }
  // Best
  const bestBuy = findCheapest(banks,currency,'buy');
  const bestSell = findCheapest(banks,currency,'sell');
  if (bestBuy) msg += `\n🟢 Хамгийн хямд авах: ${bestBuy.mn}`;
  if (bestSell) msg += `\n🔴 Хамгийн өндөр зарах: ${bestSell.mn}`;
  return msg;
}

// ─── Best message ───────────────────────────────────────────────
async function bestMsg(currency) {
  const banks = await getBanks();
  const official = buildOfficial(banks) || await getFallbackOfficial();
  let msg = `${FLAGS[currency]||'💱'} <b>${currency.toUpperCase()} — Шилдэг</b>\n\n`;
  const bestBuy = findCheapest(banks,currency,'buy');
  const bestSell = findCheapest(banks,currency,'sell');
  if (bestBuy) msg += `🟢 Авах: ${bestBuy.mn} ₮${fmt(bestBuy.rates[currency].sell)}\n`;
  if (bestSell) msg += `🔴 Зарах: ${bestSell.mn} ₮${fmt(bestSell.rates[currency].buy)}\n`;
  if (official?.[currency] && bestBuy) {
    const d = bestBuy.rates[currency].sell - official[currency];
    msg += `\n💡 Монголбанктай харьцуулалт: ${d>0?'+':''}₮${fmt(d)}`;
  }
  return msg;
}

// ─── User management ────────────────────────────────────────────
async function getUser(chatId) {
  if (!supabase) return {chat_id:chatId};
  const {data} = await supabase.from('users').select('*').eq('chat_id',chatId).single();
  return data||{chat_id:chatId};
}
async function getAlerts(chatId) {
  if (!supabase) return [];
  const {data} = await supabase.from('alerts').select('*').eq('chat_id',chatId).eq('active',true);
  return data||[];
}
async function createAlert(chatId, currency, target, dir) {
  if (!supabase) return {id:'local'};
  const {data} = await supabase.from('alerts').insert({chat_id:chatId,currency,target_rate:target,direction:dir,active:true}).select().single();
  return data;
}
async function deleteAlert(chatId, id) {
  if (!supabase) return;
  await supabase.from('alerts').delete().eq('id',id).eq('chat_id',chatId);
}

// ─── Handlers ────────────────────────────────────────────────────
bot.onText(/\/start/, msg => {
  send(msg.chat.id, '🦁 <b>KhaanRate — Төгрөгийн ханш</b>\n\nМонголбанк + 3 банкны харьцуулалт.', {
    reply_markup:{keyboard:[
      [{text:'📊 Ханш'},{text:'🏦 Банк харьцуулалт'}],
      [{text:'🔔 Анхааруулга'},{text:'❓ Тусламж'}]
    ],resize_keyboard:true}
  });
  if (supabase) supabase.from('users').upsert({chat_id:msg.chat.id,username:msg.chat.username,first_name:msg.chat.first_name},{onConflict:'chat_id'}).then(()=>{});
});

bot.onText(/📊 Ханш|\/rate/, async msg => { send(msg.chat.id, '⏳ Татаж байна...'); send(msg.chat.id, await ratesMsg()); });

bot.onText(/Банк харьцуулалт|\/banks/, msg => {
  bot.sendMessage(msg.chat.id, '💱 Валют сонгоно уу:', {
    reply_markup:{inline_keyboard:[
      [{text:'🇺🇸 USD',callback_data:'cmp_usd'},{text:'🇨🇳 CNY',callback_data:'cmp_cny'}],
      [{text:'🇪🇺 EUR',callback_data:'cmp_eur'},{text:'🇷🇺 RUB',callback_data:'cmp_rub'}],
      [{text:'🇯🇵 JPY',callback_data:'cmp_jpy'},{text:'🇰🇷 KRW',callback_data:'cmp_krw'}],
      [{text:'🇬🇧 GBP',callback_data:'cmp_gbp'}]
    ]}
  });
});

bot.onText(/\/compare (.+)/, async (msg,m) => {
  const c = m[1].toLowerCase().trim();
  if (!CURRENCIES.includes(c)) { send(msg.chat.id,`❌ Боломжит: ${CURRENCIES.map(x=>x.toUpperCase()).join(', ')}`); return; }
  send(msg.chat.id, await compareMsg(c));
});

bot.onText(/\/best (.+)/, async (msg,m) => {
  const c = m[1].toLowerCase().trim();
  if (!CURRENCIES.includes(c)) { send(msg.chat.id,'❌'); return; }
  send(msg.chat.id, await bestMsg(c));
});

bot.onText(/🔔 Анхааруулга/, msg => {
  send(msg.chat.id, '🔔 <b>Анхааруулга</b>\n\n/alert USD 3580\n/alert CNY below 505\n/alerts — жагсаалт');
});

bot.onText(/\/alert (.+)/, async (msg,m) => {
  const p = m[1].toUpperCase().trim().match(/^(USD|CNY|EUR|RUB|JPY|KRW|GBP)\s+(ABOVE|BELOW)?\s*(\d+\.?\d*)$/i);
  if (!p) { send(msg.chat.id,'❌ Жишээ: /alert USD 3580'); return; }
  const [,,dir,rate] = p;
  const direction = (dir||'above').toLowerCase();
  await createAlert(msg.chat.id, p[1], parseFloat(rate), direction);
  const d = direction==='above'?'дээш':'доош';
  send(msg.chat.id,`✅ ${FLAGS[p[1].toLowerCase()]||'💱'} ${p[1]} ${d} ₮${rate} хүрэхэд анхааруулна.`);
});

bot.onText(/\/alerts/, async msg => {
  const alerts = await getAlerts(msg.chat.id);
  if (!alerts.length) { send(msg.chat.id,'Анхааруулга байхгүй.'); return; }
  let t = '🔔 <b>Анхааруулгууд:</b>\n\n';
  const btns = [];
  for (const a of alerts) {
    const d = a.direction==='above'?'↑':'↓';
    t += `${FLAGS[a.currency.toLowerCase()]||'💱'} ${a.currency} ${d} ₮${a.target_rate}\n`;
    btns.push([{text:`🗑️ ${a.currency} ${d} ₮${a.target_rate}`,callback_data:`del_${a.id}`}]);
  }
  send(msg.chat.id, t, {reply_markup:{inline_keyboard:btns}});
});

bot.onText(/❓ Тусламж|\/help/, msg => {
  send(msg.chat.id, '❓ <b>Тусламж</b>\n\n📊 Ханш — Монголбанк + 3 банк\n🏦 /banks — харьцуулалт\n/alert USD 3580\n/alerts\n/best USD');
});

bot.on('callback_query', async q => {
  const chatId = q.message.chat.id;
  if (q.data.startsWith('cmp_')) {
    bot.answerCallbackQuery(q.id);
    send(chatId, await compareMsg(q.data.replace('cmp_','')));
    return;
  }
  if (q.data.startsWith('del_')) {
    await deleteAlert(chatId, q.data.replace('del_',''));
    bot.answerCallbackQuery(q.id, {text:'🗑️ Устгагдлаа'});
    send(chatId,'✅ Устгагдлаа.');
  }
});

// ─── Alert checker ──────────────────────────────────────────────
async function checkAlerts() {
  if (!supabase) return;
  const banks = await getBanks();
  const official = buildOfficial(banks);
  if (!official) return;
  const {data:alerts} = await supabase.from('alerts').select('*').eq('active',true);
  if (!alerts) return;
  for (const a of alerts) {
    const r = official[a.currency.toLowerCase()];
    if (!r) continue;
    if ((a.direction==='above'&&r>=a.target_rate)||(a.direction==='below'&&r<=a.target_rate)) {
      send(a.chat_id,`🔔 ${FLAGS[a.currency.toLowerCase()]||'💱'} ${a.currency} ₮${r} хүрлээ!`);
      await supabase.from('alerts').update({active:false,triggered_at:new Date().toISOString()}).eq('id',a.id);
    }
  }
}
setInterval(checkAlerts, 300000);

bot.on('polling_error', e => console.error('Poll:', e.message?.substring(0,60)));

console.log('🦁 KhaanRate running');
if (supabase) console.log('📡 Supabase: connected');

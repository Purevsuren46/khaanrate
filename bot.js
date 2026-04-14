require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
const { fetchAll, buildOfficial, CURRENCIES, CUR_MAP } = require('./bank-rates');
const { addReferralButtons, businessReport, getAd, postToChannel, BUSINESS_PRICE, BUSINESS_CONTACT } = require('./monetize');
const { shareText, getTransferAd, adPricingText, BOT_USERNAME, CHANNEL } = require('./revenue');

const BOT_TOKEN = process.env.BOT_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const FX_API = 'https://open.er-api.com/v6/latest/USD';

const bot = new TelegramBot(BOT_TOKEN, { polling: true });
const supabase = SUPABASE_URL ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;

const FLAGS = {usd:'🇺🇸',cny:'🇨🇳',eur:'🇪🇺',rub:'🇷🇺',jpy:'🇯🇵',krw:'🇰🇷',gbp:'🇬🇧'};
const NAMES = {usd:'Америк доллар',cny:'Хятад юань',eur:'Евро',rub:'Орос рубль',jpy:'Япон иен',krw:'Солонгос вон',gbp:'Англи фунт'};

// ─── Cache ──────────────────────────────────────────────────────
let cachedBanks = null, cachedAt = 0;
async function getBanks() {
  if (cachedBanks && Date.now()-cachedAt < 1800000) return cachedBanks;
  cachedBanks = await fetchAll();
  if (cachedBanks.length) cachedAt = Date.now();
  return cachedBanks;
}

async function getFallbackOfficial() {
  try {
    const {data} = await axios.get(FX_API, {timeout:10000});
    if (!data?.rates?.MNT) throw new Error();
    const mnt = data.rates.MNT;
    return {usd:Math.round(mnt),cny:Math.round(mnt/data.rates.CNY*100)/100,
      eur:Math.round(mnt/data.rates.EUR),rub:Math.round(mnt/data.rates.RUB*100)/100,
      jpy:Math.round(mnt/data.rates.JPY*100)/100,krw:Math.round(mnt/data.rates.KRW*100)/100,
      gbp:Math.round(mnt/data.rates.GBP)};
  } catch { return null; }
}

// ─── Helpers ────────────────────────────────────────────────────
function send(chatId, text, extra={}) { extra.parse_mode='HTML'; return bot.sendMessage(chatId,text,extra); }
function fmt(n) { return Number(n).toLocaleString('en-US',{maximumFractionDigits:2}); }

function findCheapest(banks, currency, type) {
  let best=null, bestVal=type==='buy'?Infinity:0;
  for (const b of banks) {
    if (b.name==='MongolBank'||b.name==='StateBank') continue;
    const v = type==='buy' ? b.rates[currency]?.sell : b.rates[currency]?.buy;
    if (!v) continue;
    if (type==='buy'&&v<bestVal) { bestVal=v; best=b; }
    if (type==='sell'&&v>bestVal) { bestVal=v; best=b; }
  }
  return best;
}

// ─── Main menu ──────────────────────────────────────────────────
const MAIN_MENU = {
  reply_markup:{keyboard:[
    [{text:'💵 Ханш харах'},{text:'🏦 Банк харьцуулах'}],
    [{text:'🔔 Ханшны мэдэгдэл'},{text:'💡 Зөвлөгөө'}]
  ],resize_keyboard:true}
};

// ─── /start ──────────────────────────────────────────────────────
bot.onText(/\/start/, msg => {
  send(msg.chat.id,
    `🦁 <b>KhaanRate — Төгрөгийн ханш</b>\n\n` +
    `Ханшаа шалгах, банкуудыг харьцуулах, ханш өөрчлөгдөхөд мэдэгдэл авах бүхнийг нэг дор.\n\n` +
    `Доорх товчийг дарж эхлээрэй 👇`,
    MAIN_MENU
  );
  if (supabase) supabase.from('users').upsert({chat_id:msg.chat.id,username:msg.chat.username,first_name:msg.chat.first_name},{onConflict:'chat_id'}).then(()=>{});
});

// ─── 💵 Ханш харах ─────────────────────────────────────────────
bot.onText(/💵 Ханш харах|\/rate/, async msg => {
  const banks = await getBanks();
  const official = buildOfficial(banks) || await getFallbackOfficial();
  if (!official) { send(msg.chat.id,'⚠️ Одоогоор ханш татаж чадахгүй байна. Түр хүлээнэ үү.'); return; }

  let msg_text = `<b>📊 Өнөөдрийн ханш</b>\n\n`;
  for (const c of CURRENCIES) {
    const r = official[c];
    if (!r) continue;
    msg_text += `${FLAGS[c]} <b>${NAMES[c]}</b> (${c.toUpperCase()})\n`;
    msg_text += `   Албан: ₮${fmt(r)}\n`;
    // Show banks
    for (const b of banks) {
      if (b.name==='MongolBank'||b.name==='StateBank') continue;
      const br = b.rates[c];
      if (!br?.sell && !br?.buy) continue;
      const cheapest = findCheapest(banks,c,'buy');
      const trophy = cheapest?.name===b.name ? ' 🏆' : '';
      msg_text += `   ${b.mn}: Авах ₮${fmt(br.sell)} | Зарах ₮${fmt(br.buy)}${trophy}\n`;
    }
    msg_text += '\n';
  }
  msg_text += '💡 🏆 = хамгийн хямд авах үнэ';

  const refBtns = addReferralButtons(banks);
  const ad = getAd();
  if (ad) msg_text += `\n\n${ad}`;
  send(msg.chat.id, msg_text, refBtns.length ? {reply_markup:{inline_keyboard:refBtns}} : {});
});

// ─── 🏦 Банк харьцуулах ────────────────────────────────────────
bot.onText(/🏦 Банк харьцуулах|\/banks/, msg => {
  send(msg.chat.id, '💱 Алийг харьцуулах вэ?', {
    reply_markup:{inline_keyboard:[
      [{text:'🇺🇸 Америк доллар',callback_data:'cmp_usd'},{text:'🇨🇳 Хятад юань',callback_data:'cmp_cny'}],
      [{text:'🇪🇺 Евро',callback_data:'cmp_eur'},{text:'🇷🇺 Орос рубль',callback_data:'cmp_rub'}],
      [{text:'🇯🇵 Япон иен',callback_data:'cmp_jpy'},{text:'🇰🇷 Солонгос вон',callback_data:'cmp_krw'}],
      [{text:'🇬🇧 Англи фунт',callback_data:'cmp_gbp'}]
    ]}
  });
});

async function compareMsg(currency) {
  const banks = await getBanks();
  const official = buildOfficial(banks) || await getFallbackOfficial();
  let msg = `${FLAGS[currency]} <b>${NAMES[currency]} — Банк харьцуулалт</b>\n\n`;

  if (official?.[currency]) msg += `🏛️ Монголбанк: ₮${fmt(official[currency])}\n\n`;

  msg += `<b>Авах үнэ (та мөнгөө зарж валют авна)</b>\n`;
  const buyBanks = banks.filter(b=>b.name!=='MongolBank'&&b.rates[currency]?.sell).sort((a,b)=>a.rates[currency].sell-b.rates[currency].sell);
  for (const b of buyBanks) {
    const r = b.rates[currency];
    const isCheapest = b === buyBanks[0];
    msg += `${isCheapest?'🟢':'⚪'} ${b.mn}: ₮${fmt(r.sell)}${isCheapest?' ← хамгийн хямд':''}\n`;
  }

  msg += `\n<b>Зарах үнэ (та валют зарж мөнгөө авна)</b>\n`;
  const sellBanks = banks.filter(b=>b.name!=='MongolBank'&&b.rates[currency]?.buy).sort((a,b)=>b.rates[currency].buy-a.rates[currency].buy);
  for (const b of sellBanks) {
    const r = b.rates[currency];
    const isBest = b === sellBanks[0];
    msg += `${isBest?'🟢':'⚪'} ${b.mn}: ₮${fmt(r.buy)}${isBest?' ← хамгийн өндөр':''}\n`;
  }

  if (official?.[currency] && buyBanks[0]) {
    const d = buyBanks[0].rates[currency].sell - official[currency];
    msg += `\n💡 Монголбанктай харьцуулбал: ${d>0?'+':''}₮${fmt(d)}`;
  }
  return msg;
}

// ─── 🔔 Ханшны мэдэгдэл ─────────────────────────────────────────
bot.onText(/🔔 Ханшны мэдэгдэл/, msg => {
  send(msg.chat.id,
    `🔔 <b>Ханшны мэдэгдэл тохируулах</b>\n\n` +
    `Ханш тодорхой хэмжээнд хүрэхэд чинь Telegram-ээр мэдэгдэнэ!\n\n` +
    `<b>Жишээ:</b>\n` +
    `• /alert USD 3600 — USD ₮3600-д хүрэхэд\n` +
    `• /alert CNY below 500 — CNY ₮500-аас доош унахад\n\n` +
    `/alerts — одоогийн мэдэгдлүүдээ харах`
  );
});

bot.onText(/\/alert (.+)/, async (msg,m) => {
  const p = m[1].toUpperCase().trim().match(/^(USD|CNY|EUR|RUB|JPY|KRW|GBP)\s+(ABOVE|BELOW)?\s*(\d+\.?\d*)$/i);
  if (!p) { send(msg.chat.id,`❌ Буруу формат.\n\nЗөв: /alert USD 3600\nЭсвэл: /alert CNY below 500`); return; }
  const [,,dir,rate] = p;
  const direction = (dir||'above').toLowerCase();
  await createAlert(msg.chat.id, p[1], parseFloat(rate), direction);
  const dirMn = direction==='above'?'дээш (above)':'доош (below)';
  send(msg.chat.id,`✅ Мэдэгдэл үүслээ!\n\n${FLAGS[p[1].toLowerCase()]} ${NAMES[p[1].toLowerCase()]} ${dirMn} ₮${rate} хүрэхэд мэдэгдэнэ.`);
});

bot.onText(/\/alerts/, async msg => {
  const alerts = await getAlerts(msg.chat.id);
  if (!alerts.length) { send(msg.chat.id,'Одоо мэдэгдэл байхгүй. /alert командыг ашиглана уу.'); return; }
  let t = '🔔 <b>Таны мэдэгдлүүд:</b>\n\n';
  const btns = [];
  for (const a of alerts) {
    const d = a.direction==='above'?'↑ дээш':'↓ доош';
    t += `${FLAGS[a.currency.toLowerCase()]} ${NAMES[a.currency.toLowerCase()]} ${d} ₮${a.target_rate}\n`;
    btns.push([{text:`🗑️ Устгах: ${a.currency} ${d} ₮${a.target_rate}`,callback_data:`del_${a.id}`}]);
  }
  send(msg.chat.id, t, {reply_markup:{inline_keyboard:btns}});
});

// ─── 💡 Зөвлөгөө ────────────────────────────────────────────────
bot.onText(/💡 Зөвлөгөө|\/help/, msg => {
  send(msg.chat.id,
    `💡 <b>KhaanRate — Бүх боломж</b>\n\n` +
    `💵 <b>Ханш харах</b> — 7 валютын албан + банкны ханш\n` +
    `🏦 <b>Банк харьцуулах</b> — аль банк хамгийн хямд вэ?\n` +
    `🔔 <b>Мэдэгдэл</b> — /alert USD 3600\n` +
    `📊 <b>/best USD</b> — шилдэг банк нэг харцад\n` +
    `📋 <b>/report</b> — бизнес тайлан\n` +
    `📤 <b>/share</b> — найздаа илгээх\n\n` +
    `🇺🇸 USD 🇨🇳 CNY 🇪🇺 EUR 🇷🇺 RUB\n🇯🇵 JPY 🇰🇷 KRW 🇬🇧 GBP`
  );
});

// ─── /best ──────────────────────────────────────────────────────
bot.onText(/\/best (.+)/, async (msg,m) => {
  const c = m[1].toLowerCase().trim();
  if (!CURRENCIES.includes(c)) { send(msg.chat.id,`❌ Боломжит: ${CURRENCIES.map(x=>x.toUpperCase()).join(', ')}`); return; }
  const banks = await getBanks();
  const official = buildOfficial(banks) || await getFallbackOfficial();
  let msg_text = `${FLAGS[c]} <b>${NAMES[c]} — Шилдэг банк</b>\n\n`;

  const bestBuy = findCheapest(banks,c,'buy');
  const bestSell = findCheapest(banks,c,'sell');
  if (bestBuy) msg_text += `🟢 Авах (хямд): ${bestBuy.mn} ₮${fmt(bestBuy.rates[c].sell)}\n`;
  if (bestSell) msg_text += `🔴 Зарах (өндөр): ${bestSell.mn} ₮${fmt(bestSell.rates[c].buy)}\n`;
  if (official?.[c] && bestBuy) {
    const d = bestBuy.rates[c].sell - official[c];
    msg_text += `\n💡 Монголбанктай харьцуулбал: ${d>0?'+':''}₮${fmt(d)}`;
  }

  if (c === 'usd') {
    const tad = getTransferAd();
    msg_text += `\n\n${tad.text}`;
    send(msg.chat.id, msg_text, {reply_markup:{inline_keyboard:[[{text:tad.cta, url:tad.url}]]}});
  } else {
    send(msg.chat.id, msg_text);
  }
});

// ─── /compare ───────────────────────────────────────────────────
bot.onText(/\/compare (.+)/, async (msg,m) => {
  const c = m[1].toLowerCase().trim();
  if (!CURRENCIES.includes(c)) { send(msg.chat.id,`❌ Боломжит: ${CURRENCIES.map(x=>x.toUpperCase()).join(', ')}`); return; }
  send(msg.chat.id, await compareMsg(c));
});

// ─── /share ──────────────────────────────────────────────────────
bot.onText(/\/share/, msg => {
  send(msg.chat.id, shareText(msg.chat.id), {reply_markup:{inline_keyboard:[[
    {text:'📤 Найздаа илгээх', url:`https://t.me/share/url?url=${encodeURIComponent('https://t.me/KhaanRateBot?start=ref'+msg.chat.id)}&text=${encodeURIComponent('💰 Ханшаа шалгах хамгийн хялбар арга!')}`}
  ]]}});
});

// ─── /ads /business /report ──────────────────────────────────────
bot.onText(/\/ads/, msg => { send(msg.chat.id, adPricingText()); });
bot.onText(/\/business/, msg => {
  send(msg.chat.id, `💼 <b>Бизнес API</b>\n\n₮${BUSINESS_PRICE.toLocaleString()}/сар\n• Өдөр тутмын JSON API\n• Email тайлан\n\nХолбогдох: ${BUSINESS_CONTACT}`);
});
bot.onText(/\/report/, async msg => {
  const r = await businessReport();
  if (r) send(msg.chat.id, `<pre>${r}</pre>`, {parse_mode:'HTML'});
  else send(msg.chat.id, '⚠️ Тайлан бэлтгэхэд алдаа.');
});

// ─── Callbacks ──────────────────────────────────────────────────
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
    send(chatId,'✅ Мэдэгдэл устгагдлаа.');
  }
});

// ─── User management ────────────────────────────────────────────
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
      send(a.chat_id,`🔔 ${FLAGS[a.currency.toLowerCase()]} ${NAMES[a.currency.toLowerCase()]} ₮${fmt(r)} хүрлээ!`);
      await supabase.from('alerts').update({active:false,triggered_at:new Date().toISOString()}).eq('id',a.id);
    }
  }
}
setInterval(checkAlerts, 300000);

// Channel auto-post
postToChannel(bot);
setInterval(() => postToChannel(bot), 3600000);

bot.on('polling_error', e => console.error('Poll:', e.message?.substring(0,60)));

console.log('🦁 KhaanRate running');
if (supabase) console.log('📡 Supabase: connected');

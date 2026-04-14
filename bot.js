require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
const { fetchAll, buildOfficial, CURRENCIES, CUR_MAP } = require('./bank-rates');
const { addReferralButtons, businessReport, getAd, postToChannel, BUSINESS_PRICE, BUSINESS_CONTACT } = require('./monetize');
const { shareText, getTransferAd, adPricingText, BOT_USERNAME, CHANNEL } = require('./revenue');
const { lossMessage, dailyHook, salaryMessage, viralShareMessage } = require('./engagement');
const { apiDocsMessage, apiPricingMessage, generateApiKey, getApiKey, incrementUsage } = require('./api');

const BOT_TOKEN = process.env.BOT_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const FX_API = 'https://open.er-api.com/v6/latest/USD';

const bot = new TelegramBot(BOT_TOKEN, { polling: true });
bot.on('inline_query', async q => {
  const banks = await getBanks();
  const official = buildOfficial(banks);
  if (!official) { bot.answerInlineQuery(q.id,[]); return; }
  const results = CURRENCIES.filter(c=>official[c]).map((c,i) => ({
    type:'article', id:String(i), title:`${FLAGS[c]} ${c.toUpperCase()}: ₮${fmt(official[c])}`,
    description:`${NAMES[c]} — Албан ханш`,
    input_message_content:{message_text:`${FLAGS[c]} ${c.toUpperCase()}: <b>₮${fmt(official[c])}</b>\n\n📱 @KhaanRateBot — Ханш шалгах`, parse_mode:'HTML'}
  }));
  bot.answerInlineQuery(q.id, results);
});
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
    [{text:'🔔 Ханшны мэдэгдэл'},{text:'💸 Мөнгө илгээх'}],
    [{text:'🧮 Хөрвүүлэх'},{text:'❤️ Дэмжлэг'}]
  ],resize_keyboard:true}
};

// ─── /start ──────────────────────────────────────────────────────
bot.on('message', msg => console.log('📩', msg.text?.substring(0,30), 'from', msg.chat.id));

bot.onText(/\/start/, async msg => {
  const banks = await getBanks();
  const official = buildOfficial(banks) || await getFallbackOfficial();
  
  // Hook: show compelling first message
  let welcome = `🦁 <b>KhaanRate</b>\n\n`;
  if (official?.usd) {
    welcome += `🇺🇸 1$ = <b>₮${fmt(official.usd)}</b> байна\n`;
    if (official.cny) welcome += `🇨🇳 1¥ = <b>₮${fmt(official.cny)}</b>\n`;
    if (official.eur) welcome += `🇪🇺 1€ = <b>₮${fmt(official.eur)}</b>\n`;
    
    const loss = await lossMessage(official, banks);
    if (loss) welcome += `\n⚠️ Зөв банкгүйгээр мөнгөө алдаж байна! Доорх товчийг дар 👇`;
  } else {
    welcome += `Ханшаа шалгах, банкуудыг харьцуулах, ханш өөрчлөгдөхөд мэдэгдэл авах\n\nДоорх товчийг дарж эхлээрэй 👇`;
  }
  
  send(msg.chat.id, welcome, MAIN_MENU);
  if (supabase) supabase.from('users').upsert({chat_id:msg.chat.id,username:msg.chat.username,first_name:msg.chat.first_name},{onConflict:'chat_id'}).then(()=>{});
});

// ─── 💵 Ханш харах — HOOK FIRST, then details ─────────────────
bot.onText(/💵 Ханш харах|\/rate/, async msg => {
  const banks = await getBanks();
  const official = buildOfficial(banks) || await getFallbackOfficial();
  if (!official) { send(msg.chat.id,'⚠️ Одоогоор ханш татаж чадахгүй байна. Түр хүлээнэ үү.'); return; }

  // HOOK: Show loss first — this is what makes people care
  const loss = await lossMessage(official, banks);
  if (loss) send(msg.chat.id, loss);

  // THEN: Full rates
  let msg_text = `<b>📊 Өнөөдрийн ханш</b>\n\n`;
  for (const c of CURRENCIES) {
    const r = official[c];
    if (!r) continue;
    msg_text += `${FLAGS[c]} <b>${NAMES[c]}</b> (${c.toUpperCase()})\n`;
    msg_text += `   Албан: ₮${fmt(r)}\n`;
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
  // Add viral share button
  refBtns.push([{text:'📤 Найздаа илгээх', callback_data:'share_yes'}]);
  send(msg.chat.id, msg_text, {reply_markup:{inline_keyboard:refBtns}});
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
    `📤 <b>/share</b> — найздаа илгээх\n` +
    `💼 <b>/salary</b> — цалингаа USD-р бодох\n` +
    `🔌 <b>/api</b> — API түлхүүр, үнэ\n` +
    `❤️ <b>/donate</b> — ботыг дэмжих\n\n` +
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
// ─── /content — Social media content ─────────────────────────────
bot.onText(/\/content/, async msg => {
  send(msg.chat.id, '📱 <b>Social media контент</b>\n\nАлийг харуулах вэ?', {
    reply_markup:{inline_keyboard:[
      [{text:'📘 Facebook',callback_data:'soc_fb'},{text:'📸 Instagram',callback_data:'soc_ig'}],
      [{text:'🐦 Twitter/X',callback_data:'soc_tw'},{text:'💬 Telegram',callback_data:'soc_tg'}],
      [{text:'📋 Бүгд',callback_data:'soc_all'}]
    ]}
  });
});

bot.on('callback_query', async q => {
  const chatId = q.message.chat.id;
  const data = q.data;

  // Calc callbacks — use same rich converter logic
  if (data.startsWith('calc_')) {
    bot.answerCallbackQuery(q.id);
    const parts = data.replace('calc_','').split('_');
    const amount = parseFloat(parts[0]);
    const currency = parts[1];
    const banks = await getBanks();
    const official = buildOfficial(banks);
    if (!official?.usd) return;
    
    const sortedBanks = (cur, dir) => banks
      .filter(b => b.name !== 'MongolBank' && b.name !== 'StateBank' && b.rates[cur]?.[dir])
      .sort((a,b) => dir === 'sell' ? a.rates[cur][dir] - b.rates[cur][dir] : b.rates[cur][dir] - a.rates[cur][dir]);
    
    if (currency === 'mnt') {
      let result = `💸 <b>₮${fmt(amount)} =</b>\n\n`;
      for (const c of CURRENCIES) {
        if (!official[c]) continue;
        result += `${FLAGS[c]} <b>${fmt(amount / official[c])}</b> ${c.toUpperCase()} — ${NAMES[c]}\n`;
      }
      if (amount >= 1000000 && amount <= 5000000) result += `\n💼 ≈ Цалин`;
      send(chatId, result);
    } else {
      const rate = official[currency];
      if (!rate) return;
      const mntAmount = amount * rate;
      const cheapest = sortedBanks(currency, 'sell')[0];
      const bestBuy = sortedBanks(currency, 'buy')[0];
      
      let result = `${FLAGS[currency]} <b>${fmt(amount)} ${currency.toUpperCase()} = ₮${fmt(mntAmount)}</b>\n\n`;
      result += `🏛️ Албан: ₮${fmt(rate)}/${currency.toUpperCase()}\n`;
      if (cheapest) {
        result += `🏆 ${cheapest.mn}: ₮${fmt(cheapest.rates[currency].sell)}/${currency.toUpperCase()} → <b>₮${fmt(amount * cheapest.rates[currency].sell)}</b>\n`;
      }
      if (bestBuy) {
        result += `📈 Зарвал: ${bestBuy.mn} ₮${fmt(bestBuy.rates[currency].buy)}/${currency.toUpperCase()} → ₮${fmt(amount * bestBuy.rates[currency].buy)}`;
      }
      send(chatId, result);
    }
    return;
  }

  if (data.startsWith('soc_')) {
    bot.answerCallbackQuery(q.id);
    const content = await allContent();
    const type = data.replace('soc_','');
    
    if (type === 'fb') {
      const posts = content.facebook;
      for (let i = 0; i < posts.length; i++) {
        await send(chatId, `<b>📘 Facebook #${i+1}</b>\n\n${posts[i]}`);
      }
    } else if (type === 'ig') {
      content.instagram.forEach((p,i) => send(chatId, `<b>📸 Instagram #${i+1}</b>\n\n${p}`));
    } else if (type === 'tw') {
      content.twitter.forEach((p,i) => send(chatId, `<b>🐦 Twitter #${i+1}</b>\n\n${p}`));
    } else if (type === 'tg') {
      send(chatId, `<b>💬 Telegram групп</b>\n\n${content.telegram}`);
    } else if (type === 'all') {
      send(chatId, `<b>💬 Telegram групп</b>\n\n${content.telegram}`);
      send(chatId, `<b>📘 Facebook #1</b>\n\n${content.facebook[0]}`);
      send(chatId, `<b>📸 Instagram #1</b>\n\n${content.instagram[0]}`);
      send(chatId, `<b>🐦 Twitter #1</b>\n\n${content.twitter[0]}`);
    }
    return;
  }

  if (data.startsWith('donate_')) {
    bot.answerCallbackQuery(q.id);
    const stars = parseInt(data.replace('donate_',''));
    try {
      const link = await createInvoice(chatId, stars);
      if (link) send(chatId, `⭐ <b>${stars} Stars дэмжлэг</b>\n\nТөлөх: ${link}`);
      else send(chatId, '❌ Төлбөрийн холбоос үүсгэхэд алдаа гарлаа.');
    } catch(e) { send(chatId, '❌ Алдаа гарлаа. Дараа дахин оролдоно уу.'); }
    return;
  }

  if (data.startsWith('cmp_')) {
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

const { DONATION_AMOUNTS, donateKeyboard, createInvoice, WISE_LINK, REMITLY_LINK } = require('./payments');
const { allContent } = require('./social-content');
const { autoPost } = require('./autopost');

// Channel auto-post (replaces old postToChannel)
setInterval(() => autoPost(bot), 600000); // check every 10min
autoPost(bot); // run on startup

// ─── DAILY PUSH to all users (THE growth engine) ────────────────
async function dailyPush() {
  if (!supabase) return;
  const banks = await getBanks();
  const official = buildOfficial(banks);
  if (!official?.usd) return;

  // Find cheapest bank
  const sorted = banks.filter(b=>b.name!=='MongolBank'&&b.name!=='MongolBank'&&b.rates.usd?.sell).sort((a,b)=>a.rates.usd.sell-b.rates.usd.sell);
  const cheapest = sorted[0];
  const mostExpensive = sorted[sorted.length-1];
  const savings = mostExpensive ? (mostExpensive.rates.usd.sell - cheapest.rates.usd.sell) : 0;

  const msg = `🦁 <b>KhaanRate — Өдрийн ханш</b>\n\n` +
    `🇺🇸 USD: <b>₮${fmt(official.usd)}</b>\n` +
    (official.cny ? `🇨🇳 CNY: <b>₮${fmt(official.cny)}</b>\n` : '') +
    (official.eur ? `🇪🇺 EUR: <b>₮${fmt(official.eur)}</b>\n` : '') +
    (savings > 0 ? `\n🏆 ${cheapest.mn} хамгийн хямд: Авах ₮${fmt(cheapest.rates.usd.sell)}\n💸 1000$ авбал ₮${fmt(savings*1000)} хэмнэнэ!` : '') +
    `\n\n💼 Цалингаа бодох → 💼 Цалин бодох\n📊 Дэлгэрэнгүй → 💵 Ханш харах`;

  // Get ALL users from Supabase
  const { data: users } = await supabase.from('users').select('chat_id');
  if (!users?.length) return;

  let sent = 0, errors = 0;
  for (const u of users) {
    try {
      await bot.sendMessage(u.chat_id, msg, { parse_mode: 'HTML' });
      sent++;
      if (sent % 20 === 0) await new Promise(r => setTimeout(r, 1000)); // rate limit
    } catch { errors++; }
  }
  console.log(`📢 Daily push: ${sent} sent, ${errors} errors, ${users.length} total users`);
}

// Push daily at 9am UTC+8 = 1am UTC
let lastPushDate = null;
setInterval(() => {
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  if (now.getUTCHours() === 1 && today !== lastPushDate) {
    lastPushDate = today;
    dailyPush();
  }
}, 60000);

// ─── /donate — Support with Telegram Stars ──────────────────────
bot.onText(/\/donate|❤️ Дэмжлэг/, async msg => {
  send(msg.chat.id,
    `❤️ <b>KhaanRate-г дэмжих</b>\n\n` +
    `Бот үнэгүй байхын тулд танай дэмжлэг хэрэгтэй!\n\n` +
    `⭐ Telegram Stars-аар дэмжнэ үү:`,
    {reply_markup:{inline_keyboard:[
      [{text:'☕ Кофе — 50⭐',callback_data:'donate_50'}],
      [{text:'🍕 Пицца — 150⭐',callback_data:'donate_150'}],
      [{text:'❤️ Дэмжлэг — 500⭐',callback_data:'donate_500'}],
      [{text:'🦁 Хүчирхэг — 1000⭐',callback_data:'donate_1000'}]
    ]}}
  );
});

// ─── /money — Fast money transfer (affiliate) ────────────────────
bot.onText(/\/money|💸 Мөнгө илгээх/, msg => {
  send(msg.chat.id,
    `💸 <b>Гадаадад мөнгө илгээх</b>\n\n` +
    `🌍 <b>Wise</b> — 0.5% шимтгэл, 1 цагт хүрдэг\n` +
    `Хамгийн хямд, илүү найдвартай\n\n` +
    `🚀 <b>Remitly</b> — анхны шилжүүлэгт 0%\n` +
    `Монгол руу хурдан илгээнэ`,
    {reply_markup:{inline_keyboard:[
      [{text:'🌍 Wise-р илгээх', url: WISE_LINK}],
      [{text:'🚀 Remitly-р илгээх', url: REMITLY_LINK}]
    ]}}
  );
});

// ─── 💼 Цалин бодох ──────────────────────────────────────────
bot.onText(/💼 Цалин бодох|\/salary/, async msg => {
  const banks = await getBanks();
  const official = buildOfficial(banks) || await getFallbackOfficial();
  if (!official?.usd) { send(msg.chat.id,'⚠️ Ханш татаж чадахгүй байна.'); return; }
  const s = await salaryMessage(official.usd, official.cny);
  send(msg.chat.id, s, {reply_markup:{inline_keyboard:[[
    {text:'📤 Найздаа илгээх', callback_data:'share_yes'}
  ]]}});
});

// ─── /api — API documentation & pricing ───────────────────────
bot.onText(/\/api$/, msg => { send(msg.chat.id, apiDocsMessage()); });

bot.onText(/\/api_pricing|\/api үнэ/, msg => { send(msg.chat.id, apiPricingMessage()); });

// ─── /api_key — Generate API key ────────────────────────────────
bot.onText(/\/api_key/, async msg => {
  if (!supabase) { send(msg.chat.id, '❌ API түлхүүр үүсгэх боломжгүй.'); return; }
  
  // Check if user already has a key
  const { data: existing } = await supabase.from('api_keys').select('*').eq('chat_id', msg.chat.id).single();
  if (existing) {
    send(msg.chat.id, `🔑 <b>Таны API түлхүүр:</b>\n\n<code>${existing.key}</code>\n\n📋 Төлөвлөгөө: ${existing.plan || 'free'}\n📊 Хүсэлт өнөөдөр: ${existing.requests_today || 0}/${PLANS[existing.plan||'free'].limit === Infinity ? '∞' : PLANS[existing.plan||'free'].limit}\n\n🔌 Үнэ харах → /api_pricing`);
    return;
  }
  
  const key = generateApiKey();
  const { error } = await supabase.from('api_keys').insert({
    key, chat_id: msg.chat.id, plan: 'free', requests_today: 0
  });
  
  if (error) { send(msg.chat.id, '❌ Алдаа гарлаа. Дараа дахин оролдоно уу.'); return; }
  
  send(msg.chat.id, `🔑 <b>API түлхүүр үүслээ!</b>\n\n<code>${key}</code>\n\n📋 Төлөвлөгөө: Free (100 хүсэлт/өдөр)\n\n📌 Ашиглах:\n<code>GET https://khaanrate.api/rates?key=${key}</code>\n\n⭐ Pro болгох → /api_pricing`);
});

// ─── 🧮 Хөрвүүлэх — ULTIMATE CONVERTER ────────────────────────
bot.onText(/🧮 Хөрвүүлэх|\/calc|\/convert/, async msg => {
  const official = await getOfficial();
  const usdRate = official?.usd || 3573;
  const cnyRate = official?.cny || 490;
  
  send(msg.chat.id,
    `🧮 <b>ХӨРВҮҮЛЭГЧ</b>\n\n` +
    `Тоо бичээд илгээнэ үү!\n\n` +
    `💰 <b>Валют → Төгрөг:</b>\n` +
    `<code>1000 usd</code> • <code>500 cny</code> • <code>50 eur</code>\n\n` +
    `💸 <b>Төгрөг → Валют:</b>\n` +
    `<code>1000000 mnt</code>\n\n` +
    `🔄 <b>Валют → Валют:</b>\n` +
    `<code>1000 usd cny</code> (доллар → юань)`,
    {reply_markup:{inline_keyboard:[[
      {text:'💵 Цалин 2 сая',callback_data:'calc_2000000_mnt'},
      {text:'💵 Цалин 3 сая',callback_data:'calc_3000000_mnt'}
    ],[
      {text:'🏠 10,000$',callback_data:'calc_10000_usd'},
      {text:'🚗 5,000$',callback_data:'calc_5000_usd'}
    ],[
      {text:'🏮 50,000¥',callback_data:'calc_50000_cny'},
      {text:'🎓 2,000€',callback_data:'calc_2000_eur'}
    ]]}}
  );
});

// Context references for amounts
const CONTEXTS = {
  usd: [
    [100, 'Хоол'],
    [500, 'Гар утас'],
    [1000, 'Түрээс'],
    [2000, 'Ачаалал'],
    [3000, 'Цалин (дундаж)'],
    [5000, 'Автомашин (хянадаг)'],
    [10000, 'Автомашин / Орон сууц'],
    [30000, 'Орон сууц'],
    [50000, 'Арилжааны байр'],
    [100000, 'Бизнес хөрөнгө оруулалт'],
  ],
  cny: [
    [1000, 'Цахим бараа'],
    [5000, 'Хувцас'],
    [10000, 'Тээвэр'],
    [50000, 'Машин хэсэг'],
    [100000, 'Бараа тээвэр'],
    [500000, 'Арилжааны контейнер'],
  ],
};

function getAmountContext(amount, currency) {
  const ctxs = CONTEXTS[currency] || [];
  for (const [threshold, label] of ctxs) {
    if (amount <= threshold * 1.5) return label;
  }
  return '';
}

// Smart converter: "1000 usd", "500000 mnt", "100 usd cny"
bot.onText(/^(\d[\d,.]*)\s*(usd|mnt|cny|eur|rub|jpy|krw|gbp)(?:\s+(usd|cny|eur|rub|jpy|krw|gbp))?$/i, async (msg, match) => {
  const amount = parseFloat(match[1].replace(/,/g, ''));
  const from = match[2].toLowerCase();
  const to = match[3]?.toLowerCase();
  
  const banks = await getBanks();
  const official = buildOfficial(banks);
  if (!official?.usd) { send(msg.chat.id, '⚠️ Ханш татаж чадахгүй байна'); return; }
  
  const sortedBanks = (cur, dir) => banks
    .filter(b => b.name !== 'MongolBank' && b.name !== 'StateBank' && b.rates[cur]?.[dir])
    .sort((a,b) => dir === 'sell' ? a.rates[cur][dir] - b.rates[cur][dir] : b.rates[cur][dir] - a.rates[cur][dir]);
  
  let result = '';
  
  if (from === 'mnt' && !to) {
    // ─── MNT → ALL currencies ────────────────────────
    result = `💸 <b>₮${fmt(amount)} =</b>\n\n`;
    for (const c of CURRENCIES) {
      if (!official[c]) continue;
      result += `${FLAGS[c]} <b>${fmt(amount / official[c])}</b> ${c.toUpperCase()} — ${NAMES[c]}\n`;
    }
    
    // Show best bank to SELL foreign currency (get most MNT)
    const bestUsdBuy = sortedBanks('usd', 'buy')[0];
    if (bestUsdBuy) {
      const usdAmt = amount / bestUsdBuy.rates.usd.buy;
      result += `\n💡 ${bestUsdBuy.mn}-д доллар зарвал хамгийн их төгрөг авна:\n`;
      result += `   $${fmt(usdAmt)} (₮${fmt(bestUsdBuy.rates.usd.buy)}/$)`;
    }
    
    // Context: what can you buy with this?
    if (amount >= 1000000 && amount <= 5000000) result += `\n\n💼 ≈ ${fmt(amount/official.usd)}$ цалин`;
    else if (amount >= 50000000 && amount <= 200000000) result += `\n\n🏠 ≈ Орон сууцны урьдчилгаа`;
    else if (amount >= 500000000) result += `\n\n🏢 ≈ Бизнес хөрөнгө оруулалт`;
    
  } else if (to) {
    // ─── Currency → Currency (cross rate) ────────────
    const fromRate = official[from];
    const toRate = official[to];
    if (!fromRate || !toRate) { send(msg.chat.id, '❌ Валют олдсонгүй'); return; }
    const mntAmount = amount * fromRate;
    const toAmount = mntAmount / toRate;
    
    result = `🔄 <b>${fmt(amount)} ${from.toUpperCase()} → ${fmt(toAmount)} ${to.toUpperCase()}</b>\n\n`;
    result += `${FLAGS[from]} ${fmt(amount)} ${from.toUpperCase()}\n`;
    result += `↓ × ₮${fmt(fromRate)}/${from.toUpperCase()}\n`;
    result += `₮${fmt(mntAmount)}\n`;
    result += `↓ ÷ ₮${fmt(toRate)}/${to.toUpperCase()}\n`;
    result += `${FLAGS[to]} <b>${fmt(toAmount)} ${to.toUpperCase()}</b>\n`;
    result += `\n📊 Ханш: 1 ${from.toUpperCase()} = ${fmt(fromRate/toRate)} ${to.toUpperCase()}`;
    
  } else {
    // ─── Currency → MNT (MAIN CONVERTER) ───────────
    const rate = official[from];
    if (!rate) { send(msg.chat.id, '❌ Валют олдсонгүй'); return; }
    const mntAmount = amount * rate;
    const cheapest = sortedBanks(from, 'sell')[0];
    const worst = [...sortedBanks(from, 'sell')].pop();
    const bestBuy = sortedBanks(from, 'buy')[0];
    const contextLabel = getAmountContext(amount, from);
    
    // HEADER with context
    result = `${FLAGS[from]} <b>${fmt(amount)} ${from.toUpperCase()}`;
    if (contextLabel) result += ` — ${contextLabel}`;
    result += `</b>\n\n`;
    
    // OFFICIAL
    result += `🏛️ Албан: ₮${fmt(rate)}/${from.toUpperCase()} → <b>₮${fmt(mntAmount)}</b>\n\n`;
    
    // ALL BANKS comparison
    if (sortedBanks(from, 'sell').length) {
      result += `🏦 <b>БАНКУУД:</b>\n`;
      for (const b of sortedBanks(from, 'sell')) {
        const bankMnt = amount * b.rates[from].sell;
        const diff = bankMnt - (cheapest ? amount * cheapest.rates[from].sell : mntAmount);
        const trophy = b === cheapest ? '🏆' : (diff > 0 ? `(+₮${fmt(diff)})` : '');
        result += `${trophy ? trophy + ' ' : ''}${b.mn}: ₮${fmt(b.rates[from].sell)}/${from.toUpperCase()} → <b>₮${fmt(bankMnt)}</b>\n`;
      }
      
      // SAVINGS
      if (cheapest && worst && worst.name !== cheapest.name) {
        const cheapMnt = amount * cheapest.rates[from].sell;
        const worstMnt = amount * worst.rates[from].sell;
        const savings = worstMnt - cheapMnt;
        if (savings > 0) {
          result += `\n💸 <b>ХЭМНЭЛТ:</b> ${cheapest.mn}-р ${worst.mn}-аас аввал <b>₮${fmt(savings)}</b> хэмнэнэ!\n`;
          result += `   ${worst.mn}: ₮${fmt(worstMnt)}\n`;
          result += `   ${cheapest.mn}: ₮${fmt(cheapMnt)}\n`;
          result += `   ────────\n`;
          result += `   Хэмнэлт: <b>₮${fmt(savings)}</b> 🎉`;
        }
      }
      
      // SELL TIP (reverse direction)
      if (bestBuy) {
        result += `\n\n📈 <b>ЗАРВАЛ:</b> ${fmt(amount)} ${from.toUpperCase()} → ₮${fmt(amount * bestBuy.rates[from].buy)}`;
        result += ` (${bestBuy.mn}: ₮${fmt(bestBuy.rates[from].buy)}/${from.toUpperCase()})`;
      }
    }
    
    // CROSS RATES (what else could you buy?)
    result += `\n\n🔄 <b>ӨӨР ВАЛЮТААР:</b>\n`;
    for (const c of CURRENCIES) {
      if (c === from || !official[c]) continue;
      result += `${FLAGS[c]} ${fmt(mntAmount / official[c])} ${c.toUpperCase()}\n`;
    }
    
    // QUICK AMOUNTS
    result += `\n🧮 <b>Хурдан:</b>\n`;
    result += `<code>${Math.round(amount/2)} ${from}</code> • <code>${Math.round(amount*2)} ${from}</code> • <code>${Math.round(amount*5)} ${from}</code>`;
  }
  
  send(msg.chat.id, result);
});

bot.on('polling_error', e => console.error('Poll:', e.message?.substring(0,60)));

console.log('🦁 KhaanRate running');
if (supabase) console.log('📡 Supabase: connected');

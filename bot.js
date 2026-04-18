// 🦁 KhaanRate v12 — Financial Data Hub
require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
const { fetchAll, buildOfficial, startBackgroundRefresh, CURRENCIES } = require('./bank-rates');
const { addReferralButtons, businessReport, getAd } = require('./monetize');
const { BOT_USERNAME, CHANNEL } = require('./revenue');
const cache = require('./cache');
const U = require('./unified');

// Start background rate refresh (15min interval)
startBackgroundRefresh(15 * 60 * 1000);

const BOT_TOKEN = process.env.BOT_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

const bot = new TelegramBot(BOT_TOKEN, { polling: true });
const supabase = SUPABASE_URL ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;

const send = (id, text, opts) => bot.sendMessage(id, text, { parse_mode: 'HTML', ...opts });

// ─── Share button builder ────────────────────────────────────────
function shareBtn(label, text) {
  const shareText = encodeURIComponent(text || label);
  return { inline_keyboard: [[
    { text: '📤 Хуваалцах', url: `https://t.me/share/url?url=https://t.me/${BOT_USERNAME}&text=${shareText}` }
  ]]};
}

// ─── Affiliate links (context-aware) ──────────────────────────────
const AFFILIATES = {
  remit:   { text: '💸 Wise-р мөнгө илгээх', url: 'https://wise.com/invite/u/cl7w1' },
  lendmn:  { text: '📱 LendMN онлайн зээл', url: 'https://lendmn.mn' },
  car_ins: { text: '🚗 Даатгалын харьцуулалт', url: 'https://mip.mn' },
};

function affiliateBtns(context) {
  const btns = [];
  if (['usd','eur','krw','gbp'].includes(context)) btns.push(AFFILIATES.remit);
  if (context === 'credit' || context === 'loan') btns.push(AFFILIATES.lendmn);
  if (context === 'car') btns.push(AFFILIATES.car_ins);
  return btns.length ? { inline_keyboard: [btns.map(b => ({ text: b.text, url: b.url }))] } : null;
}

// ─── Main menu — CONVERTER-FIRST ────────────────────────────────
const MAIN_MENU = {
  reply_markup:{keyboard:[
    [{text:'🔄 Хөрвүүлэх'},{text:'💵 Ханш'}],
    [{text:'🏠 Зээл'},{text:'🚗 Машин'}],
    [{text:'⚙️ Бусад'}]
  ],resize_keyboard:true}
};

// ─── Inline mode ─────────────────────────────────────────────────
bot.on('inline_query', async q => {
  const banks = await fetchAll();
  const official = buildOfficial(banks);
  if (!official?.usd) { bot.answerInlineQuery(q.id, []); return; }

  const query = q.query.toLowerCase().trim();
  let results = [];
  const match = query.match(/^(\d[\d,.]*)\s*(usd|mnt|cny|eur|rub|jpy|krw|gbp)$/i);

  if (match) {
    const amount = parseFloat(match[1].replace(/,/g, ''));
    const currency = match[2].toLowerCase();
    if (currency === 'mnt') {
      results.push({ type:'article', id:'1', title:`₮${U.fmt(amount)} → $${U.fmt(amount/official.usd)}`, description:'Төгрөгийг валют руу', input_message_content:{ message_text:`💸 ₮${U.fmt(amount)} = $${U.fmt(amount/official.usd)}`, parse_mode:'HTML' }});
    } else {
      const rate = official[currency];
      if (rate) results.push({ type:'article', id:'1', title:`${U.fmt(amount)} ${currency.toUpperCase()} → ₮${U.fmt(amount*rate)}`, description:`${U.NAMES[currency]} → Төгрөг`, input_message_content:{ message_text:`${U.FLAGS[currency]} ${U.fmt(amount)} ${currency.toUpperCase()} = ₮${U.fmt(amount*rate)}`, parse_mode:'HTML' }});
    }
  } else {
    let rateText = `📊 Өнөөдрийн ханш\n\n`;
    for (const c of CURRENCIES) { if (!official[c]) continue; rateText += `${U.FLAGS[c]} 1 ${c.toUpperCase()} = ₮${U.fmt(official[c])}\n`; }
    rateText += `\n🦁 @KhaanRateBot`;
    results.push({ type:'article', id:'1', title:'📊 KhaanRate — Ханш', description:`USD ₮${U.fmt(official.usd)}`, input_message_content:{ message_text: rateText, parse_mode:'HTML' }});
  }
  bot.answerInlineQuery(q.id, results, { cache_time: 300 });
});

// ═══════════════════════════════════════════════════════════════════
// COMMANDS
// ═══════════════════════════════════════════════════════════════════

// ─── /start — VALUE-FIRST GREETING ────────────────────────────────
bot.onText(/\/start/, async msg => {
  const banks = await fetchAll();
  const official = buildOfficial(banks);
  let greeting = `🦁 <b>KhaanRate — Мөнгөө хэмнэ</b>\n\n`;
  if (official?.usd) {
    // Calculate real savings
    const usdSellers = banks.filter(b=>b.name!=='MongolBank'&&b.name!=='StateBank'&&b.rates.usd?.sell).sort((a,b2)=>a.rates.usd.sell-b2.rates.usd.sell);
    const cheapest = usdSellers[0];
    const expensive = usdSellers[usdSellers.length-1];
    const savingPerUsd = expensive?.rates.usd.sell - cheapest?.rates.usd.sell;

    greeting += `🇺🇸 1$ = ₮${U.fmt(official.usd)} | 🇨🇳 1¥ = ₮${U.fmt(official.cny)}\n\n`;
    if (savingPerUsd > 0 && cheapest) {
      greeting += `💸 Зөв банк сонгвэл $1000-д ₮${U.fmt(savingPerUsd * 1000)} хэмнэнэ!\n`;
      greeting += `🏆 Хямд: ${cheapest.mn} ₮${U.fmt(cheapest.rates.usd.sell)} | ${expensive.mn} ₮${U.fmt(expensive.rates.usd.sell)}\n\n`;
    }
  }
  greeting += `<b>Шууд бич: <code>1000 usd</code></b>\n\n`;
  greeting += `🔄 Хөрвүүлэх → валют хөрвүүлэх + банк харьцуулах\n`;
  greeting += `💵 Ханш → хамгийн хямд банк\n`;
  greeting += `🏠 Зээл → ипотек + кредит\n`;
  greeting += `🚗 Машин → импорт + татвар\n`;
  greeting += `⚙️ Бусад → мэдэгдэл + илгээх\n\n`;
  greeting += `⚠️ <i>Анхаар: Энэхүү тооцооллууд нь ойролцоо утга бөгөөд албан ёсны баримт бичиг болохгүй. Яг тодорхой ханш, зээлийн нөхцөлийг холбогдох банкнаас лавлана уу.</i>`;
  send(msg.chat.id, greeting, MAIN_MENU);
  if (supabase) supabase.from('users').upsert({chat_id:msg.chat.id,username:msg.chat.username,first_name:msg.chat.first_name},{onConflict:'chat_id'}).then(()=>{});
});





// Smart converter (currency)
bot.onText(/^(\d[\d,.]*)\s*(usd|mnt|cny|eur|rub|jpy|krw|gbp)(?:\s+(usd|cny|eur|rub|jpy|krw|gbp))?$/i, async (msg, match) => {
  const amount = parseFloat(match[1].replace(/,/g, ''));
  const from = match[2].toLowerCase();
  const to = match[3]?.toLowerCase();
  const result = await U.convertCurrency(amount, from, to || null);
  const convText = U.formatConversion(result);
  const shareUrl = `https://t.me/share/url?url=https://t.me/${BOT_USERNAME}&text=${encodeURIComponent('Би @KhaanRateBot дээр ' + U.fmt(amount) + ' ' + from.toUpperCase() + ' хөрвүүлж ₮' + U.fmt(result.mntAmount) + ' хэмнэлт оллоо!')}`;
  const affBtns = affiliateBtns(from);
  const btns = [{ text: '📤 Хуваалцах', url: shareUrl }];
  if (affBtns?.inline_keyboard) btns.push(...affBtns.inline_keyboard[0]);
  send(msg.chat.id, convText, { reply_markup: { inline_keyboard: [btns] } });
});

// Smart loan converter — Human-like input
// Patterns: "100сая ипотек 20жил 30%", "5сая кредит 12", "80сая байр", "10сая бизнес 36", "зээл 80000000 30 20"
bot.onText(/^(?:(\d[\d,.]*)\s*(сая|м|мянга|s)?\s*(ипотек|байр|зээл|кредит|credit|mortgage|бизнес|business)(?:\s*(\d+)\s*(?:жил|ж|j))?\s*(?:(\d+)\s*(?:хувь|%))?|зээл\s+(\d[\d,.]*)\s*(?:(\d+)\s*)?(?:(\d+)\s*)?(?:(\d[\d,.]*)\s*)?)$/i, async (msg, match) => {
  let amount = parseFloat((match[1] || match[6] || '0').replace(/,/g, ''));
  const unit = (match[2] || '').toLowerCase();
  const type = (match[3] || '').toLowerCase();
  const yearsArg = match[4];
  const downArg = match[5];
  const arg2 = match[7];
  const arg3 = match[8];
  const arg4 = match[9];

  // Unit multiplier
  if (unit === 'сая' || unit === 'm' || unit === 's') amount *= 1000000;
  else if (unit === 'мянга') amount *= 1000;

  if (amount < 100000) return;

  const isCredit = /кредит|credit/i.test(type);
  const isBusiness = /бизнес|business/i.test(type);

  if (isBusiness) {
    const months = parseInt(yearsArg || arg2) * (/сар/.test(yearsArg||'') ? 1 : 12) || parseInt(yearsArg || arg2) || 36;
    try {
      const result = U.calculateBusinessLoan({ amount, months });
      send(msg.chat.id, U.formatBusinessLoan(result));
    } catch(e) { send(msg.chat.id, '❌ Тооцоолж чадахгүй байна'); }
  } else if (isCredit) {
    const months = parseInt(yearsArg || arg2) || 12;
    const salary = parseFloat(downArg || arg3) || 2000000;
    try {
      const result = await U.calculatePersonalLoan({ amount, months, salary });
      send(msg.chat.id, U.formatPersonalLoan(result));
    } catch(e) { send(msg.chat.id, '❌ Тооцоолж чадахгүй байна'); }
  } else {
    // Mortgage: smart defaults — 30% down, 20 years
    const years = parseInt(yearsArg) || parseInt(arg3) || 20;
    const downPct = parseFloat(downArg) || parseFloat(arg2) || 30;
    const salary = parseFloat(arg4) || null;
    try {
      const result = await U.calculateMortgage({ propertyPrice: amount, downPct, years, salary, currency: 'mnt' });
      send(msg.chat.id, U.formatSmartMortgage(result));
    } catch(e) { send(msg.chat.id, '❌ Тооцоолж чадахгүй байна'); }
  }
});

// ─── 🔄 Хөрвүүлэх — CORE FEATURE ──────────────────────────────────
bot.onText(/🔄 Хөрвүүлэх|\/calc|\/convert/, async msg => {
  const official = await U.getOfficial();
  let text = `🔄 <b>ХӨРВҮҮЛЭГЧ</b>\n\n`;
  text += `Шууд бичээд илгээнэ үү:\n\n`;
  text += `<code>1000 usd</code> → долларыг төгрөгт\n`;
  text += `<code>500 cny</code> → юанийг төгрөгт\n`;
  text += `<code>5000000 mnt</code> → төгрөгийг валютаар\n`;
  text += `<code>1000 usd cny</code> → доллар юань руу\n\n`;
  if (official?.usd) {
    text += `📊 Одоо: 🇺🇸₮${U.fmt(official.usd)}`;
    if (official.cny) text += ` | 🇨🇳₮${U.fmt(official.cny)}`;
    text += `\n\n💰 Зөв банк сонговол $1000-д ₮2,000+ хэмнэнэ!`;
  }
  send(msg.chat.id, text, {reply_markup:{inline_keyboard:[
    [{text:'💵 1000 USD',callback_data:'calc_1000_usd'},{text:'💵 5000 USD',callback_data:'calc_5000_usd'}],
    [{text:'🏮 10000 CNY',callback_data:'calc_10000_cny'},{text:'💸 1M MNT',callback_data:'calc_1000000_mnt'}]
  ]}});
});

// ─── 💵 Банк харьцуулах — KILLER FEATURE ──────────────────────────
bot.onText(/💵 Ханш|\/rate|\/compare/, async msg => {
  const banks = await fetchAll();
  const official = buildOfficial(banks);
  if (!official) { send(msg.chat.id,'⚠️ Ханш татаж чадахгүй байна.'); return; }
  const now = new Date().toLocaleTimeString('en-US', {hour:'2-digit', minute:'2-digit', timeZone:'Asia/Ulaanbaatar'});

  let text = `<b>💵 БҮХ БАНКНЫ ХАНШ</b> | 🕐 ${now}\n\n`;

  // ─── ALL CURRENCIES TABLE ───
  const currencies = ['usd','cny','eur','rub','jpy','krw','gbp'];
  for (const cur of currencies) {
    if (!official[cur]) continue;
    const sellers = banks.filter(b=>b.rates[cur]?.sell).sort((a,b2)=>a.rates[cur].sell-b2.rates[cur].sell);
    const buyers = banks.filter(b=>b.rates[cur]?.buy).sort((a,b2)=>b2.rates[cur].buy-a.rates[cur].buy);
    if (!sellers.length) continue;

    const cheapest = sellers[0];
    const bestBuy = buyers[0];
    const spread = cheapest.rates[cur].sell - (official[cur]||0);

    text += `${U.FLAGS[cur]} <b>${cur.toUpperCase()}</b> Албан: ₮${U.fmt(official[cur])}\n`;
    text += `   📤 Авах: `;
    for (let i=0; i<sellers.length; i++) {
      const b = sellers[i];
      text += `${i===0?'🏆':''}${b.mn.replace(/🏦 |💚 |🏛️ /,'')} ₮${U.fmt(b.rates[cur].sell)}${i<sellers.length-1?' | ':''}`;
    }
    text += `\n`;
    text += `   📥 Зарах: `;
    for (let i=0; i<buyers.length; i++) {
      const b = buyers[i];
      text += `${i===0?'🏆':''}${b.mn.replace(/🏦 |💚 |🏛️ /,'')} ₮${U.fmt(b.rates[cur].buy)}${i<buyers.length-1?' | ':''}`;
    }
    if (sellers.length >= 2) {
      const save = sellers[sellers.length-1].rates[cur].sell - cheapest.rates[cur].sell;
      if (save > 0) text += `\n   💰 ${cheapest.mn.replace(/🏦 |💚 |🏛️ /,'')}-р ${cur.toUpperCase()}${cur==='jpy'||cur==='krw'?'100,000':'1,000'} авахдаа ₮${U.fmt(save*(cur==='jpy'||cur==='krw'?100000:1000))} хэмнэнэ`;
    }
    text += `\n\n`;
  }

  // ─── SAVINGS SUMMARY ───
  const usdSellers = banks.filter(b=>b.rates.usd?.sell).sort((a,b2)=>a.rates.usd.sell-b2.rates.usd.sell);
  const usdBuyers = banks.filter(b=>b.rates.usd?.buy).sort((a,b2)=>b2.rates.usd.buy-a.rates.usd.buy);
  const cheapestUsd = usdSellers[0];
  const bestBuyUsd = usdBuyers[0];
  const usdSaving = usdSellers[usdSellers.length-1]?.rates.usd.sell - cheapestUsd?.rates.usd.sell;

  text += `💰 <b>ХЭМНЭЛТ:</b> `;
  if (usdSaving > 0) text += `$1,000 авахдаа ${cheapestUsd?.mn}-р ₮${U.fmt(usdSaving*1000)} хэмнэнэ!`;
  text += `\n💡 Авахдаа ${cheapestUsd?.mn}, зарахдаа ${bestBuyUsd?.mn}-р оч`;
  text += U.disclaimer();

  const refBtns = [
    [{text:'🧮 1000 USD→MNT',callback_data:'calc_1000_usd'},{text:'🧮 5000 USD→MNT',callback_data:'calc_5000_usd'}],
    [{text:'🏮 10000 CNY→MNT',callback_data:'calc_10000_cny'},{text:'📊 Зээлийн хүү',callback_data:'rates_mortgage_mnt'}],
  ];
  send(msg.chat.id, text, {reply_markup:{inline_keyboard:refBtns}});
});



// ─── 🚗 Машины импорт — PAIN POINT FIRST ────────────────────────
bot.onText(/🚗 Машин|\/car|\/import/, msg => {
  send(msg.chat.id,
    `🚗 <b>МАШИНЫ ИМПОРТ — БҮХ ЗАРДАЛ МЭД</b>\n\nМашин авахын өмнө гааль, татвар, тээврийг бодоорой!\n\nЖишээ:\n<code>/car 2000000 jpy 2020 2000 left hybrid</code>\n<code>/car 15000 usd 2022 2000 left</code>`,
    {reply_markup:{inline_keyboard:[
      [{text:'🇯🇵 Prius 2019 ¥2M',callback_data:'carpre_japan_2000000_jpy_2019_1800_left_hybrid'},
       {text:'🇯🇵 Prius 2022 ¥2.5M',callback_data:'carpre_japan_2500000_jpy_2022_1800_left_hybrid'}],
      [{text:'🇯🇵 Land Cruiser ¥5M',callback_data:'carpre_japan_5000000_jpy_2019_4500'},
       {text:'🇨🇳 BYD 80,000¥',callback_data:'carpre_china_80000_cny_2024_1500_left'}]
    ]}}
  );
});

bot.onText(/\/car\s+(\d[\d,.]*)\s*(usd|mnt|cny|eur|jpy|krw|gbp)(?:\s+(\d{4}))?(?:\s+(\d+))?(?:\s+(left|зүүн))?(?:\s+(hybrid|хайбрид|electric|цахилгаан))?/i, async (msg, match) => {
  const price = parseFloat(match[1].replace(/,/g,''));
  const currency = match[2].toLowerCase();
  const year = match[3] ? parseInt(match[3]) : 2020;
  const cc = match[4] ? parseInt(match[4]) : 2000;
  const isLeftHand = !!(match[5] || '').match(/left|зүүн/i);
  const isHybrid = !!(match[6] || '').match(/hybrid|хайбрид/i);
  const isElectric = !!(match[6] || '').match(/electric|цахилгаан/i);
  const countryMap = { jpy:'japan', krw:'korea', cny:'china', usd:'usa', eur:'europe', gbp:'europe' };
  try {
    const result = await U.calculateCarImport({ price, currency, country: countryMap[currency]||'japan', year, cc, isLeftHand, isHybrid, isElectric });
    send(msg.chat.id, U.formatCarImport(result), {reply_markup:{inline_keyboard:[
      [{text:'🏦 Зээл авах',callback_data:'carloan'},{text:'🛡️ Даатгал',callback_data:'carins'}],
      [{text:'📤 Хуваалцах',callback_data:'share'}]
    ]}});
  } catch(e) { send(msg.chat.id, '❌ Тооцоолж чадахгүй байна'); }
});

// ─── 🏠 Зээл — ALL-IN-ONE (ипотек + кредит + хүү) ──────────────────
bot.onText(/🏠 Зээл|\/mortgage|\/rates|\/хүү/, async msg => {
  let text = `🏠 <b>ЗЭЭЛ — БҮХ ТООЦООЛОЛ</b>\n\n`;
  text += `<b>Ипотек</b> (орон сууц):\n`;
  text += `<code>/mortgage 80000000 30 20</code>\n`;
  text += `₮80M, 30% урьдчилгаа, 20 жил\n\n`;
  text += `<b>Кредит</b> (хувь хүн):\n`;
  text += `<code>/credit 5000000 12 2000000</code>\n`;
  text += `₮5M, 12 сар, ₮2M цалин`;
  send(msg.chat.id, text, {reply_markup:{inline_keyboard:[
    [{text:'🏠 ₮50M',callback_data:'mort_50000000_30_20'},{text:'🏠 ₮80M',callback_data:'mort_80000000_30_20'}],
    [{text:'🏢 ₮120M',callback_data:'mort_120000000_30_25'},{text:'🏗️ ₮200M',callback_data:'mort_200000000_30_25'}],
    [{text:'💰 ₮1M кредит',callback_data:'cred_1000000_12_1500000'},{text:'💰 ₮5M кредит',callback_data:'cred_5000000_12_3000000'}],
    [{text:'🏢 ₮10M бизнес',callback_data:'biz_10000000_36'},{text:'🏢 ₮50M бизнес',callback_data:'biz_50000000_60'}],
    [{text:'📊 Ипотекийн хүү',callback_data:'rates_mortgage_mnt'},{text:'📊 Кредитийн хүү',callback_data:'rates_personal'}],
    [{text:'📊 Бизнесийн хүү',callback_data:'rates_business'},{text:'📊 Бүх хүү',callback_data:'rates_all'}],
  ]}});
});

bot.onText(/\/mortgage\s+(\d+)\s+(\d+)\s+(\d+)(?:\s+(\d+))?/, async (msg, match) => {
  try {
    const result = await U.calculateMortgage({
      propertyPrice: parseFloat(match[1]), downPct: parseFloat(match[2]),
      years: parseFloat(match[3]), salary: match[4] ? parseFloat(match[4]) : null, currency: 'mnt'
    });
    send(msg.chat.id, U.formatSmartMortgage(result));
  } catch(e) { send(msg.chat.id, '❌ Тооцоолож чадахгүй байна'); }
});



bot.onText(/\/credit\s+(\d+)\s+(\d+)\s+(\d+)/, async (msg, match) => {
  try {
    const result = await U.calculatePersonalLoan({ amount: parseFloat(match[1]), months: parseFloat(match[2]), salary: parseFloat(match[3]) });
    send(msg.chat.id, U.formatPersonalLoan(result));
  } catch(e) { send(msg.chat.id, '❌ Тооцоолож чадахгүй байна'); }
});

bot.onText(/\/business\s+(\d+)\s+(\d+)/, (msg, match) => {
  try {
    const result = U.calculateBusinessLoan({ amount: parseFloat(match[1]), months: parseInt(match[2]) || 36 });
    send(msg.chat.id, U.formatBusinessLoan(result));
  } catch(e) { send(msg.chat.id, '❌ Тооцоолож чадахгүй байна'); }
});

// ─── ⚙️ Бусад — SETTINGS + EXTRAS ────────────────────────────────
bot.onText(/⚙️ Бусад/, async msg => {
  const official = await U.getOfficial();
  let text = `⚙️ <b>Бусад боломж</b>\n\n`;
  if (official?.usd) text += `📊 1$ = ₮${U.fmt(official.usd)}`;
  if (official?.cny) text += ` | 1¥ = ₮${U.fmt(official.cny)}`;
  text += `\n\n`;
  text += `🔔 Ханш мэдэгдэл → ханш өөрчлөгдвөл мэд\n`;
  text += `💸 Илгээх → Wise-р 3 дахин хямд\n`;
  text += `❤️ Дэмжлэг → бот үргэлж үнэгүй\n\n`;
  text += `Командууд:\n`;
  text += `<code>/alert USD 3600</code> — мэдэгдэл\n`;
  text += `<code>/money</code> — илгээх\n`;
  text += `<code>/share</code> — найздаа илгээх`;
  send(msg.chat.id, text, {reply_markup:{inline_keyboard:[
    [{text:'🔔 Мэдэгдэл нэмэх',callback_data:'addalert'},{text:'💸 Илгээх хямд',callback_data:'sendmoney'}],
    [{text:'❤️ Дэмжлэг',callback_data:'donate'},{text:'📤 Найздаа илгээх',callback_data:'share'}]
  ]}});
});


bot.onText(/\/alert (\w+) ([+-]?\d*\.?\d*)%?/, async (msg, match) => {
  const currency = match[1].toLowerCase();
  const rawTarget = match[2];
  const isPercentage = match[0].endsWith('%');
  
  if (!CURRENCIES.includes(currency)) {
    send(msg.chat.id, `❌ Боломжит: ${CURRENCIES.map(x=>x.toUpperCase()).join(', ')}`);
    return;
  }
  
  const official = await U.getOfficial();
  if (!official?.[currency]) {
    send(msg.chat.id, `❌ ${currency.toUpperCase()} ханш олдсонгүй`);
    return;
  }
  
  let target, direction;
  if (isPercentage) {
    const percent = parseFloat(rawTarget);
    const currentRate = official[currency];
    target = currentRate * (1 + percent/100);
    direction = percent >= 0 ? 'above' : 'below';
  } else {
    target = parseFloat(rawTarget);
    direction = official?.[currency] < target ? 'above' : 'below';
  }
  
  if (supabase) {
    await supabase.from('alerts').insert({
      chat_id: msg.chat.id,
      currency,
      target,
      direction,
      is_percentage: isPercentage,
      original_target: isPercentage ? parseFloat(rawTarget) : null
    });
  }
  
  const targetDisplay = isPercentage ? `${rawTarget}%` : `₮${U.fmt(target)}`;
  const currentDisplay = `₮${U.fmt(official?.[currency]||0)}`;
  send(msg.chat.id, `✅ ${U.FLAGS[currency]} ${currency.toUpperCase()} ${targetDisplay} ${direction==='above'?'дээш':'доош'} хүрвэл мэдэгдэнэ.\nОдоо: ${currentDisplay}`);
});

bot.onText(/\/delalert (.+)/, async (msg, match) => {
  if (supabase) await supabase.from('alerts').delete().eq('id', match[1]).eq('chat_id', msg.chat.id);
  send(msg.chat.id, '🗑️ Устгагдлаа');
});





// ─── /help ──────────────────────────────────────────────────────
bot.onText(/\/help/, async msg => {
  const official = await U.getOfficial();
  let text = `💡 <b>KhaanRate — МӨНГӨӨ ХЭМНЭ</b>\n\n`;
  text += `💵 Банк харьцуулах → хамгийн хямд банк\n`;
  text += `🧮 Хөрвүүлэх → \"1000 usd\" гэж бич\n`;
  text += `🚗 Машины импорт → бүх зардал урьдчилан мэд\n`;
  text += `🏠 Зээл → сарын төлбөр, хүү харьцуулах\n`;
  text += `💳 Кредит → хамгийн хямд хүү\n`;
  text += `💸 Илгээх → Wise-р 3 дахин хямд\n`;
  text += `   absolute: /alert USD 3580, percentage: /alert USD +2%\n`;
  text += `📊 Хүү харах → бүх банкны хүү\n\n`;
  if (official?.usd) text += `📊 Одоо: 1$ = ₮${U.fmt(official.usd)}`;
  send(msg.chat.id, text);
});

// ─── /debug ──────────────────────────────────────────────
bot.onText(/\/debug (.+)/, async (msg, match) => {
  const mnemonic = match[1].trim();
  const banks = await fetchAll();
  const bank = findBankByMnemonic(banks, mnemonic);
  if (!bank) {
    send(msg.chat.id, "\u274c Ban mnemonic. Haan haruulna uu.");
    return;
  }
  let url = "";
  if (bank.name === "StateBank") url = "https://www.statebank.mn/back/api/fetchrate";
  else if (bank.name === "XacBank") url = "https://xacbank.mn/api/currencies";
  else if (bank.name === "GolomtBank") url = "https://www.golomtbank.com/api/exchangerateinfo";
  else if (bank.name === "Tdbm") url = "https://www.tdbm.mn/mn/exchange-rates";
  else if (bank.name === "TransBank") url = "https://www.transbank.mn/exchange";
  let text = "📊 " + bank.mn + " — " + bank.name + "\n\n";
  for (const c of CURRENCIES) {
    const r = bank.rates[c];
    if (!r || (!r.buy && !r.sell)) continue;
    text += U.FLAGS[c] + " " + c.toUpperCase() + ": ";
    if (r.buy && r.sell) {
      text += "Buy " + U.fmt(r.buy) + " / Sell " + U.fmt(r.sell) + " ₮" + U.fmt(r.sell) + "\n";
    } else if (r.sell) {
      text += "Sell " + U.fmt(r.sell) + " ₮\n";
    } else {
      text += "Buy " + U.fmt(r.buy) + " ₮\n";
    }
  }
  text += "🕐 Сяг: " + new Date().toLocaleTimeString("en-US", {hour:"2-digit", minute:"2-digit", timeZone:"Asia/Ulaanbaatar"}) + " | " + url;
  send(msg.chat.id, text);
});

// ─── /best /share /report ────────────────────────────────────────
bot.onText(/\/best (.+)/, async (msg,m) => {
  const c = m[1].toLowerCase().trim();
  if (!CURRENCIES.includes(c)) { send(msg.chat.id,`❌ ${CURRENCIES.map(x=>x.toUpperCase()).join(', ')}`); return; }
  const banks = await fetchAll();
  const cheapest = banks.filter(b=>b.name!=='MongolBank'&&b.name!=='StateBank'&&b.rates[c]?.sell).sort((a,b2)=>a.rates[c].sell-b2.rates[c].sell)[0];
  const bestBuy = banks.filter(b=>b.name!=='MongolBank'&&b.name!=='StateBank'&&b.rates[c]?.buy).sort((a,b2)=>b2.rates[c].buy-a.rates[c].buy)[0];
  if (!cheapest) { send(msg.chat.id,`${c.toUpperCase()} олдсонгүй`); return; }
  send(msg.chat.id, `${U.FLAGS[c]} ${U.NAMES[c]}\n\n🏆 Хямд авах: ${cheapest.mn} ₮${U.fmt(cheapest.rates[c].sell)}\n🏆 Өндөр зарах: ${bestBuy.mn} ₮${U.fmt(bestBuy.rates[c].buy)}`);
});

bot.onText(/📤 Найздаа илгээх|\/share/, async msg => {
  const official = await U.getOfficial();
  const shareMsg = official ? `🔥 МӨНГӨӨ ХЭМНЭ!\n\n1$ = ₮${U.fmt(official.usd)}${official.cny?`\n1¥ = ₮${U.fmt(official.cny)}`:''}\n\n💰 Зөв банк сонгвэл ₮2,000+ хэмнэнэ\n✅ ҮНЭГҮЙ!\n\nhttps://t.me/KhaanRateBot\n📢 @khaanrate` : `🦁 KhaanRate — Мөнгөө хэмнэ\nhttps://t.me/KhaanRateBot`;
  send(msg.chat.id, `📤 <b>Найздаа илгээх:</b>\n\n${shareMsg}`);
});

bot.onText(/\/report/, msg => send(msg.chat.id, businessReport()));

// ═══════════════════════════════════════════════════════════════════
// CALLBACKS
// ═══════════════════════════════════════════════════════════════════

bot.on('callback_query', async q => {
  const chatId = q.message.chat.id;
  const data = q.data;

  // Rates
  if (data.startsWith('rates_')) {
    bot.answerCallbackQuery(q.id);
    const type = data.replace('rates_','');
    try {
      let msg;
      if (type === 'mortgage_mnt') msg = await U.formatMortgageRates('mnt');
      else if (type === 'mortgage_usd') msg = await U.formatMortgageRates('usd');
      else if (type === 'personal') msg = U.formatPersonalRates();
      else if (type === 'business') msg = U.formatBusinessRates();
      else if (type === 'car') msg = U.formatCarRates();
      else msg = await U.formatAllRates();
      send(chatId, msg);
    } catch(e) { send(chatId, '❌ Хүү татаж чадахгүй байна'); }
    return;
  }

  // Bank compare
  if (data.startsWith('cmp_')) {
    bot.answerCallbackQuery(q.id);
    const c = data.replace('cmp_','');
    const banks = await fetchAll();
    const official = buildOfficial(banks);
    const sorted = banks.filter(b=>b.rates[c]?.sell).sort((a,b2)=>a.rates[c].sell-b2.rates[c].sell);
    const sortedBuy = banks.filter(b=>b.rates[c]?.buy).sort((a,b2)=>b2.rates[c].buy-a.rates[c].buy);
    if (!sorted.length) { send(chatId, 'Олдсонгүй'); return; }
    const cheapest = sorted[0];
    const expensive = sorted[sorted.length-1];
    const bestBuy = sortedBuy[0];
    const diff = expensive.rates[c].sell - cheapest.rates[c].sell;
    const officialRate = official?.[c] || 0;

    let text = `${U.FLAGS[c]} <b>${U.NAMES[c]} — ХЭМНЭЛТЭЭ ОЛ</b>\n`;
    if (officialRate) text += `Албан ханш: ₮${U.fmt(officialRate)}\n\n`;

    text += `📊 <b>Авах үнэ (хямдаас):</b>\n`;
    sorted.forEach((b,i) => {
      const overpay = b.rates[c].sell - cheapest.rates[c].sell;
      text += `${i===0?'🏆':'  '} ${b.mn}: ₮${U.fmt(b.rates[c].sell)}`;
      if (i > 0 && overpay > 0) text += ` (+₮${U.fmt(overpay)})`;
      text += `\n`;
    });
    text += `\n📊 <b>Зарах үнэ (өндөрөөс):</b>\n`;
    sortedBuy.forEach((b,i) => text += `${i===0?'🏆':'  '} ${b.mn}: ₮${U.fmt(b.rates[c].buy)}\n`);

    if (diff > 0) {
      text += `\n💰 <b>Хэмнэлт:</b>\n`;
      const amounts = c==='jpy'?[100000,500000,1000000]:c==='krw'?[500000,1000000,5000000]:c==='rub'?[100000,500000,1000000]:[500,1000,5000];
      const unit = c.toUpperCase();
      amounts.forEach(a => text += `   ${U.fmt(a)} ${unit} → ₮${U.fmt(diff*a)} хэмнэнэ\n`);
    }
    if (officialRate) {
      const spread = cheapest.rates[c].sell - officialRate;
      if (spread > 0) text += `\n⚠️ Банкнууд албан ханшаас ₮${U.fmt(spread)}/${c.toUpperCase()} илүү авна`;
    }
    text += `\n\n💡 ${cheapest.mn}-р ${U.NAMES[c]} авбал хамгийн хямд`;
    send(chatId, text);
    return;
  }

  // Car presets
  if (data.startsWith('carpre_')) {
    bot.answerCallbackQuery(q.id);
    const parts = data.replace('carpre_','').split('_');
    const country = parts[0], price = parseFloat(parts[1]), currency = parts[2], year = parseInt(parts[3])||2020, cc = parseInt(parts[4])||2000;
    const isLeftHand = parts.includes('left'), isHybrid = parts.includes('hybrid'), isElectric = parts.includes('electric');
    try {
      const result = await U.calculateCarImport({ price, currency, country, year, cc, isLeftHand, isHybrid, isElectric });
      send(chatId, U.formatCarImport(result), {reply_markup:{inline_keyboard:[[{text:'📤 Хуваалцах',callback_data:'share'}]]}});
    } catch(e) { send(chatId, '❌ Алдаа'); }
    return;
  }

  if (data.startsWith('car_') && !data.startsWith('carloan') && !data.startsWith('carins')) {
    bot.answerCallbackQuery(q.id);
    send(chatId, `Жишээ: <code>/car 2000000 ${data.replace('car_','')} 2020 2000 left</code>`);
    return;
  }

  if (data.startsWith('carloan')) {
    bot.answerCallbackQuery(q.id);
    send(chatId, `🏦 <b>Автомашины зээл</b>\n\n📌 20-30% урьдчилгаа\n📌 3-7 жилийн хугацаа\n📌 Сарын орлогын баталгаа\n\n📊 Хүү харах → 📊 Хүү харах`);
    return;
  }

  if (data.startsWith('carins')) {
    bot.answerCallbackQuery(q.id);
    send(chatId, `🛡️ <b>Даатгал</b>\n\nМашин авмагц ЗААВАЛ!\n💰 ₮300,000—₮1,500,000/жил`);
    return;
  }

  // Mortgage quick
  if (data.startsWith('mort_')) {
    bot.answerCallbackQuery(q.id);
    const parts = data.replace('mort_','').split('_');
    try {
      const result = await U.calculateMortgage({ propertyPrice: parseFloat(parts[0]), downPct: parseFloat(parts[1]), years: parseFloat(parts[2]), salary: null, currency: 'mnt' });
      send(chatId, U.formatSmartMortgage(result));
    } catch(e) { send(chatId, '❌ Алдаа'); }
    return;
  }

  // Credit quick
  if (data.startsWith('cred_')) {
    bot.answerCallbackQuery(q.id);
    const parts = data.replace('cred_','').split('_');
    try {
      const result = await U.calculatePersonalLoan({ amount: parseFloat(parts[0]), months: parseFloat(parts[1]), salary: parseFloat(parts[2]) });
      send(chatId, U.formatPersonalLoan(result));
    } catch(e) { send(chatId, '❌ Алдаа'); }
    return;
  }

  // Business loan quick
  if (data.startsWith('biz_')) {
    bot.answerCallbackQuery(q.id);
    const parts = data.replace('biz_','').split('_');
    try {
      const result = U.calculateBusinessLoan({ amount: parseFloat(parts[0]), months: parseInt(parts[1]) || 36 });
      send(chatId, U.formatBusinessLoan(result));
    } catch(e) { send(chatId, '❌ Алдаа'); }
    return;
  }

  // Calc quick
  if (data.startsWith('calc_')) {
    bot.answerCallbackQuery(q.id);
    const parts = data.replace('calc_','').split('_');
    const amount = parseFloat(parts[0]), currency = parts[1];
    try {
      const result = await U.convertCurrency(amount, currency, null);
      send(chatId, U.formatConversion(result));
    } catch(e) { send(chatId, '❌ Алдаа'); }
    return;
  }

  // Donate
  if (data.startsWith('donate_')) {
    bot.answerCallbackQuery(q.id);
    send(chatId, `❤️ Баярлалаа! Одоогоор Stars төлбөр нэмэгдэх дөхөж байна.`);
    return;
  }

  // Share
  if (data === 'share') {
    bot.answerCallbackQuery(q.id);
    const official = await U.getOfficial();
    const shareMsg = official ? `🔥 МӨНГӨӨ ХЭМНЭ!\n\n1$ = ₮${U.fmt(official.usd)}\n\n💰 Зөв банк + ₮2,000+ хэмнэлт\n✅ ҮНЭГҮЙ!\n\nhttps://t.me/KhaanRateBot\n📢 @khaanrate` : `🦁 KhaanRate\nhttps://t.me/KhaanRateBot`;
    send(chatId, `📤 <b>Найздаа илгээх:</b>\n\n${shareMsg}`);
    return;
  }

  // Add alert
  if (data === 'addalert') {
    bot.answerCallbackQuery(q.id);
    const official = await U.getOfficial();
    let text = `🔔 <b>Ханш мэдэгдэл</b>\n\nХанш өөрчлөгдвөл бид танд мэдэгдэнэ!\n\n<code>/alert USD 3600</code>\n<code>/alert CNY 490</code>\n\n`;
    if (official?.usd) text += `📊 Одоо: USD ₮${U.fmt(official.usd)}`;
    if (official?.cny) text += ` | CNY ₮${U.fmt(official.cny)}`;
    send(chatId, text);
    return;
  }

  // Send money
  if (data === 'sendmoney') {
    bot.answerCallbackQuery(q.id);
    send(chatId, `💸 <b>Илгээх — ХЭМНЭ</b>\n\n🌍 Wise: банкнаас 3-5 дахин хямд\n🚀 Remitly: 15 минутад хүргэнэ\n\n💡 $1000 илгээхэд Wise-р ~₮65,000 хэмнэнэ`, {reply_markup:{inline_keyboard:[
      [{text:'🌍 Wise — хямд', url:'https://wise.com/gb/send-money/send-money-to-mongolia'}],
      [{text:'🚀 Remitly — хурдан', url:'https://www.remitly.com/us/en/mongolia'}]
    ]}});
    return;
  }

  // Donate
  if (data === 'donate') {
    bot.answerCallbackQuery(q.id);
    send(chatId, `❤️ <b>KhaanRate-г дэмжих</b>\n\nЭнэ бот үргэлж үнэгүй!\nДоорх одоо дарж дэмжээрэй:`, {reply_markup:{inline_keyboard:[
      [{text:'☕ 50⭐',callback_data:'donate_50'},{text:'🍕 150⭐',callback_data:'donate_150'}],
      [{text:'❤️ 500⭐',callback_data:'donate_500'},{text:'🦁 1000⭐',callback_data:'donate_1000'}]
    ]}});
    return;
  }

  // Delete alert
  if (data.startsWith('del_')) {
    if (supabase) await supabase.from('alerts').delete().eq('id', data.replace('del_','')).eq('chat_id', chatId);
    bot.answerCallbackQuery(q.id, {text:'🗑️ Устгагдлаа'});
    send(chatId, '✅ Устгагдлаа');
    return;
  }

  bot.answerCallbackQuery(q.id);
});

// ═══════════════════════════════════════════════════════════════════
// BACKGROUND JOBS
// ═══════════════════════════════════════════════════════════════════

async function checkAlerts() {
  if (!supabase) return;
  const { data: alerts } = await supabase.from('alerts').select('*');
  if (!alerts?.length) return;
  const official = await U.getOfficial(); if (!official) return;
  for (const a of alerts) {
    const rate = official[a.currency]; if (!rate) continue;
    let triggered = false;
    if (a.is_percentage) {
      // For percentage alerts, calculate change from approximate original rate
      // We store the original_target percentage, so we can compute what the rate should be
      const changePercent = a.original_target || 0;
      const currentRate = official[a.currency];
      // Approximate original rate when alert was set
      // If alert was set for +5% and current rate is known, original ≈ current / (1 + changePercent/100)
      const originalRate = currentRate / (1 + changePercent/100);
      const actualChangePercent = ((currentRate - originalRate) / originalRate) * 100;
      triggered = a.direction === 'above' ? actualChangePercent >= changePercent : actualChangePercent <= changePercent;
    } else {
      // Absolute value alert
      triggered = a.direction === 'above' ? rate >= a.target : rate <= a.target;
    }
    if (triggered) {
      const changeInfo = a.is_percentage ? 
        ` (${a.original_target >= 0 ? '+' : ''}${a.original_target}% шинчлэг)` : 
        '';
      send(a.chat_id, `🔔 ${U.FLAGS[a.currency]} ${a.currency.toUpperCase()} одоо <b>₮${U.fmt(rate)}</b>${changeInfo} — таны мэдэгдэл идэвхжлээ!`);
      await supabase.from('alerts').delete().eq('id',a.id);
    }
  }
}
setInterval(checkAlerts, 300000);

// Daily push at 9AM UTC+8
async function dailyPush() {
  if (!supabase) return;
  const { data: users } = await supabase.from('users').select('chat_id');
  if (!users?.length) return;
  const banks = await fetchAll();
  const official = buildOfficial(banks); if (!official?.usd) return;
  const usdSellers = banks.filter(b=>b.name!=='MongolBank'&&b.name!=='StateBank'&&b.rates.usd?.sell).sort((a,b2)=>a.rates.usd.sell-b2.rates.usd.sell);
  const cheapest = usdSellers[0];
  const savingPerUsd = usdSellers.length>=2 ? usdSellers[usdSellers.length-1].rates.usd.sell - cheapest.rates.usd.sell : 0;

  let msg = `☀️ <b>ӨДРИЙН ХАНШ</b>\n\n🇺🇸 1$ = ₮${U.fmt(official.usd)}`;
  if (official.cny) msg += ` | 🇨🇳 1¥ = ₮${U.fmt(official.cny)}`;
  msg += `\n`;
  if (cheapest && savingPerUsd > 0) {
    msg += `🏆 Хямд банк: ${cheapest.mn} → $1000-д ₮${U.fmt(savingPerUsd * 1000)} хэмнэнэ\n`;
  }
  msg += `\n👇 💵 Банк харьцуулах товчийг дар`;  
  for (const u of users) { try { await send(u.chat_id, msg, MAIN_MENU); } catch {} }
}
const UTC8_9AM = 1; let lastPushDate = null;
setInterval(() => { const now = new Date(); const today = now.toISOString().split('T')[0]; if (now.getUTCHours() === UTC8_9AM && today !== lastPushDate) { lastPushDate = today; dailyPush(); } }, 60000);

// Debug
bot.on('message', msg => { if (msg.text && !msg.text.startsWith('/')) console.log('📩', msg.text.substring(0,30), 'from', msg.chat.id); });
bot.on('polling_error', e => console.error('Poll:', e.message?.substring(0,60)));

console.log('🦁 KhaanRate v8 — Unified & Correct');

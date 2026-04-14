// 🦁 KhaanRate v8 — Unified, Correct, Consistent
require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
const { fetchAll, buildOfficial, CURRENCIES } = require('./bank-rates');
const { addReferralButtons, businessReport, getAd } = require('./monetize');
const { BOT_USERNAME, CHANNEL } = require('./revenue');
const U = require('./unified');

const BOT_TOKEN = process.env.BOT_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

const bot = new TelegramBot(BOT_TOKEN, { polling: true });
const supabase = SUPABASE_URL ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;

const send = (id, text, opts) => bot.sendMessage(id, text, { parse_mode: 'HTML', ...opts });

// ─── Main menu — VALUE-FIRST ────────────────────────────────────
const MAIN_MENU = {
  reply_markup:{keyboard:[
    [{text:'💵 Банк харьцуулах'},{text:'🧮 Хөрвүүлэх'}],
    [{text:'🚗 Машины импорт'},{text:'🏠 Зээл тооцоолох'}],
    [{text:'💳 Кредит'},{text:'💸 Илгээх хямд'}],
    [{text:'🔔 Ханш мэдэгдэл'},{text:'📊 Хүү харах'}]
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
  greeting += `<b>Та юу хийж чадах вэ?</b>\n\n`;
  greeting += `💵 Банк харьцуулах → хамгийн хямдыг ол\n`;
  greeting += `🧮 Хөрвүүлэх → "1000 usd" гэж бич\n`;
  greeting += `🚗 Машины импорт → бүх зардал урьдчилан мэд\n`;
  greeting += `🏠 Зээл → сарын төлбөр тооцоол\n`;
  greeting += `💳 Кредит → хамгийн хямд хүүг ол\n`;
  greeting += `💸 Илгээх → Wise-р 3 дахин хямд\n`;
  greeting += `🔔 Мэдэгдэл → ханш өөрчлөгдвөл мэд\n\n`;
  greeting += `👇 Товч дарж эхлээрэй`;
  send(msg.chat.id, greeting, MAIN_MENU);
  if (supabase) supabase.from('users').upsert({chat_id:msg.chat.id,username:msg.chat.username,first_name:msg.chat.first_name},{onConflict:'chat_id'}).then(()=>{});
});

// ─── 💵 Ханш харах ──────────────────────────────────────────────
bot.onText(/💵 Ханш харах|\/rate/, async msg => {
  const banks = await fetchAll();
  const official = buildOfficial(banks);
  if (!official) { send(msg.chat.id,'⚠️ Ханш татаж чадахгүй байна.'); return; }

  let msg_text = `<b>📊 Өнөөдрийн ханш</b>\n\n`;
  for (const c of CURRENCIES) {
    const r = official[c]; if (!r) continue;
    msg_text += `${U.FLAGS[c]} <b>${U.NAMES[c]}</b> (${c.toUpperCase()})\n`;
    msg_text += `   Албан: ₮${U.fmt(r)}\n`;
    for (const b of banks) {
      if (b.name==='MongolBank'||b.name==='StateBank') continue;
      const br = b.rates[c]; if (!br?.sell && !br?.buy) continue;
      const cheapest = banks.filter(x=>x.name!=='MongolBank'&&x.name!=='StateBank'&&x.rates[c]?.sell).sort((a,b2)=>a.rates[c].sell-b2.rates[c].sell)[0];
      const trophy = cheapest?.name===b.name ? ' 🏆' : '';
      msg_text += `   ${b.mn}: Авах ₮${U.fmt(br.sell)} | Зарах ₮${U.fmt(br.buy)}${trophy}\n`;
    }
    msg_text += '\n';
  }
  msg_text += '🏆 = хамгийн хямд авах үнэ';

  const refBtns = addReferralButtons(banks);
  refBtns.push([{text:'📤 Найздаа илгээх', callback_data:'share'}]);
  const ad = getAd(); if (ad) msg_text += `\n\n${ad}`;
  send(msg.chat.id, msg_text, {reply_markup:{inline_keyboard:refBtns}});
});

// ─── 🧮 Хөрвүүлэх ────────────────────────────────────────────────
bot.onText(/🧮 Хөрвүүлэх|\/calc|\/convert/, async msg => {
  send(msg.chat.id,
    `🧮 <b>ХӨРВҮҮЛЭГЧ</b>\n\nТоо бичээд илгээнэ үү:\n\n` +
    `<code>1000 usd</code> → долларыг төгрөгт\n` +
    `<code>500 cny</code> → юанийг төгрөгт\n` +
    `<code>1000000 mnt</code> → төгрөгийг валютаар\n` +
    `<code>1000 usd cny</code> → доллар → юань`,
    {reply_markup:{inline_keyboard:[
      [{text:'💵 1000 USD → MNT',callback_data:'calc_1000_usd'},{text:'💵 5000 USD → MNT',callback_data:'calc_5000_usd'}],
      [{text:'🏮 10000 CNY → MNT',callback_data:'calc_10000_cny'},{text:'💸 1,000,000 MNT → USD',callback_data:'calc_1000000_mnt'}]
    ]}}
  );
});

// Smart converter
bot.onText(/^(\d[\d,.]*)\s*(usd|mnt|cny|eur|rub|jpy|krw|gbp)(?:\s+(usd|cny|eur|rub|jpy|krw|gbp))?$/i, async (msg, match) => {
  const amount = parseFloat(match[1].replace(/,/g, ''));
  const from = match[2].toLowerCase();
  const to = match[3]?.toLowerCase();
  const result = await U.convertCurrency(amount, from, to || null);
  send(msg.chat.id, U.formatConversion(result));
});

// ─── 🏦 Банк харьцуулах ──────────────────────────────────────────
bot.onText(/🏦 Банк харьцуулах|\/compare/, msg => {
  send(msg.chat.id, `🏦 <b>Алийг харьцуулах вэ?</b>`, {
    reply_markup:{inline_keyboard:[
      [{text:'🇺🇸 USD',callback_data:'cmp_usd'},{text:'🇨🇳 CNY',callback_data:'cmp_cny'},{text:'🇪🇺 EUR',callback_data:'cmp_eur'}],
      [{text:'🇷🇺 RUB',callback_data:'cmp_rub'},{text:'🇯🇵 JPY',callback_data:'cmp_jpy'},{text:'🇬🇧 GBP',callback_data:'cmp_gbp'}]
    ]}
  });
});

// ─── 📊 Хүү харах ────────────────────────────────────────────────
bot.onText(/📊 Хүү харах|\/rates|\/хүү/, async msg => {
  send(msg.chat.id, `📊 <b>Алийн хүүг харах вэ?</b>`, {
    reply_markup:{inline_keyboard:[
      [{text:'🏠 Орон сууц (MNT)',callback_data:'rates_mortgage_mnt'},{text:'🏠 Орон сууц (USD)',callback_data:'rates_mortgage_usd'}],
      [{text:'💳 Хувь хүний зээл',callback_data:'rates_personal'},{text:'🚗 Машин',callback_data:'rates_car'}],
      [{text:'📊 Бүх хүү',callback_data:'rates_all'}]
    ]}
  });
});

// ─── 🚗 Машины импорт — PAIN POINT FIRST ────────────────────────
bot.onText(/🚗 Машины импорт|\/car|\/import/, msg => {
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

// ─── 🏠 Зээл ────────────────────────────────────────────────────
bot.onText(/🏠 Зээл тооцоолох|\/mortgage/, async msg => {
  const official = await U.getOfficial();
  let text = `🏠 <b>ЗЭЭЛИЙН ТООЦОООЛУУР</b>\n\n`;
  text += `Орон сууц авахын өмнө сарын төлбөрөө мэд!\n\n`;
  text += `<code>/mortgage 80000000 30 20</code>\n₮80M, 30% урьдчилгаа, 20 жил\n\n`;
  text += `<code>/mortgage 120000000 30 25 3000000</code>\n₮120M, 30%, 25 жил, ₮3M цалин`;
  send(msg.chat.id, text, {reply_markup:{inline_keyboard:[
    [{text:'🏠 ₮50M — орон сууц',callback_data:'mort_50000000_30_20'},{text:'🏠 ₮80M — орон сууц',callback_data:'mort_80000000_30_20'}],
    [{text:'🏢 ₮120M — том орон сууц',callback_data:'mort_120000000_30_25'},{text:'🏗️ ₮200M — байшин',callback_data:'mort_200000000_30_25'}]
  ]}});
});

bot.onText(/\/mortgage\s+(\d+)\s+(\d+)\s+(\d+)(?:\s+(\d+))?/, async (msg, match) => {
  try {
    const result = await U.calculateMortgage({
      propertyPrice: parseFloat(match[1]), downPct: parseFloat(match[2]),
      years: parseFloat(match[3]), salary: match[4] ? parseFloat(match[4]) : null, currency: 'mnt'
    });
    send(msg.chat.id, U.formatMortgage(result));
  } catch(e) { send(msg.chat.id, '❌ Тооцоолож чадахгүй байна'); }
});

// ─── 💳 Кредит — COMPARE RATES ────────────────────────────────────
bot.onText(/💳 Кредит|\/credit|\/loan/, msg => {
  send(msg.chat.id,
    `💳 <b>КРЕДИТ — ХЯМД ХҮҮГ ОЛ</b>\n\nХамгийн хямд хүүг харьцуулж, сарын төлбөрөө тооцоол!\n\n<code>/credit 5000000 12 2000000</code>\n₮5M, 12 сар, ₮2M цалин`,
    {reply_markup:{inline_keyboard:[
      [{text:'💰 ₮1M',callback_data:'cred_1000000_12_1500000'},{text:'💰 ₮3M',callback_data:'cred_3000000_12_2000000'}],
      [{text:'💰 ₮5M',callback_data:'cred_5000000_12_3000000'},{text:'💰 ₮10M',callback_data:'cred_10000000_24_5000000'}]
    ]}}
  );
});

bot.onText(/\/credit\s+(\d+)\s+(\d+)\s+(\d+)/, async (msg, match) => {
  try {
    const result = await U.calculatePersonalLoan({ amount: parseFloat(match[1]), months: parseFloat(match[2]), salary: parseFloat(match[3]) });
    send(msg.chat.id, U.formatPersonalLoan(result));
  } catch(e) { send(msg.chat.id, '❌ Тооцоолож чадахгүй байна'); }
});

// ─── 🔔 Мэдэгдэл ────────────────────────────────────────────────
bot.onText(/🔔 Ханш мэдэгдэл|\/alert/, async msg => {
  const { data: alerts } = supabase ? await supabase.from('alerts').select('*').eq('chat_id',msg.chat.id) : {data:[]};
  const official = await U.getOfficial();
  let text = `🔔 <b>Ханш мэдэгдэл — АВТОМАТААР МЭД</b>\n\nХанш өөрчлөгдвөл бид танд мэдэгдэнэ!\n\n<code>/alert USD 3600</code> — USD 3600 хүрвэл\n<code>/alert CNY 490</code> — CNY 490 унавал\n\n`;
  if (official?.usd) text += `📊 Одоо: USD ₮${U.fmt(official.usd)}`;
  if (official?.cny) text += ` | CNY ₮${U.fmt(official.cny)}`;
  text += `\n\n`;
  if (alerts?.length) { text += `📝 Таны мэдэгдлүүд:\n`; for (const a of alerts) text += `• ${U.FLAGS[a.currency]||''} ${a.currency.toUpperCase()} ₮${U.fmt(a.target)} ← /delalert ${a.id}\n`; }
  else text += 'Танд мэдэгдэл алга — дээрх жишээг бичээд нэм!';
  send(msg.chat.id, text);
});

bot.onText(/\/alert (\w+) (\d+\.?\d*)/, async (msg, match) => {
  const currency = match[1].toLowerCase(); const target = parseFloat(match[2]);
  if (!CURRENCIES.includes(currency)) { send(msg.chat.id,`❌ Боломжит: ${CURRENCIES.map(x=>x.toUpperCase()).join(', ')}`); return; }
  const official = await U.getOfficial();
  const direction = official?.[currency] < target ? 'above' : 'below';
  if (supabase) await supabase.from('alerts').insert({chat_id:msg.chat.id, currency, target, direction});
  send(msg.chat.id, `✅ ${U.FLAGS[currency]} ${currency.toUpperCase()} ₮${U.fmt(target)} ${direction==='above'?'дээш':'доош'} хүрвэл мэдэгдэнэ.\nОдоо: ₮${U.fmt(official?.[currency]||0)}`);
});

bot.onText(/\/delalert (.+)/, async (msg, match) => {
  if (supabase) await supabase.from('alerts').delete().eq('id', match[1]).eq('chat_id', msg.chat.id);
  send(msg.chat.id, '🗑️ Устгагдлаа');
});

// ─── 💸 Илгээх хямд — SAVINGS MESSAGE ────────────────────────────
bot.onText(/💸 Илгээх хямд|\/money/, async msg => {
  const official = await U.getOfficial();
  let text = `💸 <b>Гадаадад мөнгө илгээх — ХЭМНЭ</b>\n\n`;
  text += `Банкны шилжүүлэг: ₮50,000-100,000 шимтгэл\n`;
  text += `🌍 Wise: ₮5,000-15,000 л — <b>3-5 дахин хямд</b>\n`;
  text += `🚀 Remitly: 15 минутад хүргэнэ\n\n`;
  if (official?.usd) {
    text += `📊 Жишээ: $1000 илгээхэд\n`;
    text += `   Банк: ~₮80,000 шимтгэл\n`;
    text += `   Wise: ~₮15,000 шимтгэл\n`;
    text += `   💰 Хэмнэлт: <b>₮65,000</b>\n`;
  }
  send(msg.chat.id, text, {reply_markup:{inline_keyboard:[
    [{text:'🌍 Wise — хямд илгээх', url:'https://wise.com/gb/send-money/send-money-to-mongolia'}],
    [{text:'🚀 Remitly — хурдан илгээх', url:'https://www.remitly.com/us/en/mongolia'}]
  ]}});
});

// ─── ❤️ Дэмжлэг ────────────────────────────────────────────────
bot.onText(/❤️ Дэмжлэг|\/donate/, msg => {
  send(msg.chat.id, `❤️ <b>KhaanRate-г дэмжих</b>\n\nЭнэ бот үргэлж үнэгүй!\nДоорх одоо дарж дэмжээрэй:`, {reply_markup:{inline_keyboard:[
    [{text:'☕ 50⭐',callback_data:'donate_50'},{text:'🍕 150⭐',callback_data:'donate_150'}],
    [{text:'❤️ 500⭐',callback_data:'donate_500'},{text:'🦁 1000⭐',callback_data:'donate_1000'}]
  ]}});
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
  text += `🔔 Мэдэгдэл → ханш өөрчлөгдвөл мэд\n`;
  text += `📊 Хүү харах → бүх банкны хүү\n\n`;
  if (official?.usd) text += `📊 Одоо: 1$ = ₮${U.fmt(official.usd)}`;
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
    const sorted = banks.filter(b=>b.name!=='MongolBank'&&b.name!=='StateBank'&&b.rates[c]?.sell).sort((a,b2)=>a.rates[c].sell-b2.rates[c].sell);
    const sortedBuy = [...sorted].sort((a,b2)=>b2.rates[c].buy-a.rates[c].buy);
    if (!sorted.length) { send(chatId, 'Олдсонгүй'); return; }
    let text = `${U.FLAGS[c]} <b>${U.NAMES[c]} — Харьцуулалт</b>\n\n📊 <b>Авах үнэ (хямдаас):</b>\n`;
    sorted.forEach((b,i) => text += `${i===0?'🏆 ':''}${b.mn}: ₮${U.fmt(b.rates[c].sell)}\n`);
    text += `\n📊 <b>Зарах үнэ (өндөрөөс):</b>\n`;
    sortedBuy.forEach((b,i) => text += `${i===0?'🏆 ':''}${b.mn}: ₮${U.fmt(b.rates[c].buy)}\n`);
    if (sorted.length>=2) { const diff = sorted[sorted.length-1].rates[c].sell - sorted[0].rates[c].sell; if (diff>0) text += `\n💸 ${sorted[0].mn}-р ${sorted[sorted.length-1].mn}-аас ₮${U.fmt(diff)}/${c.toUpperCase()} хэмнэнэ`; }
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
      send(chatId, U.formatMortgage(result));
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
    const triggered = a.direction === 'above' ? rate >= a.target : rate <= a.target;
    if (triggered) {
      send(a.chat_id, `🔔 ${U.FLAGS[a.currency]} ${a.currency.toUpperCase()} одоо <b>₮${U.fmt(rate)}</b> — таны мэдэгдэл идэвхжлээ!`);
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

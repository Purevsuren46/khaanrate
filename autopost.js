// Auto-growth: periodic posts, cross-posting, SEO content

const { fetchAll, buildOfficial, CURRENCIES } = require('./bank-rates');

const FLAGS = {usd:'🇺🇸',cny:'🇨🇳',eur:'🇪🇺',rub:'🇷🇺',jpy:'🇯🇵',krw:'🇰🇷',gbp:'🇬🇧'};
const NAMES = {usd:'Америк доллар',cny:'Хятад юань',eur:'Евро',rub:'Орос рубль',jpy:'Япон иен',krw:'Солонгос вон',gbp:'Англи фунт'};
const CHANNEL_ID = '-1003918347360';
const BOT_LINK = 'https://t.me/KhaanRateBot';
const CHANNEL_LINK = 'https://t.me/khaanrate';

// ─── Content generators ──────────────────────────────────────────

// Daily rates post for channel
async function dailyRatesPost() {
  const banks = await fetchAll();
  const official = buildOfficial(banks);
  if (!official) return null;

  let msg = `📊 <b>ӨДРИЙН ХАНШ</b>\n📅 ${new Date().toISOString().split('T')[0]}\n\n`;
  for (const c of ['usd','cny','eur','rub']) {
    const r = official[c];
    if (!r) continue;
    msg += `${FLAGS[c]} ${c.toUpperCase()}: ₮${Number(r).toLocaleString()}\n`;
  }

  // Find cheapest USD
  let cheapest = null, cheapestVal = Infinity;
  for (const b of banks) {
    if (b.name==='MongolBank'||b.name==='StateBank') continue;
    const s = b.rates.usd?.sell;
    if (s && s < cheapestVal) { cheapestVal = s; cheapest = b; }
  }
  if (cheapest) msg += `\n🏆 Хамгийн хямд USD: ${cheapest.mn} ₮${cheapestVal.toLocaleString()}`;

  msg += `\n\n📱 ${BOT_LINK} — Ханшаа шалгах`;
  return msg;
}

// Weekly summary post
async function weeklyPost() {
  const banks = await fetchAll();
  const official = buildOfficial(banks);
  if (!official) return null;

  let msg = `📈 <b>7 ХОНОГИЙН ХАНШНЫ ДҮНГЭЛТ</b>\n\n`;
  msg += `🇺🇸 USD: ₮${Number(official.usd).toLocaleString()}\n`;
  msg += `🇨🇳 CNY: ₮${Number(official.cny).toLocaleString()}\n`;
  msg += `🇪🇺 EUR: ₮${Number(official.eur).toLocaleString()}\n\n`;
  msg += `Дэлгэрэнгүй харьцуулалт → ${BOT_LINK}`;
  return msg;
}

// Viral content — rate facts Mongolians care about
async function viralPost() {
  const banks = await fetchAll();
  const official = buildOfficial(banks);
  if (!official) return null;

  const templates = [
    () => `💡 Та өдөрт хэдийн хэмжээний мөнгөө алдаж байна?\n\nUSD ханш: ₮${Number(official.usd).toLocaleString()}\nХамгийн хямд авах үнэ → ${BOT_LINK}\n\n🏆 Банкаа зөв сонгож мөнгөө хэмнэ!`,
    () => `🔥 USD ₮${Number(official.usd).toLocaleString()} байна!\n\nАжиллах хүчний ханш, цалин, төлбөр бүрт хамаатай.\nШууд шалгах → ${BOT_LINK}`,
    () => `💸 Гадаадад мөнгө илгээхийн өмнө ханшаа шалга!\n\n🇺🇸 ₮${Number(official.usd).toLocaleString()} | 🇨🇳 ₮${Number(official.cny).toLocaleString()} | 🇪🇺 ₮${Number(official.eur).toLocaleString()}\n\n${BOT_LINK}`,
    () => `📊 Төгрөгийн ханш өөрчлөгдсөн үү?\n\nОдоогийн ханш:\n🇺🇸 USD: ₮${Number(official.usd).toLocaleString()}\n🇨🇳 CNY: ₮${Number(official.cny).toLocaleString()}\n🇪🇺 EUR: ₮${Number(official.eur).toLocaleString()}\n\nДэлгэрэнгүй → ${BOT_LINK}`,
  ];

  return templates[Math.floor(Math.random() * templates.length)]();
}

// Auto-post schedule
const SCHEDULE = {
  daily: { hour: 1, minute: 0 },    // 9am UTC+8
  weekly: { day: 1, hour: 1 },       // Monday 9am UTC+8
  viral: { hours: [5, 11, 17] },     // 1pm, 7pm, 1am UTC+8
};

let lastDailyPost = 0;
let lastWeeklyPost = 0;
let lastViralPost = 0;
let viralIndex = 0;

async function autoPost(bot) {
  const now = Date.now();
  const d = new Date();
  const hourUTC = d.getUTCHours();
  const dayUTC = d.getUTCDay();

  // Daily post (once per day at 9am UTC+8 = 1am UTC)
  if (hourUTC === 1 && now - lastDailyPost > 82800000) {
    const msg = await dailyRatesPost();
    if (msg) {
      try { await bot.sendMessage(CHANNEL_ID, msg, {parse_mode:'HTML'}); lastDailyPost = now; console.log('📢 Daily post sent'); } catch {}
    }
  }

  // Weekly post (Monday 9am UTC+8)
  if (dayUTC === 1 && hourUTC === 1 && now - lastWeeklyPost > 604800000) {
    const msg = await weeklyPost();
    if (msg) {
      try { await bot.sendMessage(CHANNEL_ID, msg, {parse_mode:'HTML'}); lastWeeklyPost = now; console.log('📢 Weekly post sent'); } catch {}
    }
  }

  // Viral posts (3x per day)
  if (SCHEDULE.viral.hours.includes(hourUTC) && now - lastViralPost > 25200000) {
    const msg = await viralPost();
    if (msg) {
      try { await bot.sendMessage(CHANNEL_ID, msg, {parse_mode:'HTML'}); lastViralPost = now; console.log('📢 Viral post sent'); } catch {}
    }
  }
}

module.exports = { autoPost, dailyRatesPost, weeklyPost, viralPost, CHANNEL_ID };

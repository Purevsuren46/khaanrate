const { fetchAll, buildOfficial } = require('./bank-rates');

const BOT_LINK = 'https://t.me/KhaanRateBot';
const CHANNEL = 'https://t.me/khaanrate';

function num(n) { return Number(n).toLocaleString('en-US',{maximumFractionDigits:2}); }

async function getRates() {
  const banks = await fetchAll();
  const off = buildOfficial(banks);
  return { banks, off };
}

// ─── Facebook posts (longer, engaging) ───────────────────────────
async function facebookPosts() {
  const { banks, off } = await getRates();
  const cheapest = banks.filter(b=>b.name!=='MongolBank'&&b.rates.usd?.sell).sort((a,b)=>a.rates.usd.sell-b.rates.usd.sell)[0];

  return [
    `🔥 ТА ӨДӨРТ ХЭДИЙН МӨНГӨӨ АЛДЖ БАЙНА ВЭ?

USD ханш: ₮${num(off.usd)}
CNY ханш: ₮${num(off.cny)}

Банк бүр өөр үнэ тавьдаг! Зөв банк сонгож мөнгөө хэмнэ.

1000$ авахад:
${cheapest ? `✅ ${cheapest.mn}: ₮${num(cheapest.rates.usd.sell * 1000)}` : ''}

📱 Ханшаа шалгах хамгийн хялбар арга → ${BOT_LINK}

#Монгол #Ханш #USD #Төгрөг #KhaanRate #Банк`,

    `📊 МОНГОЛБАНКНЫ ХАНШ ШАЛГАХ 3 СЕКУНД!

Ханш шалгахаар цаг алдаж байна уу? 👇

🇺🇸 USD: ₮${num(off.usd)}
🇨🇳 CNY: ₮${num(off.cny)}
🇪🇺 EUR: ₮${num(off.eur)}

Telegram бот руу орж шууд хар! Илүү хүндэтгэлгүй, бүртгэлгүй.

👉 ${BOT_LINK}

#МонголынХанш #Валют #МНТ #ТөгрөгийнХанш`,

    `💰 ГАДААДАД МӨНГӨ ИЛГЭЭХИЙН ӨМНӨ!

Ханш мэдэхгүйгээр мөнгө илгээвэл алдагдаж болно.

Одоогийн ханш:
🇺🇸 1$ = ₮${num(off.usd)}
🇨🇳 1¥ = ₮${num(off.cny)}
🇪🇺 1€ = ₮${num(off.eur)}

Ханш хүрэхэд автоматаар мэдэгдэнэ! 🔔

📱 ${BOT_LINK}

#ГадаадМөнгөШилжүүлэг #Ханш #Монгол`,

    `🏦 БАНК БҮР ӨӨР ҮНЭТЭЙ! ХАМАГИЙН ХЯМДЫГ ОЛОХЫГ ХҮСЭЖ БАЙНА УУ?

${banks.filter(b=>b.name!=='MongolBank'&&b.rates.usd?.sell).sort((a,b)=>a.rates.usd.sell-b.rates.usd.sell).map((b,i) => `${i===0?'🏆':'⚪'} ${b.mn}: Авах ₮${num(b.rates.usd.sell)} | Зарах ₮${num(b.rates.usd.buy)}`).join('\n')}

Харьцуулалт → ${BOT_LINK}

#Банк #Харьцуулалт #Ханш #Монгол`,
  ];
}

// ─── Instagram/TikTok captions (short, hashtag-heavy) ────────────
async function instagramCaptions() {
  const { off } = await getRates();
  return [
    `🔥 USD ₮${num(off.usd)}! Ханшаа шалгах → линк бич хуул 📱\n\n#монгол #ханш #usd #mnt #төгрөг #банк #валют #khaanrate #улаанбаатар`,
    `📊 3 секундын ханш шалгагч 🦁\n🇺🇸 ₮${num(off.usd)} | 🇨🇳 ₮${num(off.cny)} | 🇪🇺 ₮${num(off.eur)}\n\n📱 @KhaanRateBot\n\n#монгол #ханш #бот #telegram #usd #mnt #кхаанрейт`,
    `💸 Банк бүр өөр үнэ! Хамгийн хямдыг олоорой 🏆\n\n#монгол #банк #ханш #хэмнэлт #usd #mnt #khaanrate`,
  ];
}

// ─── Twitter/X posts (280 char) ──────────────────────────────────
async function twitterPosts() {
  const { off } = await getRates();
  return [
    `🦁 KhaanRate — Монголын ханш шалгах бот\n🇺🇸 USD ₮${num(off.usd)} | 🇨🇳 CNY ₮${num(off.cny)} | 🇪🇺 EUR ₮${num(off.eur)}\n\n📱 ${BOT_LINK}\n#Монгол #Ханш #MNT #KhaanRate`,
    `📊 USD ₮${num(off.usd)} байна! Хамгийн хямд банкаа олоорой → ${BOT_LINK}\n#Монгол #Банк #Ханш`,
    `💸 1000$ авахад хэд хэмнэж болох вэ? Банк харьцуулалт → ${BOT_LINK}\n#МНТ #USD #KhaanRate #Монгол`,
  ];
}

// ─── Telegram group forwarding message ──────────────────────────
async function telegramGroupMsg() {
  const { off } = await getRates();
  return `🦁 Ханш шалгах хамгийн хялбар арга!\n\n📊 Өдөр бүр Монголбанк + 3 банкны ханш\n🏦 Банк харьцуулалт — хамгийн хямдыг олоорой\n🔔 Ханш хүрэхэд мэдэгдэл\n📱 Бүгд ҮНЭГҮЙ!\n\n🇺🇸 USD: ₮${num(off.usd)} | 🇨🇳 CNY: ₮${num(off.cny)} | 🇪🇺 EUR: ₮${num(off.eur)}\n\n👉 ${BOT_LINK}\n📢 ${CHANNEL}`;
}

// ─── All content for /content command ────────────────────────────
async function allContent() {
  const [fb, ig, tw, tg] = await Promise.all([
    facebookPosts(),
    instagramCaptions(),
    twitterPosts(),
    telegramGroupMsg(),
  ]);
  return { facebook: fb, instagram: ig, twitter: tw, telegram: tg };
}

module.exports = { facebookPosts, instagramCaptions, twitterPosts, telegramGroupMsg, allContent };

// Viral engagement hooks — makes people WANT to use and share

const { fetchAll, buildOfficial } = require('./bank-rates');
const { createInvoice } = require('./payments');
const BOT_LINK = 'https://t.me/KhaanRateBot';
const CHANNEL = 'https://t.me/khaanrate';

function num(n) { return Number(n).toLocaleString('en-US',{maximumFractionDigits:2}); }

// ─── 1. LOSS CALCULATOR — "Хэдийн мөнгө алдаж байна?" ────────────
// This is THE hook. Everyone cares about losing money.
async function lossMessage(officialRates, banks) {
  if (!officialRates?.usd) return null;
  const usd = officialRates.usd;
  
  const sellBanks = banks.filter(b=>b.name!=='MongolBank'&&b.rates.usd?.sell).sort((a,b)=>b.rates.usd.sell-a.rates.usd.sell);
  if (sellBanks.length < 2) return null;
  
  const worst = sellBanks[0];
  const best = [...sellBanks].sort((a,b)=>a.rates.usd.sell-b.rates.usd.sell)[0];
  const diff = worst.rates.usd.sell - best.rates.usd.sell;
  
  if (diff <= 0) return null;
  
  return `💸 <b>ТА ${diff}₮-ээр НЭГ ДОЛАРААР алдаж байна!</b>

${worst.mn}: Авах ₮${num(worst.rates.usd.sell)}
${best.mn}: Авах ₮${num(best.rates.usd.sell)}
━━━━━━━━━━━━━
Нэг доллар дээр <b>₮${num(diff)}</b> зөрүүтэй!

📌 1000$ авбал → <b>₮${num(diff*1000)}</b> алдана
📌 5000$ авбал → <b>₮${num(diff*5000)}</b> алдана
📌 10000$ авбал → <b>₮${num(diff*10000)}</b> алдана

🏆 <b>${best.mn}-р аввал энэ мөнгөө хэмнэнэ!</b>

📱 Ханшаа шалга → ${BOT_LINK}
📢 Найздаа илгээ! → ${CHANNEL}`;
}

// ─── 2. RATE PREDICTION GAME — gamification ──────────────────────
// People predict tomorrow's rate, closest wins
const predictions = {}; // in-memory, later Supabase

function predictionKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [
        [{text:'📉 Буурна',callback_data:'pred_down'},{text:'➡️ Ижил',callback_data:'pred_same'},{text:'📈 Өснө',callback_data:'pred_up'}],
      ]
    }
  };
}

// ─── 3. SALARY CALCULATOR — how much is your salary really worth? ─
async function salaryMessage(usd, cny) {
  return `💼 <b>ЦАЛИНГАА USD-РАР ТОЦООЛОХ</b>

₮1,000,000 цалин = <b>$${num(1000000/usd)}</b>
₮2,000,000 цалин = <b>$${num(2000000/usd)}</b>
₮3,000,000 цалин = <b>$${num(3000000/usd)}</b>
₮5,000,000 цалин = <b>$${num(5000000/usd)}</b>

🇨🇳 Юаньгаар:
₮1,000,000 = <b>¥${num(1000000/cny)}</b>

📱 Өөрийн цалингаа бодох → ${BOT_LINK}`;
}

// ─── 4. VIRAL SHARE — compelling, not boring ──────────────────────
async function viralShareMessage(officialRates) {
  if (!officialRates?.usd) return null;
  const usd = officialRates.usd;
  
  return `🔥 ХАНШЫН МЭДЭЭ!

1$ = ₮${num(usd)} байна!

✅ Хамгийн хямд банкаа олох
✅ Ханш хүрэхэд автоматаар мэдэгдэл авах  
✅ Банк харьцуулалт хийх

Бүгд ҮНЭГҮЙ! 👇
${BOT_LINK}

📢 @khaanrate — өдөр тутмын ханш`;
}

// ─── 5. DAILY HOOK — main menu opening message ───────────────────
async function dailyHook(officialRates, banks) {
  if (!officialRates?.usd) return null;
  
  // Check if rates changed significantly
  const loss = await lossMessage(officialRates, banks);
  
  let msg = `🦁 <b>KhaanRate</b> — Ханш шалгах хамгийн хялбар арга\n\n`;
  msg += `📊 <b>Өнөөдөр:</b>\n`;
  msg += `🇺🇸 USD: ₮${num(officialRates.usd)}\n`;
  if (officialRates.cny) msg += `🇨🇳 CNY: ₮${num(officialRates.cny)}\n`;
  if (officialRates.eur) msg += `🇪🇺 EUR: ₮${num(officialRates.eur)}\n`;
  
  if (loss) {
    msg += `\n⚠️ <b>Зөв банкгүйгээр ${banks.filter(b=>b.name!=='MongolBank'&&b.rates.usd?.sell).sort((a,b)=>b.rates.usd.sell-a.rates.usd.sell)[0]?.mn || 'банк'}-аас аввал илүү төлнө!</b>`;
  }
  
  msg += `\n\n👇 Юу хийх вэ?`;
  return msg;
}

module.exports = { lossMessage, predictionKeyboard, viralShareMessage, dailyHook, salaryMessage };

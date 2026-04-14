const axios = require('axios');

const BOT_TOKEN = process.env.BOT_TOKEN;
const BOT_LINK = 'https://t.me/KhaanRateBot';

// ─── Telegram Stars payments (built-in, no bank account needed) ──
// Stars can be converted to XTR → withdrawn as crypto/Ton

const DONATION_AMOUNTS = [
  { stars: 50, label: '☕ Кофе', xtr: 50 },
  { stars: 150, label: '🍕 Пицца', xtr: 150 },
  { stars: 500, label: '❤️ Дэмжлэг', xtr: 500 },
  { stars: 1000, label: '🦁 Хүчирхэг дэмжлэг', xtr: 1000 },
];

function donateKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: DONATION_AMOUNTS.map(d => [{
        text: `${d.label} — ${d.stars} ⭐`,
        pay: true,
      }]),
    }
  };
}

// ─── Wise Affiliate (real, verified) ─────────────────────────────
// Sign up: https://wise.com/us/partner/profile
// $20 per referred customer who transfers >$200
const WISE_LINK = 'https://wise.prf.hn/click/camref:1101l4tFE';

// ─── Remitly Affiliate ───────────────────────────────────────────
// $12-15 per referral
const REMITLY_LINK = 'https://remitly.com';

// ─── Generate invoice for Telegram Stars ─────────────────────────
async function createInvoice(chatId, stars) {
  const payload = `donate_${chatId}_${stars}`;
  const prices = [{ label: 'Дэмжлэг', amount: stars }];
  
  try {
    const { data } = await axios.post(
      `https://api.telegram.org/bot${BOT_TOKEN}/createInvoiceLink`,
      {
        title: '🦁 KhaanRate дэмжлэг',
        description: `KhaanRate-г дэмжих ${stars} ⭐`,
        payload: payload,
        currency: 'XTR',
        prices: prices,
        provider_token: '', // Stars payments don't need provider_token
      }
    );
    return data.result;
  } catch (err) {
    console.error('Invoice error:', err.message);
    return null;
  }
}

module.exports = { DONATION_AMOUNTS, donateKeyboard, createInvoice, WISE_LINK, REMITLY_LINK };

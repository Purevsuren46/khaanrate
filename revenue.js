const axios = require('axios');

// ─── Viral growth: /share + invite tracking ──────────────────────
const BOT_USERNAME = '@KhaanRateBot';
const CHANNEL = 'https://t.me/khaanrate';

function shareText(userId) {
  return `💰 USD ₮3,573 | CNY ₮523 | EUR ₮4,179\n\nХаншаа шалгах хамгийн хялбар арга!\n${CHANNEL} — өдөр тутмын ханш\n📱 Бот: https://t.me/KhaanRateBot?start=ref${userId}`;
}

// ─── Money transfer affiliate (real revenue) ─────────────────────
// Wise affiliate: $20 per new customer who transfers >$200
// Remitly: $10-15 per referral
const TRANSFER_ADS = [
  {
    id: 'wise',
    text: '💸 Гадаадад мөнгө илгээх хамгийн хямд!\nWise — 0.5% шимтгэл, 1 цагт хүрдэг\n',
    url: 'https://wise.prf.hn/click/camref:1101l4tFE', // Wise affiliate
    cta: '🌍 Wise-р илгээх',
    revenue: 20, // USD per referral
  },
  {
    id: 'remitly',
    text: '🚀 Монгол руу мөнгө шилжүүлэх?\nRemitly — анхны шилжүүлэгт 0% шимтгэл!\n',
    url: 'https://remitly.com', // Remitly affiliate placeholder
    cta: '💸 Remitly-р илгээх',
    revenue: 12,
  },
];

// Show transfer ad to users who check USD rate
function getTransferAd() {
  return TRANSFER_ADS[Math.floor(Math.random() * TRANSFER_ADS.length)];
}

// ─── Sponsored post pricing ──────────────────────────────────────
// Prices for advertising in @khaanrate channel
const AD_PRICING = {
  daily_post: 50000,    // ₮50к — 1 day pinned post
  weekly: 250000,       // ₮250к — 7 days
  monthly: 800000,      // ₮800к — 30 days
  bot_banner: 100000,   // ₮100к — banner in bot replies for 1 week
};

function adPricingText() {
  return `📢 <b>Зар сурталчилгаа</b> — @khaanrate сувагт

• 1 өдөр pinned: ₮${AD_PRICING.daily_post.toLocaleString()}
• 7 хоног: ₮${AD_PRICING.weekly.toLocaleString()}
• 1 сар: ₮${AD_PRICING.monthly.toLocaleString()}
• Бот дотор banner: ₮${AD_PRICING.bot_banner.toLocaleString()}/7хоног

Бизнес эрхлэгчид, вальют солилцооны газрууд, банкнуудад зориулсан.

Холбогдох: @khaanrate_support`;
}

module.exports = { shareText, getTransferAd, TRANSFER_ADS, AD_PRICING, adPricingText, BOT_USERNAME, CHANNEL };

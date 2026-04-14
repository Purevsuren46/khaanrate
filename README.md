# KhaanRate — Төгрөгийн ханшны Telegram бот

Монголбанк + 3 банкны валютын ханш харьцуулдаг бот.

## Түргэн суулгалт (шинэ сервер дээр)

```bash
# 1. Код татах
git clone https://github.com/Purevsuren46/khaanrate.git
cd khaanrate

# 2. Node.js суулгах (хэрэв байхгүй бол)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

# 3. Залгуулгууд суулгах
npm install

# 4. PM2 суулгах
sudo npm install -g pm2

# 5. Environment тохиргоо
cp .env.example .env
# .env файлд BOT_TOKEN, SUPABASE_URL, SUPABASE_KEY бөглөх

# 6. Ажиллуулах
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

## Тохиргоо

`.env` файлд:
```
BOT_TOKEN=your_telegram_bot_token
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_key
```

## Командууд

| Команд | Тайлбар |
|---------|---------|
| 📊 Ханш | Монголбанк + 3 банкны ханш |
| 🏦 /banks | Банк харьцуулалт |
| /best USD | Хамгийн хямд банк |
| /alert USD 3580 | Анхааруулга |
| /alerts | Анхааруулгууд |
| /report | Бизнес тайлан |
| /share | Найздаа илгээх |
| /ads | Зар сурталчилгаа |
| /business | Бизнес API |

## Банкууд

| Банк | Эх сурвалж |
|------|-----------|
| Голомт Банк | HTTP API |
| Хас Банк | HTTP API |
| Төрийн Банк | HTTP API |
| Монголбанк | StateBank API (mnBankSale) |

## Архитектур

```
bot.js          — Telegram бот үндсэн логик
bank-rates.js   — Банкны ханш татах (HTTP API, Puppeteer гүйцэд хасагдсан)
monetize.js     — Мөнгөжилт: referral, ads, channel post
revenue.js      — Orлого: transfer affiliate, viral share, ad pricing
ecosystem.config.js — PM2 тохиргоо
```

## Сервер унасан тохиолдолд

1. Шинэ DigitalOcean droplet үүсгэ (Ubuntu, 2GB RAM)
2. Дээрх "Түргэн суулгалт" алхмуудыг хий
3. PM2 автоматаар бот асаана

## Лиценз

MIT

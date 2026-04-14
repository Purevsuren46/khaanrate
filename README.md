# 🦁 KhaanRate — МНТ ханшны анхааруулга

> Монголын хамгийн хурдан төгрөгийн ханш мэдээлэгч Telegram бот

**KhaanRate** нь Монголбанкны албан ёсны ханшны мэдээллийг түргэн зурваслаж, ханш тодорхой хэмжээнд хүрэхэд анхааруулга илгээдэг Telegram бот юм.

## 💰 Мөнгө олох загвар

| Эрх | Үнэ | Боломж |
|------|------|---------|
| Үнэгүй | ₮0 | 3 анхааруулга, ханш харах |
| Премиум | ₮9,900/сар | Хязгааргүй анхааруулга, өдрийн тайлан, банк харьцуулалт |

Telegram Bot Payments API нь МНТ-г шууд дэмждэг тул төлбөр бот дотроо гүйцэтгэнэ.

## 🚀 Суулгах

```bash
git clone https://github.com/Purevsuren46/khaanrate.git
cd khaanrate
npm install
cp .env.example .env
# Edit .env with your tokens
npm start
```

## ⚙️ Environment Variables

```env
BOT_TOKEN=your_telegram_bot_token
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_key
```

### Setup Steps

1. **Telegram Bot**: Message [@BotFather](https://t.me/BotFather) → `/newbot` → Get token
2. **Supabase** (free tier): Create project → Run SQL below → Get URL + key
3. **Payments**: BotFather → `/payments` → Connect provider

### Database Schema

```sql
create table users (
  chat_id bigint primary key,
  username text,
  first_name text,
  language text default 'mn',
  is_premium boolean default false,
  premium_since timestamptz,
  alert_count int default 0,
  created_at timestamptz default now()
);

create table alerts (
  id uuid default gen_random_uuid() primary key,
  chat_id bigint references users(chat_id),
  currency text not null,
  target_rate decimal not null,
  direction text not null check (direction in ('above', 'below')),
  active boolean default true,
  triggered_at timestamptz,
  created_at timestamptz default now()
);

create index idx_alerts_active on alerts(chat_id, active);
```

## 📱 Командууд

| Команд | Тайлбар |
|--------|---------|
| `/rate` | Одоогийн ханш харах |
| `/alert USD 3400` | USD 3400-д хүрэхэд анхааруулах |
| `/alerts` | Анхааруулгууд харах |
| `/premium` | Премиум эрх авах |
| `/help` | Тусламж |

## 🇲🇳 Яагаад Монголд?

- МНТ ханш өдөрт хэдэн арван төгрөгөөр хэлбэлздэг
- Иргэд банк хооронд ханш харьцуулдаг
- Telegram Монголд хамгийн түгээмэл мэссэнжер
- Telegram Payments API МНТ-г шууд дэмждэг
- 3.4 сая хүн ам — 1% нь төлбөртэй бол ~₮34M/сар

## 📈 Roadmap

- [x] Монголбанкны ханш татах
- [x] Анхааруулга үүсгэх
- [x] Премиум төлбөр
- [ ] Банк хооронд харьцуулалт (Хаан, Голомт, ТДБ)
- [ ] Өдрийн тайлан (премиум)
- [ ] Ханшны график
- [ ] OTC ханшны мэдээлэл
- [ ] WhatsApp бот (эхний 100 хэрэглэгч)

## License

MIT

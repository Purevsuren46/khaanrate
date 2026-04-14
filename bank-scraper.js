const axios = require('axios');
const puppeteer = require('puppeteer');

const CURRENCIES = ['USD', 'CNY', 'EUR', 'RUB', 'JPY', 'KRW', 'GBP'];
const TODAY = new Date().toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD

// ─── Bank scrapers ──────────────────────────────────────────────────

async function fetchGolomt() {
  const rates = {};
  for (const cur of CURRENCIES) {
    try {
      const [buyRes, sellRes] = await Promise.all([
        axios.get(`https://www.golomtbank.com/api/exchangerateinfo?date=${TODAY}&from=${cur}&to=MNT&type=cash_buy`, { timeout: 5000 }),
        axios.get(`https://www.golomtbank.com/api/exchangerateinfo?date=${TODAY}&from=${cur}&to=MNT&type=cash_sell`, { timeout: 5000 }),
      ]);
      const buy = parseFloat(buyRes.data?.rate?.cvalue?.[0] || 0);
      const sell = parseFloat(sellRes.data?.rate?.cvalue?.[0] || 0);
      if (buy > 0 || sell > 0) rates[cur.toLowerCase()] = { cash: { buy, sell } };
    } catch {}
  }
  return Object.keys(rates).length > 0 ? { bank_name: 'GolomtBank', rates, date: new Date().toISOString().split('T')[0] } : null;
}

async function fetchWithPuppeteer(bankName, url, rateSelector) {
  try {
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    
    let rateData = null;
    page.on('response', async (resp) => {
      const ct = resp.headers()['content-type'] || '';
      const url = resp.url();
      if (ct.includes('json') && (url.includes('rate') || url.includes('exchange') || url.includes('currency'))) {
        try {
          const body = await resp.json();
          if (body && (body.rates || body.data || body.items || body.exchangeRates)) {
            rateData = body;
          }
        } catch {}
      }
    });
    
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await new Promise(r => setTimeout(r, 3000));
    
    // If no API found, try scraping the page
    if (!rateData) {
      const pageRates = await page.evaluate(() => {
        const rows = document.querySelectorAll('table tbody tr, .rate-table tr, .exchange-table tr, [class*=rate] tr');
        const result = {};
        rows.forEach(row => {
          const cells = row.querySelectorAll('td');
          if (cells.length >= 3) {
            const code = cells[0]?.textContent?.trim().toUpperCase();
            if (['USD', 'CNY', 'EUR', 'RUB', 'JPY', 'KRW', 'GBP'].includes(code)) {
              const buy = parseFloat(cells[cells.length - 2]?.textContent?.replace(/[^0-9.]/g, '') || 0);
              const sell = parseFloat(cells[cells.length - 1]?.textContent?.replace(/[^0-9.]/g, '') || 0);
              if (buy > 0 || sell > 0) result[code.toLowerCase()] = { cash: { buy, sell } };
            }
          }
        });
        return result;
      });
      if (Object.keys(pageRates).length > 0) {
        rateData = pageRates;
      }
    }
    
    await browser.close();
    
    if (rateData) {
      const rates = rateData.rates || rateData.data || rateData.items || rateData.exchangeRates || rateData;
      return { bank_name: bankName, rates, date: new Date().toISOString().split('T')[0] };
    }
    return null;
  } catch (err) {
    console.error(`${bankName} error:`, err.message.substring(0, 80));
    return null;
  }
}

async function fetchAllBanks() {
  console.log('🏦 Fetching live bank rates...');
  
  // Fetch Golomt via API (fast, reliable)
  const results = [];
  const golomt = await fetchGolomt();
  if (golomt) { results.push(golomt); console.log('  ✅ GolomtBank'); }
  
  // Fetch other banks via Puppeteer (one browser, multiple pages)
  const otherBanks = [
    ['KhanBank', 'https://www.khanbank.com/mn/rates'],
    ['TDBM', 'https://www.tdbm.mn/en/exchange-rates'],
    ['XacBank', 'https://www.xacbank.mn/mn/rates'],
    ['StateBank', 'https://www.statebank.mn/mn/rates'],
    ['CapitronBank', 'https://www.capitronbank.mn/mn/rates'],
    ['CKBank', 'https://www.ckbank.mn/mn/rates'],
    ['BogdBank', 'https://www.bogdbank.mn/mn/rates'],
    ['ArigBank', 'https://www.arigbank.mn/mn/rates'],
    ['TransBank', 'https://www.transbank.mn/mn/rates'],
    ['MBank', 'https://www.mbank.mn/mn/rates'],
    ['NIBank', 'https://www.nibank.mn/mn/rates'],
  ];
  
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  
  for (const [name, url] of otherBanks) {
    try {
      const page = await browser.newPage();
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 10000 });
      await new Promise(r => setTimeout(r, 2000));
      
      const pageRates = await page.evaluate(() => {
        const rows = document.querySelectorAll('table tbody tr, .rate-table tr, .exchange-table tr, [class*=rate] tr, [class*=exchange] tr');
        const result = {};
        rows.forEach(row => {
          const cells = row.querySelectorAll('td, th');
          const text = Array.from(cells).map(c => c.textContent?.trim());
          const codeIdx = text.findIndex(t => /^(USD|CNY|EUR|RUB|JPY|KRW|GBP)$/i.test(t));
          if (codeIdx >= 0) {
            const code = text[codeIdx].toUpperCase();
            const nums = text.map(t => parseFloat(t.replace(/[^0-9.]/g, ''))).filter(n => n > 0);
            if (nums.length >= 2) {
              result[code.toLowerCase()] = { cash: { buy: nums[nums.length - 1], sell: nums[nums.length - 2] } };
            } else if (nums.length === 1) {
              result[code.toLowerCase()] = { cash: { buy: nums[0], sell: nums[0] } };
            }
          }
        });
        return result;
      });
      
      await page.close();
      if (Object.keys(pageRates).length > 0) {
        results.push({ bank_name: name, rates: pageRates, date: new Date().toISOString().split('T')[0] });
        console.log(`  ✅ ${name} (${Object.keys(pageRates).length} currencies)`);
      } else {
        console.log(`  ❌ ${name} (no rates found)`);
      }
    } catch (e) {
      console.log(`  ❌ ${name} (${e.message.substring(0, 50)})`);
    }
  }
  
  await browser.close();
  console.log(`\n🏁 Total: ${results.length} banks fetched`);
  return results;
}

// If run directly
if (require.main === module) {
  fetchAllBanks().then(rates => {
    console.log(JSON.stringify(rates, null, 2));
  });
}

module.exports = { fetchAllBanks, fetchGolomt };

const puppeteer = require('puppeteer');
const fs = require('fs');

(async () => {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  
  // Intercept the data API response
  let rateData = null;
  page.on('response', async (response) => {
    const url = response.url();
    if (url.includes('currency-rates/data') || url.includes('currency-rates%2Fdata')) {
      try {
        rateData = await response.json();
      } catch(e) {}
    }
  });
  
  await page.goto('https://www.mongolbank.mn/mn/currency-rates', { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise(r => setTimeout(r, 5000));
  
  if (rateData && rateData.success) {
    const latest = rateData.data[rateData.data.length - 1];
    console.log(JSON.stringify({ success: true, date: latest.RATE_DATE, data: latest }));
  } else {
    console.log(JSON.stringify({ success: false, error: 'No data from API' }));
  }
  
  await browser.close();
})();

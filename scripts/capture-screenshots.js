import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

(async () => {
  console.log('Launching browser...');
  const browser = await puppeteer.launch({
    headless: "new"
  });
  const page = await browser.newPage();
  
  await page.setViewport({ width: 1400, height: 900 });

  console.log('Navigating to dashboard...');
  try {
    // Retry logic or wait
    await page.goto('http://localhost:5173', { waitUntil: 'networkidle0', timeout: 30000 });
    
    // Create directory
    const dir = 'docs/images';
    if (!fs.existsSync(dir)){
        fs.mkdirSync(dir, { recursive: true });
    }

    console.log('Taking screenshot...');
    // Add a small delay to ensure charts render (chart.js has animation)
    await new Promise(r => setTimeout(r, 2000));
    
    await page.screenshot({ path: 'docs/images/dashboard-overview.png' });
    console.log('Screenshot saved to docs/images/dashboard-overview.png');

  } catch (e) {
    console.error('Error:', e);
  } finally {
    await browser.close();
  }
})();

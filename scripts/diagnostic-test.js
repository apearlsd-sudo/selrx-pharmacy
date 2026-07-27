#!/usr/bin/env node
/**
 * Self-contained server + Playwright diagnostic test.
 * Starts the server, runs browser tests, reports results, then exits.
 */
const path = require('path');
process.chdir(path.join(__dirname, '..'));

const { createServer } = require('http');
const { parse } = require('url');

async function main() {
  console.log('=== Starting SelRx Server ===');
  
  const next = require('next');
  const app = next({ dev: false, hostname: '0.0.0.0', port: 3000 });
  const handle = app.getRequestHandler();
  
  await app.prepare();
  
  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl).catch(err => {
      console.error('Request error:', err.message);
      res.statusCode = 500;
      res.end('Internal Server Error');
    });
  });

  await new Promise((resolve) => server.listen(3000, '0.0.0.0', resolve));
  console.log('Server ready on http://localhost:3000');

  // --- Phase 1: HTTP tests ---
  console.log('\n=== Phase 1: HTTP Tests ===');
  
  const http = require('http');
  function fetch(url) {
    return new Promise((resolve, reject) => {
      http.get(url, res => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve({ status: res.statusCode, data, headers: res.headers }));
      }).on('error', reject);
    });
  }

  try {
    const html = await fetch('http://localhost:3000/');
    console.log(`HTML page: ${html.status} (${html.data.length} bytes)`);
    
    // Check title in HTML
    const titleMatch = html.data.match(/<title>(.*?)<\/title>/);
    console.log(`Page title: ${titleMatch ? titleMatch[1] : 'NOT FOUND'}`);
    
    // Check static assets
    const cssFiles = html.data.match(/\/_next\/static\/chunks\/[a-f0-9]+\.css/g) || [];
    const jsFiles = html.data.match(/\/_next\/static\/chunks\/[a-f0-9]+\.js/g) || [];
    const fontFiles = html.data.match(/\/_next\/static\/media\/[^\"]+\.woff2/g) || [];
    
    console.log(`Found ${cssFiles.length} CSS, ${jsFiles.length} JS, ${fontFiles.length} font files`);
    
    // Test first CSS
    if (cssFiles.length > 0) {
      const css = await fetch(`http://localhost:3000${cssFiles[0]}`);
      console.log(`CSS ${cssFiles[0]}: ${css.status} (${css.data.length} bytes)`);
    }
    
    // Test first JS
    if (jsFiles.length > 0) {
      const js = await fetch(`http://localhost:3000${jsFiles[0]}`);
      console.log(`JS ${jsFiles[0]}: ${js.status} (${js.data.length} bytes)`);
    }
    
    // Test API
    const api = await fetch('http://localhost:3000/api/company-setup');
    console.log(`API /api/company-setup: ${api.status}`);
    try {
      const apiData = JSON.parse(api.data);
      console.log(`  isSetup: ${apiData.isSetup}, company: ${apiData.company?.name || 'null'}`);
    } catch(e) { console.log(`  Response: ${api.data.substring(0, 200)}`); }

    // Check for demo accounts in HTML
    const hasDemo = html.data.includes('Demo Account') || html.data.includes('demo');
    console.log(`Demo accounts in HTML: ${hasDemo ? 'YES (BAD)' : 'NO (GOOD)'}`);
    
  } catch (err) {
    console.error('HTTP test error:', err.message);
  }

  // --- Phase 2: Playwright browser test ---
  console.log('\n=== Phase 2: Browser Test ===');
  
  try {
    const { chromium } = require('playwright');
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    
    const errors = [];
    const consoleErrors = [];
    page.on('pageerror', err => errors.push(err.message));
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(3000);
    
    const title = await page.title();
    const content = await page.content();
    const hasLogin = content.includes('Sign in');
    const hasCompanySetup = content.includes('Set Up Your Pharmacy');
    const hasDashboard = content.includes('POS Terminal');
    
    console.log(`Title: ${title}`);
    console.log(`Login visible: ${hasLogin}`);
    console.log(`Company setup visible: ${hasCompanySetup}`);
    console.log(`Dashboard/POS visible: ${hasDashboard}`);
    console.log(`Page errors: ${errors.length > 0 ? JSON.stringify(errors) : 'NONE'}`);
    console.log(`Console errors: ${consoleErrors.length > 0 ? JSON.stringify(consoleErrors) : 'NONE'}`);
    
    await page.screenshot({ path: '/home/z/my-project/download/debug-preview.png', fullPage: true });
    console.log('Screenshot: /home/z/my-project/download/debug-preview.png');
    
    // If login is visible, try logging in
    if (hasLogin) {
      console.log('\n=== Phase 3: Login Test ===');
      await page.fill('input[type="text"]', 'mish@gmail.com');
      await page.fill('input[type="password"]', 'admin123');
      await page.click('button[type="submit"]');
      await page.waitForTimeout(3000);
      
      const afterLogin = await page.content();
      const loggedIn = afterLogin.includes('Dashboard') || afterLogin.includes('POS Terminal');
      console.log(`Login successful: ${loggedIn}`);
      
      if (loggedIn) {
        await page.screenshot({ path: '/home/z/my-project/download/debug-logged-in.png', fullPage: true });
        console.log('Logged-in screenshot saved');
      }
      
      // Check for console errors after login
      console.log(`Post-login console errors: ${consoleErrors.length > 0 ? JSON.stringify(consoleErrors) : 'NONE'}`);
    }
    
    await browser.close();
  } catch (err) {
    console.error('Browser test error:', err.message);
  }

  // Cleanup
  server.close();
  console.log('\n=== Diagnostic Complete ===');
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

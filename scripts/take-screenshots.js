const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 }
  });
  const page = await context.newPage();

  // Go to the app
  await page.goto('http://localhost:5173');
  await page.waitForTimeout(1000);

  // Screenshot 1: Main feed view
  await page.screenshot({
    path: 'docs/screenshots/feed-view.png',
    fullPage: false
  });
  console.log('Captured: feed-view.png');

  // Screenshot 2: Settings modal
  await page.click('button:has-text("Settings")');
  await page.waitForTimeout(500);
  await page.screenshot({
    path: 'docs/screenshots/settings-modal.png',
    fullPage: false
  });
  console.log('Captured: settings-modal.png');

  // Close settings
  await page.click('button:has-text("Cancel")');
  await page.waitForTimeout(300);

  // Screenshot 3: Add repo modal
  await page.click('button:has-text("Add Repo")');
  await page.waitForTimeout(500);
  await page.screenshot({
    path: 'docs/screenshots/add-repo-modal.png',
    fullPage: false
  });
  console.log('Captured: add-repo-modal.png');

  await browser.close();
  console.log('Done!');
})();

// install-chrome.js
const { download } = require("@puppeteer/browsers");
const path = require("path");

(async () => {
  const revision = "125.0.6422.60"; // стабільний Chromium
  const installDir = path.resolve(__dirname, "chromium");

  const browser = await download({
    cacheDir: installDir,
    browser: "chrome",
    platform: process.platform === "linux" ? "linux" : "mac",
    buildId: revision,
  });

  console.log("✅ Chromium installed at:", browser.executablePath);
})();

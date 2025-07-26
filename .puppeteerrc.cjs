// .puppeteerrc.cjs
const { join } = require("path");

/**
 * @type {import("puppeteer").Configuration}
 */
module.exports = {
  chrome: {
    skipDownload: false, // 👈 Chrome буде автоматично завантажено
  },
  cacheDirectory: join(__dirname, ".cache", "puppeteer"),
};

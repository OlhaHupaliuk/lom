const { download } = require("@puppeteer/browsers");
const path = require("path");
const fs = require("fs").promises;

(async () => {
  try {
    const revision = "125.0.6422.60";
    const installDir = path.resolve(__dirname, "chromium");

    const browser = await download({
      cacheDir: installDir,
      browser: "chrome",
      platform: "linux", // Force Linux for Render
      buildId: revision,
    });

    console.log("✅ Chromium installed at:", browser.executablePath);
    await fs.writeFile("chromium-path.txt", browser.executablePath); // Log path for debugging
  } catch (error) {
    console.error("❌ Chromium installation failed:", error.message);
    process.exit(1);
  }
})();

const express = require("express");
const fs = require("fs").promises;
const puppeteer = require("puppeteer");
const baseUrl = "https://lombard-centrall.com.ua/shop";
const concurrentRequests = 10;
const maxPages = 1400;
const path = require("path");

async function fetchPage(pageNum, browser, retries = 3) {
  const url = `${baseUrl}?page=${pageNum}`;
  const page = await browser.newPage();

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(
        `[Parser] Attempt ${attempt} to fetch page ${pageNum}: ${url}`
      );
      await page.setUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      );
      await page.setRequestInterception(true);
      page.on("request", (request) => {
        if (["image", "stylesheet", "font"].includes(request.resourceType())) {
          request.abort();
        } else {
          request.continue();
        }
      });

      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
      console.log(`[Parser] Page ${pageNum} loaded successfully`);
      await page.waitForSelector(".card.w-100", { timeout: 20000 });

      const pageProducts = await page.evaluate(() => {
        const productCards = document.querySelectorAll(".card.w-100");
        const products = [];

        productCards.forEach((el) => {
          const title = el
            .querySelector(".card-body div[style*='font-size: 16px']")
            ?.textContent.trim();
          const model = el
            .querySelector(".card-body div[style*='font-size: 14px']")
            ?.textContent.trim();
          const category = el
            .querySelector(".card-body div[style*='font-size: 12px']")
            ?.textContent.trim();
          const price = el
            .querySelector(
              ".card-body .d-flex.justify-content-between div:first-child"
            )
            ?.textContent.trim();
          const location = el
            .querySelector(".card-body div[style*='font-size: 11px']")
            ?.textContent.trim();

          const id = el
            .querySelector("[wire\\:click]")
            ?.getAttribute("wire:click")
            ?.match(/id:\s*(\d+)/)?.[1];

          let img = "No image";
          const aTag = el.querySelector("a[data-fancybox]");
          if (aTag?.href) {
            img = aTag.href;
          } else {
            const imgDiv = el.querySelector("div[style*='background']");
            const style = imgDiv?.getAttribute("style") || "";
            const match = style.match(/url\(['"]?(.*?)['"]?\)/);
            if (match && match[1]) img = match[1];
          }

          if (title && price && id) {
            products.push({ id, category, title, model, price, img, location });
          }
        });

        return products;
      });

      const isNextDisabled = await page.evaluate(() => {
        const nextBtn = document.querySelector("ul.pagination li:last-child");
        return nextBtn?.classList.contains("disabled") || false;
      });

      return {
        products: pageProducts,
        hasNextPage: !isNextDisabled,
        pageNum,
      };
    } catch (error) {
      console.error(
        `[Parser] Attempt ${attempt} failed for page ${pageNum}:`,
        error.message
      );
      if (attempt === retries) {
        console.error(`[Parser] Max retries reached for page ${pageNum}`);
        return { products: [], hasNextPage: false, pageNum };
      }
      await new Promise((resolve) => setTimeout(resolve, 2000 * attempt));
    } finally {
      await page.close().catch(() => {});
    }
  }
}

async function fetchProducts() {
  const products = [];
  let page = 1;
  let hasNextPage = true;

  const browser = await puppeteer.launch({
    headless: "new",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--window-size=1920,1080",
    ],
    protocolTimeout: 60000,
  });
  console.log("[Puppeteer] Executable path:", puppeteer.executablePath());

  while (hasNextPage && page <= maxPages) {
    const pagePromises = Array.from({ length: concurrentRequests }, (_, i) =>
      page + i <= maxPages ? fetchPage(page + i, browser) : null
    ).filter(Boolean);

    console.log(
      `[Parser] Fetching ${pagePromises.length} pages starting from ${page}`
    );

    const results = await Promise.all(pagePromises);
    results.sort((a, b) => a.pageNum - b.pageNum);

    hasNextPage = false;

    for (const result of results) {
      if (result.hasNextPage) hasNextPage = true;

      result.products.forEach((product) => {
        console.log(`[Parser] Page ${result.pageNum}: ${product.title}`);
      });

      products.push(
        ...result.products.map((product) => ({
          ...product,
          link: `${baseUrl}?page=${result.pageNum}`,
        }))
      );
    }

    page += concurrentRequests;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  await browser.close();

  const date = new Date().toISOString().slice(0, 10);
  const filePath = path.join(__dirname, `products_${date}.json`);
  await fs
    .writeFile(filePath, JSON.stringify(products, null, 2))
    .catch(() => {});
  console.log(`[Parser] Saved ${products.length} products to ${filePath}`);

  return products;
}

module.exports = { fetchProducts };

// const app = express();
// const port = process.env.PORT || 3000;

// app.get("/run-script", async (req, res) => {
//   try {
//     const products = await fetchProducts();
//     res.json({ status: "success", products });
//   } catch (err) {
//     console.error("[Parser] Fatal error:", err.message);
//     res.status(500).json({ status: "error", message: err.message });
//   }
// });

// app.listen(port, () => {
//   console.log(`Server running on port ${port}`);
// });

// if (process.env.NODE_ENV !== "production") {
//   fetchProducts().catch((err) => {
//     console.error("[Parser] Fatal error:", err.message);
//     process.exit(1);
//   });
// }

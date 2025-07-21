const express = require("express");
const puppeteer = require("puppeteer");
const fs = require("fs").promises;
const path = require("path");
const app = express();
const port = process.env.PORT || 3000;
const baseUrl = "https://lombard-centrall.com.ua/shop";
const concurrentRequests = 10;
const maxPages = 2000;

async function fetchPage(pageNum, browser) {
  const url = `${baseUrl}?page=${pageNum}`;
  const page = await browser.newPage();

  try {
    await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64)");
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
    await page.waitForSelector(".card.w-100", { timeout: 10000 });

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
          if (match && match[1]) {
            img = match[1];
          }
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

    return { products: pageProducts, hasNextPage: !isNextDisabled, pageNum };
  } catch (error) {
    console.error(`[Parser] Error fetching page ${pageNum}:`, error.message);
    return { products: [], hasNextPage: false, pageNum };
  } finally {
    await page.close().catch(() => {});
  }
}

async function fetchProducts() {
  const products = [];
  let page = 1;
  let hasNextPage = true;

  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu"],
  });

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
  }

  await browser.close();

  const date = new Date().toISOString().slice(0, 10);
  const filePath = path.join(__dirname, `products_${date}.json`);
  await fs.writeFile(filePath, JSON.stringify(products, null, 2));
  console.log(`[Parser] Saved ${products.length} products to ${filePath}`);

  return products;
}

app.get("/run-script", async (req, res) => {
  try {
    const products = await fetchProducts();
    res.json({ status: "success", products });
  } catch (err) {
    console.error("[Parser] Fatal error:", err.message);
    res.status(500).json({ status: "error", message: err.message });
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

if (process.env.NODE_ENV !== "production") {
  fetchProducts().catch((err) => {
    console.error("[Parser] Fatal error:", err.message);
    process.exit(1);
  });
}

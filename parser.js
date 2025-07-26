// parser.js
const fs = require("fs").promises;
const { executablePath } = require("puppeteer");
const puppeteer = require("puppeteer");
const baseUrl = "https://lombard-centrall.com.ua/shop";
const concurrentRequests = 10;
const maxPages = 1400;
const path = require("path");
const { connectDB } = require("./db");

async function saveToDatabase(products, date) {
  const collection = await connectDB();
  const documents = products.map((product) => ({
    ...product,
    date,
    timestamp: new Date(),
  }));
  await collection.deleteMany({ date }); // Clear old data for the same date
  if (documents.length > 0) {
    await collection.insertMany(documents);
    console.log(`[DB] Saved ${documents.length} products for date ${date}`);
  }
}

async function fetchPage(pageNum, browser, retries = 3) {
  const url = `${baseUrl}?page=${pageNum}`;
  for (let attempt = 1; attempt <= retries; attempt++) {
    const page = await browser.newPage();
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
      await page.goto(url, { waitUntil: "networkidle2", timeout: 90000 });
      console.log(`[Parser] Page ${pageNum} loaded successfully`);
      await page.waitForSelector(".card.w-100", { timeout: 40000 });

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

      return { products: pageProducts, hasNextPage: !isNextDisabled, pageNum };
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
  const date = new Date().toISOString().slice(0, 10);
  let page = 1;
  let hasNextPage = true;
  console.log("🟡 Launching browser…");
  const browser = await puppeteer.launch({
    headless: "new",
    executablePath: puppeteer.executablePath(),
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
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
      if (result.products.length > 0) {
        const productsWithLink = result.products.map((p) => ({
          ...p,
          link: `${baseUrl}?page=${result.pageNum}`,
        }));
        await saveToDatabase(productsWithLink, date); // Save per page
      }
    }

    page += concurrentRequests;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  await browser.close();
  console.log(`[Parser] Parsing completed for ${date}`);
  return { date }; // Return minimal data
}

module.exports = { fetchProducts };

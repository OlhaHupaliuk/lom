const puppeteer = require("puppeteer");
const fs = require("fs").promises;
const path = require("path");

const baseUrl = "https://lombard-centrall.com.ua/shop";
const concurrentRequests = 10;
const maxPages = 2000;

async function fetchPage(pageNum, browser) {
  const url = `${baseUrl}?page=${pageNum}`;
  console.log(`[Parser] Fetching page ${pageNum}: ${url}`);
  const page = await browser.newPage();
  try {
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      if (["image", "stylesheet", "font"].includes(req.resourceType())) {
        req.abort();
      } else {
        req.continue();
      }
    });

    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
    );
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });

    await page
      .waitForSelector(".card.w-100, h5", { timeout: 5000 })
      .catch(() => {});

    const noProducts = await page.evaluate(() => {
      return document
        .querySelector("h5")
        ?.textContent.includes("Товарів не знайдено");
    });
    if (noProducts) {
      console.log(`[Parser] No products found on page ${pageNum}`);
      return { products: [], hasNextPage: false, pageNum };
    }

    const isNextDisabled = await page.evaluate(() => {
      const nextButton = document.querySelector(
        "li[aria-label='pagination.next']"
      );
      return (
        nextButton?.classList.contains("disabled") ||
        nextButton?.getAttribute("aria-disabled") === "true"
      );
    });

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
        const img =
          el
            .querySelector(".card-img-top")
            ?.style.background?.match(/url\(['"](.*?)['"]\)/)?.[1] ||
          "No image";
        const wireClickAttr = el
          .querySelector(".card-img-top")
          ?.getAttribute("wire:click");
        const id = wireClickAttr?.match(/id:\s*(\d+)/)?.[1];
        const location = el
          .querySelector(".card-body div[style*='font-size: 11px']")
          ?.textContent.trim();

        if (title && price && id) {
          products.push({ id, category, title, model, price, img, location });
        }
      });

      return products;
    });

    console.log(
      `[Parser] Found ${pageProducts.length} products on page ${pageNum}`
    );
    await page.close();
    return { products: pageProducts, hasNextPage: !isNextDisabled, pageNum };
  } catch (error) {
    console.error(`[Parser] Error fetching page ${pageNum}:`, error.message);
    await page.close();
    return { products: [], hasNextPage: false, pageNum };
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

    let anyPageHasNext = false;
    for (const result of results) {
      if (result.hasNextPage) {
        anyPageHasNext = true;
      }
      result.products.forEach((product) => {
        console.log(
          `[Parser] Found product on page ${result.pageNum}: ${product.title}`
        );
      });
      products.push(
        ...result.products.map((product) => ({
          ...product,
          link: `${baseUrl}?page=${result.pageNum}`,
        }))
      );
    }

    hasNextPage = anyPageHasNext;
    page += concurrentRequests;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  await browser.close();

  console.log(`[Parser] Collected ${products.length} products`);

  const date = new Date().toISOString().slice(0, 10);
  const filePath = path.join(__dirname, `products_${date}.json`);
  await fs.writeFile(filePath, JSON.stringify(products, null, 2));
  console.log(`[Parser] Saved to ${filePath}`);

  return products;
}

fetchProducts().catch((err) => {
  console.error("[Parser] Fatal error:", err.message);
  process.exit(1);
});

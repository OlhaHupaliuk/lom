const axios = require("axios");
const cheerio = require("cheerio");

async function fetchProducts() {
  const baseUrl = "https://lombard-centrall.com.ua/shop";
  const products = [];
  let page = 1;
  const concurrentRequests = 5; // по 5 сторінок одночасно
  const MAX_PRODUCTS = 500; // межа на кількість товарів

  async function fetchPage(pageNum) {
    const url = `${baseUrl}?page=${pageNum}`; // додано "?" перед page
    console.log(`[Parser] Fetching page ${pageNum}: ${url}`);
    try {
      const res = await axios.get(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
        timeout: 10000,
      });
      const $ = cheerio.load(res.data);
      const productCards = $(".card.w-100");
      const pageProducts = [];

      productCards.each((i, el) => {
        const title = $(el)
          .find(".card-body div[style*='font-size: 16px']")
          .text()
          .trim();
        const model = $(el)
          .find(".card-body div[style*='font-size: 14px']")
          .text()
          .trim();
        const category = $(el)
          .find(".card-body div[style*='font-size: 12px']")
          .first()
          .text()
          .trim();
        const price = $(el)
          .find(".card-body div:contains('грн')")
          .first()
          .text()
          .trim();
        const img =
          $(el)
            .find(".card-img-top")
            .css("background")
            ?.match(/url\(['"](.*?)['"]\)/)?.[1] || "No image";
        const wireClickAttr = $(el).find(".card-img-top").attr("wire:click");
        const id = wireClickAttr?.match(/id:\s*(\d+)/)?.[1];

        const link = `${baseUrl}?page=${pageNum}`;
        const location = $(el)
          .find(".card-body div[style*='font-size: 11px']")
          .text()
          .trim();

        if (title && price && id) {
          pageProducts.push({
            id,
            category,
            title,
            model,
            price,
            img,
            link,
            location,
          });
        }
      });

      return pageProducts;
    } catch (error) {
      console.error(`[Parser] Error fetching page ${pageNum}:`, error.message);
      return [];
    }
  }

  while (products.length < MAX_PRODUCTS) {
    const pagePromises = Array.from({ length: concurrentRequests }, (_, i) =>
      fetchPage(page + i)
    );
    console.log(
      `[Parser] Fetching ${concurrentRequests} pages concurrently starting from page ${page}`
    );
    const results = await Promise.all(pagePromises);

    for (const result of results) {
      if (products.length >= MAX_PRODUCTS) break;
      products.push(...result);
    }

    page += concurrentRequests;
    await new Promise((resolve) => setTimeout(resolve, 1000)); // затримка 1 сек
  }

  // Обрізаємо до 500 товарів, якщо більше набралося
  const finalProducts = products.slice(0, MAX_PRODUCTS);
  console.log(`[Parser] Collected ${finalProducts.length} products`);
  return finalProducts;
}

module.exports = { fetchProducts };

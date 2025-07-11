const axios = require("axios");
const cheerio = require("cheerio");

async function fetchProducts() {
  const baseUrl = "https://lombard-centrall.com.ua/shop?sort=latest";
  const products = [];
  let page = 1;
  const maxProducts = 200;
  let hasNextPage = true;

  while (hasNextPage && products.length < maxProducts) {
    const url = `${baseUrl}&page=${page}`;
    console.log(`[Parser] Fetching page ${page}: ${url}`);

    try {
      const res = await axios.get(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
      });
      console.log("[Parser] HTTP request successful, status:", res.status);

      const $ = cheerio.load(res.data);
      const productCards = $(".card.w-100");

      if (productCards.length === 0) {
        console.log(`[Parser] No products found on page ${page}`);
        hasNextPage = false;
        break;
      }

      productCards.each((i, el) => {
        if (products.length >= maxProducts) return false;

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
        const id =
          $(el)
            .find(".card-img-top")
            .attr("wire:click")
            ?.match(/{ id: (\d+) }/)?.[1] || `product-${page}-${i}`;
        const link = `https://lombard-centrall.com.ua/shop/${id}`;
        const location = $(el)
          .find(".card-body div[style*='font-size: 11px']")
          .text()
          .trim();

        if (title && price && id) {
          products.push({
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

      // Check for next page
      const nextButton = $("button[dusk='nextPage']");
      hasNextPage = nextButton.length && !nextButton.attr("disabled");
      console.log(`[Parser] Next page available: ${hasNextPage}`);
      page++;
    } catch (error) {
      console.error(`[Parser] Error fetching page ${page}:`, error.message);
      hasNextPage = false;
    }
  }

  console.log(`[Parser] Successfully parsed ${products.length} products`);
  return products.slice(0, maxProducts);
}

module.exports = { fetchProducts };

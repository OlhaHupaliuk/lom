const crypto = require("crypto");
const { connectDB } = require("./db");
const { fetchProducts } = require("./parser");

function generateHash(product) {
  return crypto
    .createHash("md5")
    .update(`${product.id}-${product.title}-${product.price}`)
    .digest("hex");
}

async function checkForChanges() {
  console.log("[Check] Starting check for new products");

  try {
    const collection = await connectDB();

    // Завантажуємо лише останні 1000 товарів з бази
    const existingItems = await collection
      .find({})
      .sort({ _id: -1 }) // найсвіжіші
      .limit(1000)
      .toArray();

    const existingHashes = new Set(
      existingItems.map((item) => generateHash(item))
    );

    const currentItems = await fetchProducts(); // тепер fetchProducts збирає тільки перші ~500 товарів
    console.log(`[Check] Fetched ${currentItems.length} current products`);

    const newItems = [];

    for (const item of currentItems) {
      const hash = generateHash(item);
      if (!existingHashes.has(hash)) {
        newItems.push(item);
        console.log(`[Check] New product: ${item.title}, ID: ${item.id}`);
      }
    }

    console.log(`[Check] Found ${newItems.length} new products`);
    return { newItems };
  } catch (err) {
    console.error("[Check] Error in checkForChanges:", err.message);
    throw err;
  }
}

module.exports = { checkForChanges };

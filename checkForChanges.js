const { connectDB } = require("./db");
const { fetchProducts } = require("./parser");

async function checkForChanges() {
  console.log("[Check] Starting check for new products");

  try {
    const collection = await connectDB();

    // Отримуємо всі існуючі id з колекції
    const existingItems = await collection
      .find({}, { projection: { id: 1 } })
      .toArray();
    const existingIds = new Set(existingItems.map((item) => item.id));

    // Парсимо нові товари
    const currentItems = await fetchProducts();
    console.log(`[Check] Fetched ${currentItems.length} current products`);

    // Фільтруємо лише нові
    const newItems = currentItems.filter((item) => !existingIds.has(item.id));

    newItems.forEach((item) =>
      console.log(`[Check] New product: ${item.title}, ID: ${item.id}`)
    );

    console.log(`[Check] Found ${newItems.length} new products`);
    return { newItems };
  } catch (err) {
    console.error("[Check] Error in checkForChanges:", err.message);
    throw err;
  }
}

module.exports = { checkForChanges };

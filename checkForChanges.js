const { connectDB } = require("./db");
const { fetchProducts } = require("./parser");

async function checkForChanges() {
  console.log("[Check] Starting check for new products");
  const collection = await connectDB();
  const currentItems = await fetchProducts();
  const existingItems = await collection.find({}).toArray();
  const existingMap = new Map(existingItems.map((item) => [item.id, item]));
  const newItems = [];

  for (const item of currentItems) {
    if (!existingMap.has(item.id)) {
      newItems.push(item);
      console.log(`[Check] New product found: ${item.title}, ID: ${item.id}`);
    }
  }

  console.log(`[Check] Found ${newItems.length} new products`);
  return { newItems };
}

module.exports = { checkForChanges };

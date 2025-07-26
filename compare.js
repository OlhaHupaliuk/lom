// compare.js
const fs = require("fs").promises;
const path = require("path");
const { connectDB } = require("./db");

async function compareByDate(date1, date2) {
  const collection = await connectDB();
  const [items1, items2] = await Promise.all([
    collection.find({ date: date1 }).toArray(),
    collection.find({ date: date2 }).toArray(),
  ]);

  const ids1 = new Set(items1.map((item) => item.id));
  const newItems = items2.filter((item) => !ids1.has(item.id));

  if (newItems.length > 0) {
    const newItemsCollection = await connectDB("new_products"); // Separate collection
    await newItemsCollection.deleteMany({ date: date2 });
    await newItemsCollection.insertMany(
      newItems.map((item) => ({ ...item, comparisonDate: date2 }))
    );
    console.log(
      `[Compare DB] Saved ${newItems.length} new products for ${date2}`
    );
  }

  console.log(`[Compare DB] Found ${newItems.length} new products`);
  return newItems;
}

async function compareJsonFiles(file1, file2) {
  try {
    const data1 = JSON.parse(await fs.readFile(file1));
    const data2 = JSON.parse(await fs.readFile(file2));
    const ids1 = new Set(data1.map((item) => item.id));
    const newItems = data2.filter((item) => !ids1.has(item.id));
    console.log(`[Compare] Found ${newItems.length} new products`);
    if (newItems.length > 0) {
      const date = new Date().toISOString().slice(0, 10);
      const outputFile = path.join(__dirname, `new_products_${date}.json`);
      await fs.writeFile(outputFile, JSON.stringify(newItems, null, 2));
      console.log(`[Compare] Saved new products to ${outputFile}`);
    }
    return newItems;
  } catch (err) {
    console.error("[Compare] Error:", err.message);
    throw err;
  }
}

if (require.main === module) {
  const [, , file1, file2] = process.argv;
  if (!file1 || !file2) {
    console.error("[Compare] Please provide two JSON files to compare");
    process.exit(1);
  }
  compareJsonFiles(file1, file2).catch((err) => {
    console.error("[Compare] Fatal error:", err.message);
    process.exit(1);
  });
}

module.exports = { compareJsonFiles, compareByDate };

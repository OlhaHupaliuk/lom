const fs = require("fs").promises;
const path = require("path");

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

// Example usage: node compare.js products_2025-07-16.json products_2025-07-17.json
const [, , file1, file2] = process.argv;
if (!file1 || !file2) {
  console.error("[Compare] Please provide two JSON files to compare");
  process.exit(1);
}

compareJsonFiles(file1, file2).catch((err) => {
  console.error("[Compare] Fatal error:", err.message);
  process.exit(1);
});

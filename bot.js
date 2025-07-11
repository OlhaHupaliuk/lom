const { Telegraf } = require("telegraf");
const { checkForChanges } = require("./checkForChanges");
const { connectDB } = require("./db");
require("dotenv").config();
const cron = require("node-cron");
const chatIds = process.env.CHAT_IDS.split(",");

const bot = new Telegraf(process.env.BOT_TOKEN);
const chatId = process.env.CHAT_ID;

async function sendMessage(product) {
  console.log(`[Bot] Sending new product: ${product.title}`);
  for (const id of chatIds) {
    await bot.telegram.sendMessage(
      id,
      `🆕 Новий товар\n\n📦 ${product.title} (${product.model})\n💰 ${product.price}\n🔗 ${product.link}\n📍 ${product.location}`
    );
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
}

// Check for new products and notify
async function notifyChanges() {
  console.log("[Bot] Starting notifyChanges:", new Date().toLocaleString());
  const { newItems } = await checkForChanges();
  const collection = await connectDB();

  for (const product of newItems) {
    await collection.insertOne(product);
    await sendMessage(product);
  }

  // Maintain only the latest 200 products
  const allProducts = await collection.find({}).sort({ _id: -1 }).toArray();
  if (allProducts.length > 200) {
    const idsToKeep = allProducts.slice(0, 200).map((item) => item._id);
    await collection.deleteMany({ _id: { $nin: idsToKeep } });
  }

  //   Send message if no new products
  if (newItems.length === 0) {
    for (const id of chatIds) {
      await bot.telegram.sendMessage(id, "ℹ️ Нових товарів не знайдено");
    }
  }

  console.log(`[Bot] Found and sent ${newItems.length} new products`);
  return { newItems };
}

cron.schedule("0 10 * * *", async () => {
  console.log("Cron job started:", new Date().toLocaleString());
  try {
    await notifyChanges();
  } catch (err) {
    console.error("Error in cron job:", err);
  }
});

bot.launch();

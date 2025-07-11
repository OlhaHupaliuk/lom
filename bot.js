const { Telegraf } = require("telegraf");
const { checkForChanges } = require("./checkForChanges");
const { connectDB } = require("./db");
const cron = require("node-cron");
require("dotenv").config();

const bot = new Telegraf(process.env.BOT_TOKEN);
const chatId = process.env.CHAT_ID;

// Function to send message for a single product
async function sendMessage(product) {
  console.log(`[Bot] Sending new product: ${product.title}`);
  await bot.telegram.sendMessage(
    chatId,
    `🆕 Новий товар\n\n📦 ${product.title} (${product.model})\n💰 ${product.price}\n🔗 ${product.link}\n📍 ${product.location}`
  );
  await new Promise((resolve) => setTimeout(resolve, 1));
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
    await bot.telegram.sendMessage(chatId, "ℹ️ Нових товарів не знайдено");
  }

  console.log(`[Bot] Found and sent ${newItems.length} new products`);
  return { newItems };
}

// Manual check command
bot.command("check", async (ctx) => {
  if (ctx.chat.id.toString() === chatId) {
    await notifyChanges();
    await ctx.reply("✅ Перевірка завершена");
  }
});

// Cron job for automatic checks every day at 10
cron.schedule("0 10 * * *", async () => {
  console.log("[Bot] Running scheduled check:", new Date().toLocaleString());
  await notifyChanges();
  console.log(
    `[Bot] Scheduled parsing completed at ${new Date().toLocaleString()}`
  );
});

bot.launch();
notifyChanges();
bot.telegram.sendMessage(chatId, "✅ Бот успішно запущено");

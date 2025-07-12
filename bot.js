const { Telegraf } = require("telegraf");
const { checkForChanges } = require("./checkForChanges");
const { connectDB } = require("./db");
const { fetchProducts } = require("./parser");
require("dotenv").config({ debug: true });

const chatIds = process.env.CHAT_IDS ? process.env.CHAT_IDS.split(",") : [];
if (!process.env.BOT_TOKEN) {
  console.error("[Bot] Error: BOT_TOKEN is not set in .env");
  process.exit(1);
}
if (!chatIds.length) {
  console.error("[Bot] Error: CHAT_IDS is not set or empty in .env");
}

const bot = new Telegraf(process.env.BOT_TOKEN, { handlerTimeout: 240000 });

// Load all products into DB on startup
async function loadAllProducts() {
  console.log("[Bot] Starting to load all products into DB");
  try {
    const collection = await connectDB();
    const products = await fetchProducts(); // Fetch up to 500
    console.log(`[Bot] Fetched ${products.length} products from parser`);

    await collection.deleteMany({}); // Clear previous
    for (const product of products) {
      await collection.replaceOne({ id: product.id }, product, {
        upsert: true,
      });
    }

    console.log(
      `[Bot] Successfully loaded ${products.length} products into DB`
    );
  } catch (err) {
    console.error("[Bot] Error in loadAllProducts:", err.message);
    throw err;
  }
}

// Send product message with delay
async function sendMessage(product) {
  console.log(`[Bot] Sending new product: ${product.title}, ID: ${product.id}`);
  for (const id of chatIds) {
    try {
      await bot.telegram.sendPhoto(id, product.img, {
        caption: `📦 ${product.title} (${product.model})\n💰 ${product.price}\n🔗 ${product.link}\n📍 ${product.location}`,
      });
      console.log(`[Bot] Message sent to chat ID: ${id}`);
      await new Promise((resolve) => setTimeout(resolve, 1000)); // Delay for Telegram API
    } catch (err) {
      console.error(
        `[Bot] Error sending message to chat ID ${id}:`,
        err.message
      );
    }
  }
}

// Check for new products and notify
async function notifyChanges() {
  console.log("[Bot] Starting notifyChanges:", new Date().toLocaleString());
  try {
    const { newItems } = await checkForChanges();
    console.log(`[Bot] Found ${newItems.length} new products to process`);
    const collection = await connectDB();

    for (const product of newItems) {
      await collection.replaceOne({ id: product.id }, product, {
        upsert: true,
      });
      await sendMessage(product);
    }

    // Auto-cleanup if >10 000 items
    const total = await collection.countDocuments();
    if (total > 10000) {
      const excess = total - 10000;
      const oldItems = await collection
        .find({})
        .sort({ _id: 1 })
        .limit(excess)
        .toArray();
      const oldIds = oldItems.map((item) => item._id);
      await collection.deleteMany({ _id: { $in: oldIds } });
      console.log(`[Bot] Removed ${excess} old records to maintain DB size`);
    }

    for (const id of chatIds) {
      const message =
        newItems.length > 0
          ? `📢 Нових товарів: ${newItems.length}`
          : "ℹ️ Нових товарів не знайдено";
      await bot.telegram.sendMessage(id, message);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    console.log(`[Bot] Completed notifyChanges`);
    return { newItems };
  } catch (err) {
    console.error("[Bot] Error in notifyChanges:", err.message);
    throw err;
  }
}

// /check command
bot.command("check", async (ctx) => {
  console.log(`[Bot] Received /check command from chat ID: ${ctx.chat.id}`);
  if (!chatIds.includes(ctx.chat.id.toString())) {
    await ctx.reply("⛔ Unauthorized access");
    return;
  }

  let loadingMessage;
  try {
    loadingMessage = await ctx.reply("⏳ Зачекайте...");
    await notifyChanges();
    await ctx.telegram.deleteMessage(ctx.chat.id, loadingMessage.message_id);
    await ctx.reply("✅ Перевірка завершена");
  } catch (err) {
    console.error("[Bot] Error in /check:", err.message);
    if (loadingMessage) {
      try {
        await ctx.telegram.deleteMessage(
          ctx.chat.id,
          loadingMessage.message_id
        );
      } catch (deleteErr) {
        console.error("[Bot] Can't delete loading message:", deleteErr.message);
      }
    }
    await ctx.reply("❌ Помилка: " + err.message);
  }
});

// /stats command
bot.command("stats", async (ctx) => {
  try {
    const collection = await connectDB();
    const count = await collection.countDocuments();
    await ctx.reply(`📦 Всього товарів у базі: ${count}`);
  } catch (err) {
    console.error("[Bot] Error in /stats:", err.message);
    await ctx.reply("⚠️ Не вдалося отримати статистику");
  }
});

// Errors
bot.on("polling_error", (err) => {
  console.error("[Bot] Telegraf polling error:", err.message);
});

// Start bot
bot
  .launch()
  .then(async () => {
    console.log("[Bot] Bot successfully launched");
    await loadAllProducts();
    console.log("[Bot] Initial product load completed");
  })
  .catch((err) => {
    console.error("[Bot] Failed to launch bot:", err.message);
    process.exit(1);
  });

// Express server
const express = require("express");
const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  console.log("[Bot] Received request to root endpoint");
  res.send("Bot is running");
});
app.get("/trigger", async (req, res) => {
  try {
    console.log("[Bot] /trigger endpoint called");
    const { newItems } = await notifyChanges();
    res.send(`✅ Done. Found ${newItems.length} new products`);
  } catch (err) {
    console.error("[Bot] Trigger error:", err.message);
    res.status(500).send("❌ Error during trigger");
  }
});

app.listen(PORT, () => {
  console.log(`🌐 Express server listening on port ${PORT}`);
});

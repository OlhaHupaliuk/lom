const { Telegraf } = require("telegraf");
const fs = require("fs").promises;
const path = require("path");
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

async function sendMessage(product, chatId) {
  try {
    await bot.telegram.sendPhoto(chatId, product.img, {
      caption: `📦 ${product.title} (${product.model})\n💰 ${product.price}\n🔗 ${product.link}\n📍 ${product.location}`,
    });
    console.log(`[Bot] Message sent to chat ID: ${chatId}`);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  } catch (err) {
    console.error(`[Bot] Error sending to chat ID ${chatId}:`, err.message);
  }
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

bot.command("check", async (ctx) => {
  const chatId = ctx.chat.id.toString();
  console.log(`[Bot] Received /check from chat ID: ${chatId}`);
  if (!chatIds.includes(chatId)) {
    await ctx.reply("⛔ Недоступно для цього чату");
    return;
  }

  let loadingMessage;
  try {
    loadingMessage = await ctx.reply("⏳ Зачекайте...");
    const date = new Date().toISOString().slice(0, 10);
    const filePath = path.join(__dirname, `new_products_${date}.json`);

    let newItems = [];
    try {
      newItems = JSON.parse(await fs.readFile(filePath));
    } catch (err) {
      console.error(`[Bot] Error reading ${filePath}:`, err.message);
      await ctx.reply("⚠️ Нові товари не знайдено");
      return;
    }

    if (newItems.length === 0) {
      await ctx.reply("ℹ️ Нових товарів не знайдено");
    } else {
      for (const product of newItems) {
        await sendMessage(product, chatId);
      }
      await ctx.reply(`📢 Нових товарів: ${newItems.length}`);
    }

    await ctx.telegram.deleteMessage(chatId, loadingMessage.message_id);
  } catch (err) {
    console.error("[Bot] Error in /check:", err.message);
    if (loadingMessage) {
      try {
        await ctx.telegram.deleteMessage(chatId, loadingMessage.message_id);
      } catch (deleteErr) {
        console.error("[Bot] Can't delete loading message:", deleteErr.message);
      }
    }
    await ctx.reply("❌ Помилка: " + err.message);
  }
});

bot.command("compare", async (ctx) => {
  const chatId = ctx.chat.id.toString();
  if (!chatIds.includes(chatId)) {
    await ctx.reply("⛔ Недоступно для цього чату");
    return;
  }

  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  const format = (d) => d.toISOString().slice(0, 10);
  const file1 = `products_${format(yesterday)}.json`;
  const file2 = `products_${format(today)}.json`;

  let loadingMessage;
  try {
    loadingMessage = await ctx.reply("⏳ Порівнюємо товари...");
    const newItems = await compareJsonFiles(
      path.join(__dirname, file1),
      path.join(__dirname, file2)
    );

    if (newItems.length === 0) {
      await ctx.reply("ℹ️ Нових товарів не знайдено");
    } else {
      await ctx.reply(`📢 Знайдено ${newItems.length} нових товарів`);
    }

    await ctx.telegram.deleteMessage(chatId, loadingMessage.message_id);
  } catch (err) {
    if (loadingMessage) {
      await ctx.telegram
        .deleteMessage(chatId, loadingMessage.message_id)
        .catch(() => {});
    }
    await ctx.reply("❌ Помилка: " + err.message);
  }
});
bot.on("polling_error", (err) => {
  console.error("[Bot] Telegraf polling error:", err.message);
});

bot
  .launch()
  .then(() => console.log("[Bot] Bot successfully launched"))
  .catch((err) => {
    console.error("[Bot] Failed to launch bot:", err.message);
    process.exit(1);
  });

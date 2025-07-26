const { Telegraf } = require("telegraf");
const { compareByDate } = require("./compare");
const { fetchProducts } = require("./parser");
const { connectDB } = require("./db");
require("dotenv").config({ debug: true });

const chatIds = process.env.CHAT_IDS ? process.env.CHAT_IDS.split(",") : [];
if (!process.env.BOT_TOKEN) {
  console.error("[Bot] Error: BOT_TOKEN is not set in .env");
  process.exit(1);
}
if (!chatIds.length) {
  console.error("[Bot] Error: CHAT_IDS is not set or empty in .env");
}

const bot = new Telegraf(process.env.BOT_TOKEN, { handlerTimeout: 1200000 });

async function sendMessage(product, chatId) {
  try {
    await bot.telegram.sendPhoto(chatId, product.img, {
      caption: `📦 ${product.title} (${product.model})\n💰 ${product.category}\n ${product.price}\n🔗 ${product.link}\n📍 ${product.location}`,
    });
    console.log(`[Bot] Message sent to chat ID: ${chatId}`);
    await new Promise((resolve) => setTimeout(resolve, 300));
  } catch (err) {
    console.error(`[Bot] Error sending to chat ID ${chatId}:`, err.message);
  }
}

const userAbortMap = new Map();

bot.command("check", async (ctx) => {
  const chatId = ctx.chat.id.toString();
  if (userAbortMap.get(chatId) === true) {
    await ctx.reply(
      "⚠️ Ви вже виконуєте /check. Використайте /cancel для зупинки."
    );
    return;
  }

  userAbortMap.set(chatId, false);
  let loadingMessage;
  try {
    loadingMessage = await ctx.reply("⏳ Зачекайте...");
    const date = new Date().toISOString().slice(0, 10);
    const newItemsCollection = await connectDB("new_products");
    const newItems = await newItemsCollection
      .find({ comparisonDate: date })
      .toArray();

    if (newItems.length === 0) {
      await ctx.reply("ℹ️ Нових товарів не знайдено");
    } else {
      for (const product of newItems) {
        if (userAbortMap.get(chatId)) {
          await ctx.reply("🚫 Надсилання скасовано командою /cancel.");
          break;
        }
        await sendMessage(product, chatId);
      }
      if (!userAbortMap.get(chatId)) {
        await ctx.reply(`📢 Нових товарів: ${newItems.length}`);
      }
    }

    await ctx.telegram
      .deleteMessage(chatId, loadingMessage.message_id)
      .catch(() => {});
    userAbortMap.delete(chatId);
  } catch (err) {
    console.error("[Bot] Error in /check:", err.message);
    if (loadingMessage) {
      await ctx.telegram
        .deleteMessage(chatId, loadingMessage.message_id)
        .catch(() => {});
    }
    await ctx.reply("❌ Помилка: " + err.message);
    userAbortMap.delete(chatId);
  }
});

bot.command("compare", async (ctx) => {
  const chatId = ctx.chat.id.toString();
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const format = (d) => d.toISOString().slice(0, 10);
  const date1 = format(yesterday);
  const date2 = format(today);

  let loadingMessage;
  try {
    loadingMessage = await ctx.reply("⏳ Порівнюємо товари...");
    const newItems = await compareByDate(date1, date2);
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

bot.command("cancel", async (ctx) => {
  const chatId = ctx.chat.id.toString();
  userAbortMap.set(chatId, true);
  await ctx.reply("✅ Операцію буде скасовано.");
});

bot.on("polling_error", (err) => {
  console.error("[Bot] Telegraf polling error:", err.message);
});

bot.command("startparser", async (ctx) => {
  await ctx.reply("🔁 Натисніть кнопку нижче, щоб запустити парсинг:", {
    reply_markup: {
      inline_keyboard: [
        [{ text: "🚀 Запустити парсер", callback_data: "run_parser" }],
      ],
    },
  });
});

bot.action("run_parser", async (ctx) => {
  try {
    await ctx.answerCbQuery("🔄 Запуск парсера...");
    await ctx.reply("⏳ Парсинг почався, чекайте...");
    await fetchProducts();
    await ctx.reply("✅ Парсинг завершено.");
  } catch (err) {
    await ctx.reply("❌ Помилка під час парсингу: " + err.message);
  }
});

bot
  .launch()
  .then(() => console.log("[Bot] Bot successfully launched"))
  .catch((err) => {
    console.error("[Bot] Failed to launch bot:", err.message);
    process.exit(1);
  });

const express = require("express");
const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.json({ message: "🤖 Бот працює!" });
});

app.listen(PORT, () => {
  console.log(`[Server] Сервер запущено на порті ${PORT}`);
});

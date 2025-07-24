const { Telegraf } = require("telegraf");
const fs = require("fs").promises;
const path = require("path");
const { compareJsonFiles } = require("./compare");
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

const userAbortMap = new Map(); // Зберігає: chatId → active (true/false)

bot.command("check", async (ctx) => {
  const chatId = ctx.chat.id.toString();

  if (userAbortMap.get(chatId) === true) {
    await ctx.reply(
      "⚠️ Ви вже виконуєте /check. Використайте /cancel для зупинки."
    );
    return;
  }

  userAbortMap.set(chatId, false); // Починаємо процес

  let loadingMessage;
  try {
    loadingMessage = await ctx.reply("⏳ Зачекайте...");

    const date = new Date().toISOString().slice(0, 10);
    const filePath = path.join(__dirname, `new_products_${date}.json`);

    let newItems = [];
    try {
      newItems = JSON.parse(await fs.readFile(filePath));
    } catch (err) {
      await ctx.reply("⚠️ Нові товари не знайдено");
      userAbortMap.delete(chatId);
      return;
    }

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

bot.command("cancel", async (ctx) => {
  const chatId = ctx.chat.id.toString();
  if (userAbortMap.has(chatId) && userAbortMap.get(chatId) === false) {
    userAbortMap.set(chatId, true);
    await ctx.reply("✅ Надсилання буде зупинено.");
  } else {
    await ctx.reply("ℹ️ Нічого не виконується.");
  }
});

bot.command("compare", async (ctx) => {
  const chatId = ctx.chat.id.toString();

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

bot.command("startparser", async (ctx) => {
  const url = "https://lombardbot-d2mp.onrender.com/run-script"; // 🔁 заміни на свій реальний домен

  await ctx.reply("🔁 Натисніть кнопку нижче, щоб запустити парсинг:", {
    reply_markup: {
      inline_keyboard: [[{ text: "🚀 Запустити парсер", url: url }]],
    },
  });
});

bot
  .launch()
  .then(() => console.log("[Bot] Bot successfully launched"))
  .catch((err) => {
    console.error("[Bot] Failed to launch bot:", err.message);
    process.exit(1);
  });

// Створення веб-сервера
const express = require("express");
const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.json({ message: "🤖 Бот працює!" });
});

app.get("/run-script", async (req, res) => {
  try {
    await fetchProducts(); // лишаємо тільки парсинг

    res.send("✅ Парсинг завершено та збережено у файл з датою");
  } catch (err) {
    console.error("[/run-script] Error:", err.message);
    res.status(500).send("❌ Помилка: " + err.message);
  }
});

app.listen(PORT, () => {
  console.log(`[Server] Сервер запущено на порті ${PORT}`);
});

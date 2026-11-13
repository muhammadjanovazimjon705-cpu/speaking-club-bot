require("dotenv").config();
const { Telegraf, Scenes, session, Markup } = require("telegraf");
const db = require("./database");
const express = require("express"); // Webhook uchun qo'shildi

const bot = new Telegraf(process.env.BOT_TOKEN);
const CHANNEL_ID = process.env.CHANNEL_ID;
const CHANNEL_LINK = process.env.CHANNEL_LINK;

class SQLiteSessionStore {
  get(key) {
    const r = db.prepare("SELECT value FROM sessions WHERE key=?").get(key);
    return r ? JSON.parse(r.value) : undefined;
  }
  set(key, value) {
    db.prepare("INSERT OR REPLACE INTO sessions (key,value) VALUES (?,?)").run(
      key,
      JSON.stringify(value)
    );
  }
  delete(key) {
    db.prepare("DELETE FROM sessions WHERE key=?").run(key);
  }
}

bot.use(session({ store: new SQLiteSessionStore() }));

// ============================================
// MAJBURIY OBUNA TEKSHIRUVI (MIDDLEWARE)
// ============================================
bot.use(async (ctx, next) => {
  // Agar kanal sozlanmagan bo'lsa, tekshirmaymiz
  if (!CHANNEL_ID || !CHANNEL_LINK) return next();

  // Faqat shaxsiy chatda tekshiramiz
  if (ctx.chat?.type !== "private") return next();

  // /start va til tanlash buyruqlarini har doim o'tkazib yuboramiz
  if (ctx.message?.text === "/start") {
    if (!ctx.session.lang) ctx.session.lang = "uz";
  }

  const userId = ctx.from.id;

  try {
    // Telegram API orqali foydalanuvchining kanaldagi holatini tekshirish
    const member = await ctx.telegram.getChatMember(CHANNEL_ID, userId);
    const isSubscribed = ["member", "administrator", "creator"].includes(
      member.status
    );

    if (isSubscribed) {
      return next(); // A'zo bo'lsa, davom etadi
    }
  } catch (e) {
    console.error("Kanalga a'zolikni tekshirishda xatolik:", e.message);
    // Agar bot kanalga admin bo'lmasa yoki xato bersa, foydalanuvchini to'sib qo'ymaymiz
    return next();
  }

  // Agar a'zo bo'lmasa:
  const lang = ctx.session?.lang || "uz";
  const locales = {
    uz: require("./locales/uz"),
    ru: require("./locales/ru"),
    en: require("./locales/en"),
  };
  const t = locales[lang];

  // Callback tugmasi bosilganda
  if (ctx.callbackQuery) {
    if (ctx.callbackQuery.data === "check_subscription") {
      ctx.answerCbQuery(t.forceJoinError, { show_alert: true });
    } else {
      ctx.answerCbQuery();
    }
    return; // Boshqa tugmalar ishlamaydi
  }

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.url(t.forceJoinBtn, CHANNEL_LINK)],
    [Markup.button.callback(t.forceJoinCheck, "check_subscription")],
  ]);

  return ctx.reply(t.forceJoinText, keyboard);
});

// ============================================
// HANDLERLAR VA SCENALAR
// ============================================
const registrationWizard = require("./scenes/registrationWizard");
const stage = new Scenes.Stage([registrationWizard]);
bot.use(stage.middleware());

require("./handlers/userMenu")(bot);

const adminPanelModule = require("./handlers/adminPanel");
require("./handlers/adminPanel")(bot);
require("./handlers/adminActions")(
  bot,
  adminPanelModule.adminSearchMode,
  adminPanelModule.handleSearch,
  adminPanelModule.broadcastMode,
  adminPanelModule.addModMode
);

// Cron joblarni ishga tushirish
require("./utils/cronJobs")(bot);

// ============================================
// XATOLIKLARNI USHLASH
// ============================================
bot.catch((err, ctx) => {
  console.error("Xatolik:", err);
  ctx.reply("Xatolik yuz berdi. /start dan qayta boshlang.").catch(() => {});
});

// ============================================
// ISHGA TUSHIRISH (POLLING YOKI WEBHOOK)
// ============================================
const app = express();

const WEBHOOK_URL = process.env.WEBHOOK_URL; // .env dan olinadi
const PORT = process.env.PORT || 3000;

if (WEBHOOK_URL) {
  // --- WEBHOOK REJIMI (Serverga joylashtirilganda ishlaydi) ---
  const secretPath = `/telegraf/${bot.secretPathComponent()}`;

  // Telegramdan keladigan so'rovlarni qabul qilish
  app.use(bot.webhookCallback(secretPath));

  // Serverni ishga tushirish
  app.listen(PORT, async () => {
    console.log(`🌐 Web-server ${PORT}-portda ishga tushdi.`);
    try {
      await bot.telegram.setWebhook(`${WEBHOOK_URL}${secretPath}`);
      console.log(
        `✅ Webhook muvaffaqiyatli o'rnatildi: ${WEBHOOK_URL}${secretPath}`
      );
    } catch (err) {
      console.error("❌ Webhook o'rnatishda xatolik:", err.message);
    }
  });

  // Serverni to'g'ri to'xtatish
  process.once("SIGINT", () => {
    bot.telegram.deleteWebhook().then(() => {
      console.log("Webhook o'chirildi.");
      process.exit(0);
    });
  });
  process.once("SIGTERM", () => {
    bot.telegram.deleteWebhook().then(() => {
      process.exit(0);
    });
  });
} else {
  // --- POLLING REJIMI (Hozir kompyuteringizda ishlab turgan rejim) ---
  bot.launch().then(() => {
    console.log("✅ Bot Polling rejimida ishga tushdi...");
  });

  process.once("SIGINT", () => bot.stop("SIGINT"));
  process.once("SIGTERM", () => bot.stop("SIGTERM"));
}

const { Markup } = require("telegraf");
const db = require("../database");
const { formatApplicationCard } = require("../utils/formatters");

const ADMIN_ID = String(process.env.ADMIN_ID);

// Asosiy adminni tekshirish
function isAdmin(ctx) {
  return String(ctx.from.id) === ADMIN_ID;
}

// YANGI: Moderator yoki Admin ekanligini tekshirish
function isModerator(ctx) {
  if (isAdmin(ctx)) return true;
  const mod = db
    .prepare("SELECT 1 FROM admins WHERE user_id = ?")
    .get(ctx.from.id);
  return !!mod;
}

const msgMode = new Map();
const noteMode = new Map();

module.exports = (
  bot,
  adminSearchMode,
  handleSearch,
  broadcastMode,
  addModMode
) => {
  // ============================================
  // QABUL QILISH (Endi moderatorlar ham qila oladi)
  // ============================================
  bot.action(/^approve_(\d+)$/, async (ctx) => {
    if (!isModerator(ctx)) return ctx.answerCbQuery("Ruxsat yo'q");
    const userId = parseInt(ctx.match[1]);
    const app = db
      .prepare("SELECT * FROM applications WHERE user_id = ?")
      .get(userId);
    if (!app) return ctx.answerCbQuery("Topilmadi");
    if (app.status !== "pending")
      return ctx.answerCbQuery("Allaqachon ko'rib chiqilgan");

    db.prepare(
      "UPDATE applications SET status='approved', reviewed_at=CURRENT_TIMESTAMP WHERE user_id=?"
    ).run(userId);

    try {
      await ctx.telegram.sendMessage(
        userId,
        "🎉 **Tabriklaymiz!**\n\nSiz Speaking Club ga qabul qilindingiz!\nTez orada siz bilan bog'lanamiz.",
        { parse_mode: "Markdown" }
      );
    } catch (e) {
      console.error(e.message);
    }

    await ctx.editMessageReplyMarkup({ inline_keyboard: [] }).catch(() => {});
    await ctx.reply(`✅ Qabul qilindi: ${app.first_name} ${app.last_name}`);
    ctx.answerCbQuery("✅ Qabul qilindi");
  });

  // ============================================
  // RAD ETISH (Endi moderatorlar ham qila oladi)
  // ============================================
  bot.action(/^reject_(\d+)$/, async (ctx) => {
    if (!isModerator(ctx)) return ctx.answerCbQuery("Ruxsat yo'q");
    const userId = parseInt(ctx.match[1]);
    const app = db
      .prepare("SELECT * FROM applications WHERE user_id = ?")
      .get(userId);
    if (!app) return ctx.answerCbQuery("Topilmadi");
    if (app.status !== "pending")
      return ctx.answerCbQuery("Allaqachon ko'rib chiqilgan");

    db.prepare(
      "UPDATE applications SET status='rejected', reviewed_at=CURRENT_TIMESTAMP WHERE user_id=?"
    ).run(userId);

    try {
      await ctx.telegram.sendMessage(
        userId,
        "Afsuski, so'rovingiz rad etildi.\n\nKeyingi safar omad tilaymiz!"
      );
    } catch (e) {
      console.error(e.message);
    }

    await ctx.editMessageReplyMarkup({ inline_keyboard: [] }).catch(() => {});
    await ctx.reply(`❌ Rad etildi: ${app.first_name} ${app.last_name}`);
    ctx.answerCbQuery("❌ Rad etildi");
  });

  // ============================================
  // PROFILNI KO'RISH (Moderatorlar ham ko'ra oladi)
  // ============================================
  bot.action(/^profile_(\d+)$/, async (ctx) => {
    if (!isModerator(ctx)) return ctx.answerCbQuery("Ruxsat yo'q");
    const userId = parseInt(ctx.match[1]);
    const app = db
      .prepare("SELECT * FROM applications WHERE user_id = ?")
      .get(userId);
    if (!app) return ctx.answerCbQuery("Topilmadi");
    ctx.answerCbQuery();
    await ctx.reply(formatApplicationCard(app), {
      parse_mode: "MarkdownV2",
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback("✅ Qabul", `approve_${userId}`),
          Markup.button.callback("❌ Rad", `reject_${userId}`),
        ],
        [Markup.button.callback("💬 Xabar", `msg_${userId}`)],
        [Markup.button.callback("📝 Izoh", `note_${userId}`)],
        [Markup.button.callback("⛔ Bloklash", `block_${userId}`)],
      ]),
    });
  });

  // ============================================
  // XABAR YUBORISH REJIMI
  // ============================================
  bot.action(/^msg_(\d+)$/, (ctx) => {
    if (!isModerator(ctx)) return ctx.answerCbQuery("Ruxsat yo'q");
    const userId = parseInt(ctx.match[1]);
    msgMode.set(ctx.from.id, userId);
    ctx.answerCbQuery();
    ctx.reply(
      `💬 ${userId} ga yuboriladigan xabarni yozing:\n\nBekor qilish uchun /cancel`
    );
  });

  // ============================================
  // IZOH QO'SHISH REJIMI
  // ============================================
  bot.action(/^note_(\d+)$/, (ctx) => {
    if (!isModerator(ctx)) return ctx.answerCbQuery("Ruxsat yo'q");
    const userId = parseInt(ctx.match[1]);
    noteMode.set(ctx.from.id, userId);
    ctx.answerCbQuery();
    ctx.reply(`📝 ${userId} uchun izoh yozing:\n\nBekor qilish uchun /cancel`);
  });

  // ============================================
  // BLOKLASH / OCHISH (Profil ichidan)
  // ============================================
  bot.action(/^block_(\d+)$/, (ctx) => {
    if (!isModerator(ctx)) return ctx.answerCbQuery("Ruxsat yo'q");
    const userId = parseInt(ctx.match[1]);
    const blocked = db
      .prepare("SELECT 1 FROM blocked_users WHERE user_id = ?")
      .get(userId);
    if (blocked) {
      db.prepare("DELETE FROM blocked_users WHERE user_id = ?").run(userId);
      ctx.answerCbQuery("🔓 Blokdan ochildi");
      return ctx.reply(`🔓 ${userId} blokdan ochildi.`);
    } else {
      db.prepare(
        "INSERT OR IGNORE INTO blocked_users (user_id) VALUES (?)"
      ).run(userId);
      ctx.answerCbQuery("⛔ Bloklandi");
      return ctx.reply(`⛔ ${userId} bloklandi.`);
    }
  });

  // ============================================
  // BLOKDAN CHIQARISH (Qora ro'yxatdan)
  // ============================================
  bot.action(/^unblock_(\d+)$/, (ctx) => {
    if (!isModerator(ctx)) return ctx.answerCbQuery("Ruxsat yo'q");
    const userId = parseInt(ctx.match[1]);

    const blocked = db
      .prepare("SELECT 1 FROM blocked_users WHERE user_id = ?")
      .get(userId);
    if (blocked) {
      db.prepare("DELETE FROM blocked_users WHERE user_id = ?").run(userId);
      ctx.answerCbQuery("🔓 Blokdan ochildi");

      // Xabarni yangilaymiz (qora ro'yxatdan o'chib ketishi uchun)
      return ctx
        .editMessageText(
          `🔓 Foydalanuvchi (${userId}) qora ro'yxatdan olib tashlandi.\n\nRo'yxatni yangilash uchun /admin buyrug'ini qayta bosing yoki menyudan qayta kiring.`
        )
        .catch(() => {
          return ctx.reply(
            `🔓 Foydalanuvchi (${userId}) qora ro'yxatdan olib tashlandi.`
          );
        });
    } else {
      ctx.answerCbQuery("Bu foydalanuvchi bloklanmagan.");
      return ctx.reply(`⚠️ ${userId} allaqachon blokdan ochilgan.`);
    }
  });

  // ============================================
  // BEKOR QILISH BUYRUG'I (Faqat asosiy admin uchun)
  // ============================================
  bot.command("cancel", (ctx) => {
    if (!isAdmin(ctx)) return;
    msgMode.delete(ctx.from.id);
    noteMode.delete(ctx.from.id);
    if (broadcastMode) broadcastMode.delete(ctx.from.id);
    if (addModMode) addModMode.delete(ctx.from.id);
    ctx.reply("Bekor qilindi.");
  });

  // ============================================
  // MATN HANDLER
  // ============================================
  bot.on("text", async (ctx, next) => {
    const adminId = ctx.from.id;
    const text = ctx.message.text;

    // Buyruqlarni o'tkazib yuboramiz
    if (text.startsWith("/")) return next();

    // 1. MODERATOR QO'SHISH (Faqat asosiy admin uchun)
    if (isAdmin(ctx) && addModMode && addModMode.has(adminId)) {
      addModMode.delete(adminId);
      const newModId = parseInt(text);

      if (isNaN(newModId))
        return ctx.reply("❌ Xatolik. Iltimos, faqat raqam kiriting.");
      if (newModId === parseInt(ADMIN_ID))
        return ctx.reply(
          "⚠️ Bu sizning ID raqamingiz. Siz allaqachon asosiy adminsiz."
        );

      try {
        db.prepare(
          "INSERT OR IGNORE INTO admins (user_id, added_by) VALUES (?, ?)"
        ).run(newModId, adminId);
        await ctx.reply(`✅ Yangi moderator qo'shildi: ${newModId}`);
        // Yangi moderatorga xabar yuborish
        await ctx.telegram
          .sendMessage(
            newModId,
            "👮 Siz Speaking Club botida moderator etib tayinlandingiz!\n\nEndi /admin buyrug'i orqali panelga kira olasiz."
          )
          .catch(() => {});
      } catch (e) {
        await ctx.reply(`❌ Xatolik yuz berdi: ${e.message}`);
      }
      return;
    }

    // 2. OMMAVIY XABAR (Faqat asosiy admin uchun)
    if (isAdmin(ctx) && broadcastMode && broadcastMode.has(adminId)) {
      const target = broadcastMode.get(adminId);
      broadcastMode.delete(adminId);

      let users;
      if (target === "approved") {
        users = db
          .prepare("SELECT user_id FROM applications WHERE status='approved'")
          .all();
      } else if (target === "pending") {
        users = db
          .prepare("SELECT user_id FROM applications WHERE status='pending'")
          .all();
      } else {
        users = db.prepare("SELECT user_id FROM applications").all();
      }

      if (users.length === 0)
        return ctx.reply("⚠️ Xabar yuborish uchun foydalanuvchilar topilmadi.");

      const statusMsg = await ctx.reply(
        `⏳ Xabar yuborilmoqda... (0/${users.length})`
      );
      let success = 0,
        fail = 0;

      for (let i = 0; i < users.length; i++) {
        try {
          await ctx.telegram.sendMessage(users[i].user_id, text);
          success++;
        } catch (e) {
          fail++;
        }

        if (i % 20 === 0 || i === users.length - 1) {
          await ctx.telegram
            .editMessageText(
              ctx.chat.id,
              statusMsg.message_id,
              null,
              `⏳ Yuborilmoqda... (${i + 1}/${
                users.length
              })\n✅ Muvaffaqiyatli: ${success}\n❌ Xatolik: ${fail}`
            )
            .catch(() => {});
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
      }

      await ctx.telegram
        .editMessageText(
          ctx.chat.id,
          statusMsg.message_id,
          null,
          `✅ **Ommaviy xabar yuborish yakunlandi!**\n\n👥 Jami: ${users.length}\n✅ Yuborildi: ${success}\n❌ Xatolik: ${fail}`,
          { parse_mode: "Markdown" }
        )
        .catch(() => {});

      return;
    }

    // 3. XABAR YUBORISH REJIMI (Moderatorlar ham qila oladi)
    if (msgMode.has(adminId)) {
      const userId = msgMode.get(adminId);
      msgMode.delete(adminId);
      try {
        await ctx.telegram.sendMessage(userId, `📨 Admin xabari:\n\n${text}`);
        return ctx.reply(`✅ Xabar ${userId} ga yuborildi.`);
      } catch (e) {
        return ctx.reply(`❌ Yuborishda xatolik: ${e.message}`);
      }
    }

    // 4. IZOH YOZISH REJIMI (Moderatorlar ham qila oladi)
    if (noteMode.has(adminId)) {
      const userId = noteMode.get(adminId);
      noteMode.delete(adminId);
      try {
        db.prepare(
          "UPDATE applications SET admin_note = ? WHERE user_id = ?"
        ).run(text, userId);
        return ctx.reply(`📝 Izoh saqlandi (${userId}).`);
      } catch (e) {
        return ctx.reply(`❌ Bazaga saqlashda xatolik: ${e.message}`);
      }
    }

    // 5. QIDIRUV (Moderatorlar ham qila oladi)
    if (isModerator(ctx) && adminSearchMode && adminSearchMode.has(adminId)) {
      adminSearchMode.delete(adminId);
      try {
        return await handleSearch(ctx);
      } catch (e) {
        return ctx.reply(`❌ Qidiruvda xatolik: ${e.message}`);
      }
    }

    return next();
  });
};

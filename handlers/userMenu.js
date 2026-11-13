const { Markup } = require("telegraf");
const db = require("../database");
const uz = require("../locales/uz");
const ru = require("../locales/ru");
const en = require("../locales/en");

const locales = { uz, ru, en };

// Foydalanuvchi holatlarini kuzatish
const userMsgMode = new Set();
const editMode = new Map();

module.exports = (bot) => {
  // Tarjimani olish funksiyasi
  function t(ctx, key, vars = {}) {
    const lang = ctx.session?.lang || "uz";
    let text = locales[lang][key] || locales["uz"][key] || key;
    for (const [k, v] of Object.entries(vars)) {
      text = text.replace(new RegExp(`{${k}}`, "g"), v);
    }
    return text;
  }

  // ============================================
  // TILNI TANLASH MENYUSI
  // ============================================
  async function showLanguageMenu(ctx, edit = false) {
    const msg =
      "🇺🇿 Iltimos, tilni tanlang\n🇷🇺 Пожалуйста, выберите язык\n🇬🇧 Please choose language";
    const opts = {
      ...Markup.inlineKeyboard([
        [Markup.button.callback("🇺🇿 O'zbekcha", "lang_uz")],
        [Markup.button.callback("🇷🇺 Русский", "lang_ru")],
        [Markup.button.callback("🇬🇧 English", "lang_en")],
      ]),
    };
    if (edit && ctx.callbackQuery)
      return ctx.editMessageText(msg, opts).catch(() => ctx.reply(msg, opts));
    return ctx.reply(msg, opts);
  }

  bot.action(/^lang_(\w+)$/, async (ctx) => {
    ctx.answerCbQuery();
    const lang = ctx.match[1];
    if (!["uz", "ru", "en"].includes(lang)) return;

    ctx.session.lang = lang;
    const userId = ctx.from.id;
    const app = db
      .prepare("SELECT user_id FROM applications WHERE user_id = ?")
      .get(userId);
    if (app) {
      db.prepare("UPDATE applications SET language = ? WHERE user_id = ?").run(
        lang,
        userId
      );
    }

    // Til o'zgargandan keyin menyuni yangilaymiz
    await ctx.editMessageText(locales[lang].langSet);
    await ctx.reply(t(ctx, "welcome"), userKeyboard(ctx));
    return showMainMenu(ctx);
  });

  // ============================================
  // FOYDALANUVCHI KLAVIATURASI
  // ============================================
  function userKeyboard(ctx) {
    return Markup.keyboard([
      [t(ctx, "btnRegister"), t(ctx, "btnStatus")],
      [t(ctx, "btnEdit"), t(ctx, "btnContact")],
      [t(ctx, "btnHelp"), t(ctx, "btnLang")], // Yangi til tugmasi qo'shildi
    ]).resize();
  }

  // ============================================
  // ASOSIY MENYU
  // ============================================
  async function showMainMenu(ctx, edit = false) {
    const userId = ctx.from.id;
    const blocked = db
      .prepare("SELECT 1 FROM blocked_users WHERE user_id = ?")
      .get(userId);
    if (blocked) return ctx.reply(t(ctx, "blocked"));

    const app = db
      .prepare("SELECT status, created_at FROM applications WHERE user_id = ?")
      .get(userId);

    let statusLine = "";
    let buttons = [];

    if (!app) {
      statusLine = t(ctx, "notRegistered");
      buttons = [
        [Markup.button.callback(t(ctx, "btnRegister"), "start_registration")],
        [Markup.button.callback(t(ctx, "btnContact"), "contact_admin")],
      ];
    } else if (app.status === "pending") {
      statusLine = t(ctx, "pending", { date: app.created_at });
      buttons = [
        [Markup.button.callback(t(ctx, "btnCheckStatus"), "check_status")],
        [Markup.button.callback(t(ctx, "btnEditData"), "edit_menu")],
        [Markup.button.callback(t(ctx, "btnContact"), "contact_admin")],
      ];
    } else if (app.status === "approved") {
      statusLine = t(ctx, "approved");
      buttons = [
        [Markup.button.callback(t(ctx, "btnCheckStatus"), "check_status")],
        [Markup.button.callback(t(ctx, "btnContact"), "contact_admin")],
      ];
    } else {
      statusLine = t(ctx, "rejected");
      buttons = [
        [Markup.button.callback(t(ctx, "btnRegister"), "start_registration")],
        [Markup.button.callback(t(ctx, "btnContact"), "contact_admin")],
      ];
    }

    const msg = t(ctx, "startMsg", {
      name: ctx.from.first_name,
      status: statusLine,
    });
    const opts = { parse_mode: "Markdown", ...Markup.inlineKeyboard(buttons) };
    if (edit && ctx.callbackQuery)
      return ctx.editMessageText(msg, opts).catch(() => ctx.reply(msg, opts));
    return ctx.reply(msg, opts);
  }

  // ============================================
  // START VA LANG BUYRUG'I
  // ============================================
  bot.start((ctx) => {
    if (!ctx.session.lang) return showLanguageMenu(ctx);
    ctx.reply(t(ctx, "welcome"), userKeyboard(ctx));
    return showMainMenu(ctx);
  });

  bot.command("lang", (ctx) => showLanguageMenu(ctx));

  // ============================================
  // REPLY TUGMALARI
  // ============================================
  // Tilni o'zgartirish tugmasi bosilganda
  bot.hears(
    [locales.uz.btnLang, locales.ru.btnLang, locales.en.btnLang],
    (ctx) => {
      showLanguageMenu(ctx);
    }
  );

  bot.hears(
    [locales.uz.btnRegister, locales.ru.btnRegister, locales.en.btnRegister],
    (ctx) => {
      const app = db
        .prepare("SELECT status FROM applications WHERE user_id = ?")
        .get(ctx.from.id);
      if (app && app.status === "pending")
        return ctx.reply(t(ctx, "waitReview"));
      if (app && app.status === "approved")
        return ctx.reply(t(ctx, "alreadyMember"));
      return ctx.scene.enter("registration-wizard");
    }
  );

  bot.hears(
    [locales.uz.btnStatus, locales.ru.btnStatus, locales.en.btnStatus],
    (ctx) => {
      const app = db
        .prepare("SELECT * FROM applications WHERE user_id = ?")
        .get(ctx.from.id);
      if (!app) return ctx.reply(t(ctx, "notRegistered"));

      const statusName = t(
        ctx,
        app.status === "pending"
          ? "statusPending"
          : app.status === "approved"
          ? "statusApproved"
          : "statusRejected"
      );
      const msg = t(ctx, "statusMsg", {
        name: `${app.first_name} ${app.last_name}`,
        phone: app.phone,
        grade: app.grade,
        ielts: app.ielts,
        status: statusName,
        date: app.created_at,
      });
      ctx.reply(msg, { parse_mode: "Markdown" });
    }
  );

  bot.hears(
    [locales.uz.btnEdit, locales.ru.btnEdit, locales.en.btnEdit],
    (ctx) => {
      const app = db
        .prepare("SELECT status FROM applications WHERE user_id = ?")
        .get(ctx.from.id);
      if (!app) return ctx.reply(t(ctx, "notRegistered"));
      if (app.status !== "pending") return ctx.reply(t(ctx, "notForEdit"));
      showEditMenu(ctx);
    }
  );

  bot.hears(
    [locales.uz.btnContact, locales.ru.btnContact, locales.en.btnContact],
    (ctx) => {
      userMsgMode.add(ctx.from.id);
      ctx.reply(t(ctx, "msgToAdmin") + "\n\n/cancel");
    }
  );

  bot.hears(
    [locales.uz.btnHelp, locales.ru.btnHelp, locales.en.btnHelp],
    (ctx) => {
      ctx.reply(t(ctx, "helpText"), { parse_mode: "Markdown" });
    }
  );

  // ============================================
  // TAHRIRLASH MENYUSI
  // ============================================
  async function showEditMenu(ctx, edit = false) {
    const msg = t(ctx, "editMenu");
    const opts = {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [Markup.button.callback(t(ctx, "editName"), "edit_name")],
        [Markup.button.callback(t(ctx, "editPhone"), "edit_phone")],
        [Markup.button.callback(t(ctx, "editBio"), "edit_bio")],
        [Markup.button.callback(t(ctx, "editGrade"), "edit_grade")],
        [Markup.button.callback(t(ctx, "editIelts"), "edit_ielts")],
        [Markup.button.callback(t(ctx, "editReason"), "edit_reason")],
        [Markup.button.callback(t(ctx, "editWeak"), "edit_weak")],
        [Markup.button.callback(t(ctx, "back"), "back_to_main")],
      ]),
    };
    if (edit && ctx.callbackQuery)
      return ctx.editMessageText(msg, opts).catch(() => ctx.reply(msg, opts));
    return ctx.reply(msg, opts);
  }

  // ============================================
  // INLINE CALLBACKS
  // ============================================
  bot.action("start_registration", (ctx) => {
    ctx.answerCbQuery();
    const app = db
      .prepare("SELECT status FROM applications WHERE user_id = ?")
      .get(ctx.from.id);
    if (app && app.status === "pending") return ctx.reply(t(ctx, "waitReview"));
    if (app && app.status === "approved")
      return ctx.reply(t(ctx, "alreadyMember"));
    return ctx.scene.enter("registration-wizard");
  });

  bot.action("check_status", (ctx) => {
    ctx.answerCbQuery();
    const app = db
      .prepare("SELECT * FROM applications WHERE user_id = ?")
      .get(ctx.from.id);
    if (!app) return ctx.reply(t(ctx, "notRegistered"));

    const statusName = t(
      ctx,
      app.status === "pending"
        ? "statusPending"
        : app.status === "approved"
        ? "statusApproved"
        : "statusRejected"
    );
    const msg = t(ctx, "statusMsg", {
      name: `${app.first_name} ${app.last_name}`,
      phone: app.phone,
      grade: app.grade,
      ielts: app.ielts,
      status: statusName,
      date: app.created_at,
    });
    ctx.reply(msg, { parse_mode: "Markdown" });
  });

  bot.action("contact_admin", (ctx) => {
    ctx.answerCbQuery();
    userMsgMode.add(ctx.from.id);
    ctx.reply(t(ctx, "msgToAdmin") + "\n\n/cancel");
  });

  bot.action("edit_menu", (ctx) => {
    ctx.answerCbQuery();
    const app = db
      .prepare("SELECT status FROM applications WHERE user_id = ?")
      .get(ctx.from.id);
    if (!app) return ctx.reply(t(ctx, "notRegistered"));
    if (app.status !== "pending") return ctx.reply(t(ctx, "notForEdit"));
    return showEditMenu(ctx, true);
  });

  bot.action("back_to_main", (ctx) => {
    ctx.answerCbQuery();
    return showMainMenu(ctx, true);
  });

  bot.action(/^edit_(\w+)$/, (ctx) => {
    ctx.answerCbQuery();
    const field = ctx.match[1];
    const userId = ctx.from.id;

    const app = db
      .prepare("SELECT status FROM applications WHERE user_id = ?")
      .get(userId);
    if (!app || app.status !== "pending")
      return ctx.reply(t(ctx, "notForEdit"));

    editMode.set(userId, field);

    const prompts = {
      name: t(ctx, "promptName"),
      phone: t(ctx, "promptPhone"),
      bio: t(ctx, "promptBio"),
      grade: t(ctx, "promptGrade"),
      ielts: t(ctx, "promptIelts"),
      reason: t(ctx, "promptReason"),
      weak: t(ctx, "promptWeak"),
    };

    let keyboard = Markup.removeKeyboard();
    if (field === "grade") {
      keyboard = Markup.keyboard([["9-sinf", "10-sinf", "11-sinf"]])
        .oneTime()
        .resize();
    } else if (field === "ielts") {
      keyboard = Markup.keyboard([
        ["Yo'q", "5.0", "5.5"],
        ["6.0", "6.5", "7.0+"],
      ])
        .oneTime()
        .resize();
    } else if (field === "weak") {
      keyboard = Markup.keyboard([
        ["Talaffuz (Pronunciation)"],
        ["Grammatika (Grammar)"],
        ["So'z boyligi (Vocabulary)"],
        ["O'z fikrini ifodalash (Fluency)"],
        ["Barchasi"],
      ])
        .oneTime()
        .resize();
    }

    ctx.reply(`${prompts[field]}\n\n/cancel`, keyboard);
  });

  // ============================================
  // MATN HANDLER
  // ============================================
  bot.command("cancel", (ctx) => {
    userMsgMode.delete(ctx.from.id);
    editMode.delete(ctx.from.id);
    ctx.reply(t(ctx, "cancelText"), userKeyboard(ctx));
  });

  bot.on("text", async (ctx, next) => {
    const userId = ctx.from.id;
    const text = ctx.message.text;
    if (text.startsWith("/")) return next();

    if (userMsgMode.has(userId)) {
      userMsgMode.delete(userId);
      try {
        const app = db
          .prepare(
            "SELECT first_name, last_name, username FROM applications WHERE user_id = ?"
          )
          .get(userId);
        const name = app
          ? `${app.first_name} ${app.last_name}`
          : ctx.from.first_name;
        const username = ctx.from.username ? `@${ctx.from.username}` : "yoq";

        const adminMsg = `📩 **FOYDALANUVCHIDAN XABAR**\n\n👤 **Kimdan:** ${name}\n🆔 **ID:** \`${userId}\`\n🔗 **Username:** ${username}\n\n💬 **Xabar:**\n${text}`;

        await ctx.telegram.sendMessage(process.env.ADMIN_ID, adminMsg, {
          parse_mode: "Markdown",
          ...Markup.inlineKeyboard([
            [Markup.button.callback("↩️ Javob yozish", `msg_${userId}`)],
          ]),
        });

        return ctx.reply(t(ctx, "msgSent"), userKeyboard(ctx));
      } catch (e) {
        return ctx.reply("❌ Error", userKeyboard(ctx));
      }
    }

    if (editMode.has(userId)) {
      const field = editMode.get(userId);
      editMode.delete(userId);

      if (field === "name") {
        const parts = text.split(" ");
        db.prepare(
          "UPDATE applications SET first_name = ?, last_name = ? WHERE user_id = ?"
        ).run(parts[0] || "", parts.slice(1).join(" ") || "", userId);
      } else if (field === "phone") {
        db.prepare("UPDATE applications SET phone = ? WHERE user_id = ?").run(
          text,
          userId
        );
      } else if (field === "bio") {
        db.prepare("UPDATE applications SET bio = ? WHERE user_id = ?").run(
          text,
          userId
        );
      } else if (field === "grade") {
        db.prepare("UPDATE applications SET grade = ? WHERE user_id = ?").run(
          text,
          userId
        );
      } else if (field === "ielts") {
        db.prepare("UPDATE applications SET ielts = ? WHERE user_id = ?").run(
          text,
          userId
        );
      } else if (field === "reason") {
        db.prepare("UPDATE applications SET reason = ? WHERE user_id = ?").run(
          text,
          userId
        );
      } else if (field === "weak") {
        db.prepare(
          "UPDATE applications SET weak_areas = ? WHERE user_id = ?"
        ).run(text, userId);
      }

      await ctx.reply(t(ctx, "editSuccess"), userKeyboard(ctx));
      return showMainMenu(ctx);
    }

    return next();
  });
};

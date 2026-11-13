const { Markup } = require("telegraf");
const ExcelJS = require("exceljs");
const db = require("../database");
const {
  formatApplicationShort,
  formatApplicationCard,
  STATUS_TEXT,
} = require("../utils/formatters");

const ADMIN_ID = String(process.env.ADMIN_ID);
const PAGE_SIZE = 5;
const QuickChart = require("quickchart-js"); // Yangi qo'shildi
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

// Pastki klaviatura
function adminKeyboard() {
  return Markup.keyboard([
    ["📋 Kutilayotganlar", "📊 Statistika"],
    ["📜 Barcha so'rovlar", "👥 Foydalanuvchilar"],
    ["📢 Ommaviy xabar", "🔍 Qidiruv"],
    ["🚫 Qora ro'yxat", "📤 Eksport"],
    ["⚙️ Sozlamalar", "🔙 Foydalanuvchi rejimi"],
  ]).resize();
}

// Asosiy inline menyu
function mainMenu() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("📋 Kutilayotganlar", "menu_pending")],
    [Markup.button.callback("📊 Statistika", "menu_stats")],
    [Markup.button.callback("📜 Barcha so'rovlar", "menu_all_0")],
    [Markup.button.callback("👥 Foydalanuvchilar", "menu_users_0")],
    [Markup.button.callback("📢 Ommaviy xabar yuborish", "menu_broadcast")],
    [Markup.button.callback("🔍 Qidiruv", "menu_search")],
    [Markup.button.callback("🚫 Qora ro'yxat", "menu_blacklist")],
    [Markup.button.callback("📤 Eksport", "menu_export")],
    [Markup.button.callback("⚙️ Sozlamalar", "menu_settings")],
  ]);
}

function showMain(ctx, edit = false) {
  const msg = `
🛠️ **ADMIN PANEL**

Xush kelibsiz, **${ctx.from.first_name}**!

Kerakli bo'limni tanlang:
  `;
  const opts = { parse_mode: "Markdown", ...mainMenu() };
  if (edit && ctx.callbackQuery) {
    return ctx.editMessageText(msg, opts).catch(() => ctx.reply(msg, opts));
  }
  return ctx.reply(msg, opts);
}

module.exports = (bot) => {
  // ============================================
  // KIRISH
  // ============================================
  bot.command("admin", (ctx) => {
    if (!isModerator(ctx))
      return ctx.reply("⛔ Bu buyruq faqat admin va moderatorlar uchun.");
    ctx.reply(
      "Admin panel ochildi. Pastdagi tugmalardan foydalaning.",
      adminKeyboard()
    );
    return showMain(ctx);
  });

  // ============================================
  // REPLY KEYBOARD TUGMALARI
  // ============================================
  bot.hears("📋 Kutilayotganlar", (ctx) => {
    if (isModerator(ctx)) showPending(ctx);
  });
  bot.hears("📊 Statistika", (ctx) => {
    if (isModerator(ctx)) showStats(ctx);
  });
  bot.hears("📜 Barcha so'rovlar", (ctx) => {
    if (isModerator(ctx)) showAll(ctx, 0);
  });
  bot.hears("👥 Foydalanuvchilar", (ctx) => {
    if (isModerator(ctx)) showUsers(ctx, 0);
  });
  bot.hears("🔍 Qidiruv", (ctx) => {
    if (isModerator(ctx)) askSearch(ctx);
  });
  bot.hears("🚫 Qora ro'yxat", (ctx) => {
    if (isModerator(ctx)) showBlacklist(ctx, 0);
  });

  // Faqat ASOSIY ADMIN uchun (Moderatorlar qila olmaydi)
  bot.hears("📢 Ommaviy xabar", (ctx) => {
    if (isAdmin(ctx)) showBroadcastMenu(ctx);
  });
  bot.hears("📤 Eksport", (ctx) => {
    if (isAdmin(ctx)) showExport(ctx);
  });
  bot.hears("⚙️ Sozlamalar", (ctx) => {
    if (isAdmin(ctx)) showSettings(ctx);
  });

  bot.hears("🔙 Foydalanuvchi rejimi", (ctx) => {
    if (!isModerator(ctx)) return;
    ctx.reply("Foydalanuvchi rejimiga qaytdingiz.", Markup.removeKeyboard());
  });

  // ============================================
  // INLINE MENYU CALLBACKLARI
  // ============================================
  bot.action("menu_main", (ctx) => {
    ctx.answerCbQuery();
    return showMain(ctx, true);
  });
  bot.action("menu_pending", (ctx) => {
    ctx.answerCbQuery();
    return showPending(ctx, true);
  });
  bot.action("menu_stats", (ctx) => {
    ctx.answerCbQuery();
    return showStats(ctx, true);
  });
  bot.action("menu_search", (ctx) => {
    ctx.answerCbQuery();
    return askSearch(ctx, true);
  });
  bot.action("menu_blacklist", (ctx) => {
    ctx.answerCbQuery();
    return showBlacklist(ctx, 0, true);
  });

  // Faqat ADMIN uchun (Inline)
  bot.action("menu_settings", (ctx) => {
    ctx.answerCbQuery();
    return showSettings(ctx, true);
  });
  bot.action("menu_export", (ctx) => {
    ctx.answerCbQuery();
    return showExport(ctx, true);
  });
  bot.action("menu_broadcast", (ctx) => {
    ctx.answerCbQuery();
    return showBroadcastMenu(ctx, true);
  });

  // Sahifalash
  bot.action(/^menu_all_(\d+)$/, (ctx) => {
    ctx.answerCbQuery();
    return showAll(ctx, parseInt(ctx.match[1]), true);
  });
  bot.action(/^menu_users_(\d+)$/, (ctx) => {
    ctx.answerCbQuery();
    return showUsers(ctx, parseInt(ctx.match[1]), true);
  });
  bot.action(/^menu_blacklist_(\d+)$/, (ctx) => {
    ctx.answerCbQuery();
    return showBlacklist(ctx, parseInt(ctx.match[1]), true);
  });

  // Filtr
  bot.action(/^filter_(\w+)_0$/, (ctx) => {
    ctx.answerCbQuery();
    return showAll(ctx, 0, true, ctx.match[1]);
  });

  // Ommaviy xabar yuborish turini tanlash
  bot.action(/^broadcast_(\w+)$/, (ctx) => {
    if (!isAdmin(ctx)) return ctx.answerCbQuery("Ruxsat yo'q");
    ctx.answerCbQuery();
    const target = ctx.match[1];

    module.exports.broadcastMode.set(ctx.from.id, target);

    let targetName =
      target === "all"
        ? "Barcha foydalanuvchilarga"
        : target === "approved"
        ? "Qabul qilinganlarga"
        : "Kutilayotganlarga";

    return ctx.reply(
      `📢 ${targetName} yuboriladigan xabarni yozing:\n\nBekor qilish uchun /cancel`
    );
  });

  // ============================================
  // QORA RO'YXAT (BLACKLIST)
  // ============================================
  async function showBlacklist(ctx, page = 0, edit = false) {
    const total = db
      .prepare(
        `
      SELECT COUNT(*) c FROM blocked_users b
      JOIN applications a ON b.user_id = a.user_id
    `
      )
      .get().c;

    const users = db
      .prepare(
        `
      SELECT a.* FROM applications a
      JOIN blocked_users b ON a.user_id = b.user_id
      ORDER BY b.blocked_at DESC LIMIT ? OFFSET ?
    `
      )
      .all(PAGE_SIZE, page * PAGE_SIZE);

    const totalPages = Math.ceil(total / PAGE_SIZE) || 1;

    if (users.length === 0) {
      const msg = "✅ Qora ro'yxat bo'sh. Bloklangan foydalanuvchilar yo'q.";
      const opts = {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [Markup.button.callback("🔙 Orqaga", "menu_main")],
        ]),
      };
      if (edit && ctx.callbackQuery)
        return ctx.editMessageText(msg, opts).catch(() => ctx.reply(msg, opts));
      return ctx.reply(msg, opts);
    }

    let msg = `🚫 *Qora ro'yxat* (${
      page + 1
    }/${totalPages}) — Jami: ${total}\n\nBlokdan chiqarish uchun foydalanuvchini tanlang:`;

    const userButtons = users.map((u, i) => {
      const index = page * PAGE_SIZE + i + 1;
      const btnText = `${index}. ❌ ${u.first_name} ${u.last_name} (${u.phone})`;
      return [Markup.button.callback(btnText, `unblock_${u.user_id}`)];
    });

    const navRow = [];
    if (page > 0)
      navRow.push(
        Markup.button.callback("⬅️ Oldingi", `menu_blacklist_${page - 1}`)
      );
    if (page < totalPages - 1)
      navRow.push(
        Markup.button.callback("Keyingi ➡️", `menu_blacklist_${page + 1}`)
      );

    const keyboard = [...userButtons];
    if (navRow.length) keyboard.push(navRow);
    keyboard.push([Markup.button.callback("🔙 Orqaga", "menu_main")]);

    const opts = { parse_mode: "Markdown", ...Markup.inlineKeyboard(keyboard) };

    if (edit && ctx.callbackQuery) {
      return ctx.editMessageText(msg, opts).catch(() => ctx.reply(msg, opts));
    }
    return ctx.reply(msg, opts);
  }

  // ============================================
  // KUTILAYOTGANLAR
  // ============================================
  async function showPending(ctx, edit = false) {
    const apps = db
      .prepare(
        "SELECT * FROM applications WHERE status = 'pending' ORDER BY created_at ASC"
      )
      .all();
    const backBtn = [[Markup.button.callback("🔙 Orqaga", "menu_main")]];

    if (apps.length === 0) {
      const msg = "✅ **Kutilayotgan so'rovlar yo'q.**";
      const opts = {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard(backBtn),
      };
      if (edit && ctx.callbackQuery)
        return ctx.editMessageText(msg, opts).catch(() => ctx.reply(msg, opts));
      return ctx.reply(msg, opts);
    }

    if (edit && ctx.callbackQuery) {
      await ctx
        .editMessageText(`📋 **Kutilayotgan so'rovlar: ${apps.length} ta**`, {
          parse_mode: "Markdown",
          ...Markup.inlineKeyboard(backBtn),
        })
        .catch(() => {});
    } else {
      await ctx.reply(`📋 **Kutilayotgan so'rovlar: ${apps.length} ta**`, {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard(backBtn),
      });
    }

    for (const a of apps) {
      const card = formatApplicationCard(a);
      await ctx.reply(card, {
        parse_mode: "MarkdownV2",
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback("✅ Qabul", `approve_${a.user_id}`),
            Markup.button.callback("❌ Rad", `reject_${a.user_id}`),
          ],
          [Markup.button.callback("💬 Xabar yuborish", `msg_${a.user_id}`)],
          [Markup.button.callback("📝 Izoh qo'shish", `note_${a.user_id}`)],
        ]),
      });
    }
  }

  // ============================================
  // STATISTIKA (Grafik bilan)
  // ============================================
  async function showStats(ctx, edit = false) {
    const total = db.prepare("SELECT COUNT(*) c FROM applications").get().c;
    const pending = db
      .prepare("SELECT COUNT(*) c FROM applications WHERE status='pending'")
      .get().c;
    const approved = db
      .prepare("SELECT COUNT(*) c FROM applications WHERE status='approved'")
      .get().c;
    const rejected = db
      .prepare("SELECT COUNT(*) c FROM applications WHERE status='rejected'")
      .get().c;
    const blocked = db.prepare("SELECT COUNT(*) c FROM blocked_users").get().c;

    const grades = db
      .prepare(
        "SELECT grade, COUNT(*) c FROM applications GROUP BY grade ORDER BY grade"
      )
      .all();
    const ielts = db
      .prepare(
        "SELECT ielts, COUNT(*) c FROM applications GROUP BY ielts ORDER BY c DESC"
      )
      .all();

    const today = db
      .prepare(
        "SELECT COUNT(*) c FROM applications WHERE date(created_at) = date('now')"
      )
      .get().c;
    const week = db
      .prepare(
        "SELECT COUNT(*) c FROM applications WHERE created_at >= datetime('now', '-7 days')"
      )
      .get().c;

    const gradeText =
      grades.map((g) => `  • ${g.grade}: **${g.c}**`).join("\n") || "  —";
    const ieltsText =
      ielts.map((i) => `  • ${i.ielts}: **${i.c}**`).join("\n") || "  —";

    // Matnli xabar
    const msg = `
📊 **STATISTIKA (Matn)**

━━━━━━━━━━━━━━━━━━━━
📌 **Umumiy:** ${total}
⏳ **Kutilmoqda:** ${pending}
✅ **Qabul:** ${approved}
❌ **Rad:** ${rejected}
⛔ **Bloklangan:** ${blocked}
━━━━━━━━━━━━━━━━━━━━
📅 **Bugun:** ${today}
📆 **Oxirgi 7 kun:** ${week}
━━━━━━━━━━━━━━━━━━━━
📚 **Sinflar:**
${gradeText}

📝 **IELTS:**
${ieltsText}
━━━━━━━━━━━━━━━━━━━━
    `;

    const opts = {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [Markup.button.callback("📈 Grafikni ko'rish", "stats_chart")],
        [Markup.button.callback("🔄 Yangilash", "menu_stats")],
        [Markup.button.callback("🔙 Orqaga", "menu_main")],
      ]),
    };

    if (edit && ctx.callbackQuery) {
      await ctx.editMessageText(msg, opts).catch(() => ctx.reply(msg, opts));
    } else {
      await ctx.reply(msg, opts);
    }
  }

  // ============================================
  // STATISTIKA GRAFIK (Rasm)
  // ============================================
  bot.action("stats_chart", async (ctx) => {
    if (!isModerator(ctx)) return ctx.answerCbQuery("Ruxsat yo'q");

    await ctx.answerCbQuery("Grafik tayyorlanmoqda...");

    const loadingMsg = await ctx.reply(
      "⏳ Grafik yaratilmoqda, iltimos kuting..."
    );

    try {
      // Oxirgi 7 kunlik ma'lumotlarni yig'amiz
      const last7Days = db
        .prepare(
          `
        SELECT date(created_at) as day, COUNT(*) as count 
        FROM applications 
        WHERE created_at >= date('now', '-6 days') 
        GROUP BY date(created_at) 
        ORDER BY day ASC
      `
        )
        .all();

      const labels = [];
      const data = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split("T")[0]; // YYYY-MM-DD
        const displayStr = `${d.getDate()}.${String(d.getMonth() + 1).padStart(
          2,
          "0"
        )}`; // DD.MM
        labels.push(displayStr);

        const found = last7Days.find((x) => x.day === dateStr);
        data.push(found ? found.count : 0);
      }

      // QuickChart obyektini yaratamiz
      const myChart = new QuickChart();
      myChart.setConfig({
        type: "bar",
        data: {
          labels: labels,
          datasets: [
            {
              label: "Kunlik ro'yxatdan o'tishlar",
              data: data,
              backgroundColor: "rgba(54, 162, 235, 0.8)",
              borderColor: "rgba(54, 162, 235, 1)",
              borderWidth: 1,
              borderRadius: 5,
            },
          ],
        },
        options: {
          plugins: {
            title: {
              display: true,
              text: "Oxirgi 7 kunlik dinamika",
              font: { size: 18 },
            },
            legend: { display: false },
          },
          scales: {
            y: {
              beginAtZero: true,
              ticks: { stepSize: 1 },
            },
          },
        },
      });

      myChart.setWidth(800).setHeight(400).setBackgroundColor("#ffffff");
      const imageUrl = myChart.getUrl();

      // Loading xabarini o'chiramiz
      await ctx.telegram
        .deleteMessage(ctx.chat.id, loadingMsg.message_id)
        .catch(() => {});

      // Rasmni URL orqali yuboramiz
      await ctx.replyWithPhoto(imageUrl, {
        caption: "📈 **Oxirgi 7 kunlik ro'yxatdan o'tishlar**",
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [Markup.button.callback("🔄 Yangilash", "stats_chart")],
          [Markup.button.callback("🔙 Orqaga", "menu_stats")],
        ]),
      });
    } catch (e) {
      console.error("Grafik yaratishda xatolik:", e);
      await ctx.telegram
        .deleteMessage(ctx.chat.id, loadingMsg.message_id)
        .catch(() => {});
      await ctx.reply(
        "❌ Grafik yaratishda xatolik yuz berdi. Iltimos, keyinroq qayta urinib ko'ring."
      );
    }
  });
  // ============================================
  // BARCHA SO'ROVLAR
  // ============================================
  async function showAll(ctx, page = 0, edit = false, filter = "all") {
    const where = filter === "all" ? "" : `WHERE status = '${filter}'`;
    const total = db
      .prepare(`SELECT COUNT(*) c FROM applications ${where}`)
      .get().c;
    const apps = db
      .prepare(
        `SELECT * FROM applications ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`
      )
      .all(PAGE_SIZE, page * PAGE_SIZE);

    const totalPages = Math.ceil(total / PAGE_SIZE) || 1;

    if (apps.length === 0) {
      const msg = "📭 So'rovlar topilmadi.";
      const opts = {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [Markup.button.callback("🔙 Orqaga", "menu_main")],
        ]),
      };
      if (edit && ctx.callbackQuery)
        return ctx.editMessageText(msg, opts).catch(() => ctx.reply(msg, opts));
      return ctx.reply(msg, opts);
    }

    let msg = `📜 **So'rovlar** (${
      page + 1
    }/${totalPages}) — Jami: ${total}\n\nKerakli foydalanuvchini tanlang:`;

    const userButtons = apps.map((a, i) => {
      const index = page * PAGE_SIZE + i + 1;
      return [
        Markup.button.callback(
          formatApplicationShort(a, index),
          `profile_${a.user_id}`
        ),
      ];
    });

    const navRow = [];
    if (page > 0)
      navRow.push(Markup.button.callback("⬅️ Oldingi", `menu_all_${page - 1}`));
    if (page < totalPages - 1)
      navRow.push(Markup.button.callback("Keyingi ➡️", `menu_all_${page + 1}`));

    const filterRow = [
      Markup.button.callback(
        filter === "all" ? "• Hammasi •" : "Hammasi",
        "filter_all_0"
      ),
      Markup.button.callback(
        filter === "pending" ? "• ⏳ •" : "⏳",
        "filter_pending_0"
      ),
      Markup.button.callback(
        filter === "approved" ? "• ✅ •" : "✅",
        "filter_approved_0"
      ),
      Markup.button.callback(
        filter === "rejected" ? "• ❌ •" : "❌",
        "filter_rejected_0"
      ),
    ];

    const keyboard = [...userButtons, filterRow];
    if (navRow.length) keyboard.push(navRow);
    keyboard.push([Markup.button.callback("🔙 Orqaga", "menu_main")]);

    const opts = { parse_mode: "Markdown", ...Markup.inlineKeyboard(keyboard) };
    if (edit && ctx.callbackQuery)
      return ctx.editMessageText(msg, opts).catch(() => ctx.reply(msg, opts));
    return ctx.reply(msg, opts);
  }

  // ============================================
  // FOYDALANUVCHILAR
  // ============================================
  async function showUsers(ctx, page = 0, edit = false) {
    const total = db.prepare("SELECT COUNT(*) c FROM applications").get().c;
    const users = db
      .prepare(
        "SELECT * FROM applications ORDER BY created_at DESC LIMIT ? OFFSET ?"
      )
      .all(PAGE_SIZE, page * PAGE_SIZE);
    const totalPages = Math.ceil(total / PAGE_SIZE) || 1;

    if (users.length === 0) {
      const msg = "Foydalanuvchilar yo'q.";
      const opts = {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [Markup.button.callback("🔙 Orqaga", "menu_main")],
        ]),
      };
      if (edit && ctx.callbackQuery)
        return ctx.editMessageText(msg, opts).catch(() => ctx.reply(msg, opts));
      return ctx.reply(msg, opts);
    }

    let msg = `👥 *Foydalanuvchilar* (${
      page + 1
    }/${totalPages}) — Jami: ${total}\n\nKerakli foydalanuvchini tanlang:`;

    const userButtons = users.map((u, i) => {
      const index = page * PAGE_SIZE + i + 1;
      return [
        Markup.button.callback(
          formatApplicationShort(u, index),
          `profile_${u.user_id}`
        ),
      ];
    });

    const navRow = [];
    if (page > 0)
      navRow.push(
        Markup.button.callback("⬅️ Oldingi", `menu_users_${page - 1}`)
      );
    if (page < totalPages - 1)
      navRow.push(
        Markup.button.callback("Keyingi ➡️", `menu_users_${page + 1}`)
      );

    const keyboard = [...userButtons];
    if (navRow.length) keyboard.push(navRow);
    keyboard.push([Markup.button.callback("🔙 Orqaga", "menu_main")]);

    const opts = { parse_mode: "Markdown", ...Markup.inlineKeyboard(keyboard) };

    if (edit && ctx.callbackQuery) {
      return ctx.editMessageText(msg, opts).catch(() => ctx.reply(msg, opts));
    }
    return ctx.reply(msg, opts);
  }

  // ============================================
  // OMMAVIY XABAR MENYUSI
  // ============================================
  async function showBroadcastMenu(ctx, edit = false) {
    const total = db.prepare("SELECT COUNT(*) c FROM applications").get().c;
    const approved = db
      .prepare("SELECT COUNT(*) c FROM applications WHERE status='approved'")
      .get().c;
    const pending = db
      .prepare("SELECT COUNT(*) c FROM applications WHERE status='pending'")
      .get().c;

    const msg = `
📢 **OMMAVIY XABAR YUBORISH**

Kimga xabar yubormoqchisiz?
(Bu amalni ortga qaytarib bo'lmaydi)

👥 Barchasi: **${total}** ta
✅ Qabul qilinganlar: **${approved}** ta
⏳ Kutilayotganlar: **${pending}** ta
    `;

    const opts = {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [Markup.button.callback("👥 Barchaga yuborish", "broadcast_all")],
        [
          Markup.button.callback(
            "✅ Qabul qilinganlarga",
            "broadcast_approved"
          ),
        ],
        [Markup.button.callback("⏳ Kutilayotganlarga", "broadcast_pending")],
        [Markup.button.callback("🔙 Orqaga", "menu_main")],
      ]),
    };

    if (edit && ctx.callbackQuery)
      return ctx.editMessageText(msg, opts).catch(() => ctx.reply(msg, opts));
    return ctx.reply(msg, opts);
  }

  // ============================================
  // QIDIRUV
  // ============================================
  async function askSearch(ctx, edit = false) {
    const msg = `
🔍 **QIDIRUV**

Qidiruv so'zini yuboring:
• Ism yoki familiya
• Telefon raqam
• Username
• Yoki \`id:123456789\` (ID bo'yicha)
    `;
    const opts = {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [Markup.button.callback("🔙 Orqaga", "menu_main")],
      ]),
    };
    module.exports.adminSearchMode.add(ctx.from.id);
    if (edit && ctx.callbackQuery)
      return ctx.editMessageText(msg, opts).catch(() => ctx.reply(msg, opts));
    return ctx.reply(msg, opts);
  }

  // ============================================
  // EKSPORT
  // ============================================
  async function showExport(ctx, edit = false) {
    const total = db.prepare("SELECT COUNT(*) c FROM applications").get().c;
    const msg = `
📤 **EKSPORT**

Bazada **${total}** ta yozuv bor.

Formatni tanlang:
    `;
    const opts = {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [Markup.button.callback("📊 Excel (.xlsx) formatda", "export_xlsx")],
        [Markup.button.callback("📄 CSV formatda", "export_csv")],
        [Markup.button.callback("📋 JSON formatda", "export_json")],
        [Markup.button.callback("🔙 Orqaga", "menu_main")],
      ]),
    };
    if (edit && ctx.callbackQuery)
      return ctx.editMessageText(msg, opts).catch(() => ctx.reply(msg, opts));
    return ctx.reply(msg, opts);
  }

  // ============================================
  // SOZLAMALAR VA MODERATORLAR
  // ============================================
  async function showSettings(ctx, edit = false) {
    const msg = `
⚙️ **SOZLAMALAR**

🆔 **Asosiy Admin:** \`${ADMIN_ID}\`
💾 **Baza:** SQLite (data/club.db)
📊 **Yozuvlar:** ${db.prepare("SELECT COUNT(*) c FROM applications").get().c} ta
⛔ **Bloklangan:** ${
      db.prepare("SELECT COUNT(*) c FROM blocked_users").get().c
    } ta
👮 **Moderatorlar:** ${db.prepare("SELECT COUNT(*) c FROM admins").get().c} ta

Buyruqlar:
/admin — admin panel
/start — foydalanuvchi menyusi
    `;
    const opts = {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback(
            "👮 Moderatorlarni boshqarish",
            "settings_mods"
          ),
        ],
        [Markup.button.callback("📥 Baza faylini yuklash", "settings_db")],
        [Markup.button.callback("🔙 Orqaga", "menu_main")],
      ]),
    };
    if (edit && ctx.callbackQuery)
      return ctx.editMessageText(msg, opts).catch(() => ctx.reply(msg, opts));
    return ctx.reply(msg, opts);
  }

  bot.action("settings_mods", async (ctx) => {
    if (!isAdmin(ctx)) return ctx.answerCbQuery("Ruxsat yo'q");
    ctx.answerCbQuery();

    const mods = db.prepare("SELECT * FROM admins").all();
    let msg = `👮 **Moderatorlar ro'yxati**\n\n`;

    if (mods.length === 0) {
      msg += "Hozircha moderatorlar qo'shilmagan.";
    } else {
      mods.forEach((m, i) => {
        msg += `${i + 1}. ID: \`${m.user_id}\` (Qo'shilgan: ${m.added_at})\n`;
      });
    }

    const buttons = [];
    mods.forEach((m) => {
      buttons.push([
        Markup.button.callback(
          `❌ O'chirish: ${m.user_id}`,
          `del_mod_${m.user_id}`
        ),
      ]);
    });

    buttons.push([
      Markup.button.callback("➕ Yangi moderator qo'shish", "add_mod"),
    ]);
    buttons.push([Markup.button.callback("🔙 Orqaga", "menu_settings")]);

    return ctx.reply(msg, {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard(buttons),
    });
  });

  bot.action("add_mod", (ctx) => {
    if (!isAdmin(ctx)) return ctx.answerCbQuery("Ruxsat yo'q");
    ctx.answerCbQuery();
    module.exports.addModMode.add(ctx.from.id);
    return ctx.reply(
      "👮 Yangi moderatorning Telegram ID raqamini yuboring:\n\n(Eslatma: Moderator botga oldin /start bosgan bo'lishi kerak. ID ni bilish uchun @userinfobot dan foydalaning).\n\nBekor qilish uchun /cancel"
    );
  });

  bot.action(/^del_mod_(\d+)$/, (ctx) => {
    if (!isAdmin(ctx)) return ctx.answerCbQuery("Ruxsat yo'q");
    const modId = parseInt(ctx.match[1]);
    db.prepare("DELETE FROM admins WHERE user_id = ?").run(modId);
    ctx.answerCbQuery("✅ O'chirildi");
    ctx.editMessageText(
      `✅ Moderator (${modId}) o'chirildi. Qayta ko'rish uchun "Moderatorlarni boshqarish" ga kiring.`
    );
  });

  // ============================================
  // EKSPORT QILISH MANTIQI
  // ============================================

  // Excel (.xlsx) yuklash
  bot.action("export_xlsx", async (ctx) => {
    if (!isAdmin(ctx)) return ctx.answerCbQuery("Ruxsat yo'q");
    ctx.answerCbQuery("Tayyorlanmoqda...");
    const apps = db.prepare("SELECT * FROM applications").all();
    if (apps.length === 0) return ctx.reply("Baza bo'sh.");

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("So'rovlar");

    worksheet.columns = [
      { header: "ID", key: "user_id", width: 15 },
      { header: "Username", key: "username", width: 20 },
      { header: "Ism", key: "first_name", width: 15 },
      { header: "Familiya", key: "last_name", width: 15 },
      { header: "Telefon", key: "phone", width: 15 },
      { header: "Sinf", key: "grade", width: 10 },
      { header: "IELTS", key: "ielts", width: 10 },
      { header: "Bio", key: "bio", width: 30 },
      { header: "Maqsad", key: "reason", width: 30 },
      { header: "Zaif joylar", key: "weak_areas", width: 25 },
      { header: "Holat", key: "status", width: 15 },
      { header: "Izoh", key: "admin_note", width: 25 },
      { header: "Til", key: "language", width: 10 },
      { header: "Yuborilgan", key: "created_at", width: 20 },
      { header: "Ko'rib chiqilgan", key: "reviewed_at", width: 20 },
    ];

    worksheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    worksheet.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF0088CC" },
    };
    worksheet.getRow(1).alignment = {
      vertical: "middle",
      horizontal: "center",
    };

    apps.forEach((a) => {
      worksheet.addRow({
        user_id: a.user_id,
        username: a.username || "",
        first_name: a.first_name,
        last_name: a.last_name,
        phone: a.phone,
        grade: a.grade,
        ielts: a.ielts,
        bio: a.bio,
        reason: a.reason,
        weak_areas: a.weak_areas,
        status: STATUS_TEXT[a.status] || a.status,
        admin_note: a.admin_note || "",
        language: a.language || "uz",
        created_at: a.created_at,
        reviewed_at: a.reviewed_at || "",
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    await ctx.replyWithDocument({
      source: Buffer.from(buffer),
      filename: `applications_${Date.now()}.xlsx`,
    });
  });

  // CSV yuklash
  bot.action("export_csv", async (ctx) => {
    if (!isAdmin(ctx)) return ctx.answerCbQuery("Ruxsat yo'q");
    ctx.answerCbQuery("Tayyorlanmoqda...");
    const apps = db.prepare("SELECT * FROM applications").all();
    if (apps.length === 0) return ctx.reply("Baza bo'sh.");

    const header =
      "user_id,username,first_name,last_name,phone,bio,grade,ielts,reason,weak_areas,status,created_at\n";
    const rows = apps
      .map((a) =>
        [
          a.user_id,
          a.username,
          a.first_name,
          a.last_name,
          a.phone,
          a.bio,
          a.grade,
          a.ielts,
          a.reason,
          a.weak_areas,
          a.status,
          a.created_at,
        ]
          .map((v) => `"${String(v || "").replace(/"/g, '""')}"`)
          .join(",")
      )
      .join("\n");

    const buffer = Buffer.from(header + rows, "utf-8");
    await ctx.replyWithDocument({
      source: buffer,
      filename: `applications_${Date.now()}.csv`,
    });
  });

  // JSON yuklash
  bot.action("export_json", async (ctx) => {
    if (!isAdmin(ctx)) return ctx.answerCbQuery("Ruxsat yo'q");
    ctx.answerCbQuery("Tayyorlanmoqda...");
    const apps = db.prepare("SELECT * FROM applications").all();
    if (apps.length === 0) return ctx.reply("Baza bo'sh.");
    const buffer = Buffer.from(JSON.stringify(apps, null, 2), "utf-8");
    await ctx.replyWithDocument({
      source: buffer,
      filename: `applications_${Date.now()}.json`,
    });
  });

  // Bazani yuklash
  bot.action("settings_db", async (ctx) => {
    if (!isAdmin(ctx)) return ctx.answerCbQuery("Ruxsat yo'q");
    ctx.answerCbQuery();
    await ctx.replyWithDocument({
      source: "data/club.db",
      filename: `club_backup_${Date.now()}.db`,
    });
  });
};

// Qidiruv, Broadcast va Moderator qo'shish uchun rejimlar
const adminSearchMode = new Set();
const broadcastMode = new Map();
const addModMode = new Set();

async function handleSearch(ctx) {
  const q = ctx.message.text.trim();
  let apps;

  if (q.startsWith("id:")) {
    const id = parseInt(q.slice(3));
    apps = db.prepare("SELECT * FROM applications WHERE user_id = ?").all(id);
  } else {
    const like = `%${q}%`;
    apps = db
      .prepare(
        `
      SELECT * FROM applications 
      WHERE first_name LIKE ? OR last_name LIKE ? 
         OR phone LIKE ? OR username LIKE ?
      ORDER BY created_at DESC LIMIT 10
    `
      )
      .all(like, like, like, like);
  }

  if (apps.length === 0) {
    return ctx.reply("🔍 Hech narsa topilmadi.");
  }

  await ctx.reply(`🔍 **Topildi: ${apps.length} ta**`, {
    parse_mode: "Markdown",
  });

  for (const a of apps) {
    await ctx.reply(formatApplicationCard(a), {
      parse_mode: "MarkdownV2",
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback("✅ Qabul", `approve_${a.user_id}`),
          Markup.button.callback("❌ Rad", `reject_${a.user_id}`),
        ],
        [Markup.button.callback("👤 Profil", `profile_${a.user_id}`)],
        [Markup.button.callback("💬 Xabar", `msg_${a.user_id}`)],
      ]),
    });
  }
}

module.exports.adminSearchMode = adminSearchMode;
module.exports.handleSearch = handleSearch;
module.exports.broadcastMode = broadcastMode;
module.exports.addModMode = addModMode;

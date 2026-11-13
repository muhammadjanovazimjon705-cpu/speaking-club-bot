const { Scenes, Markup } = require("telegraf");
const db = require("../database");
const { formatApplicationCard } = require("../utils/formatters");

const registrationWizard = new Scenes.WizardScene(
  "registration-wizard",

  // QADAM 1: Ism
  (ctx) => {
    ctx.wizard.state.data = {};
    ctx.reply("1️⃣ Ismingizni kiriting:");
    return ctx.wizard.next();
  },

  // QADAM 2: Familiya
  (ctx) => {
    if (!ctx.message?.text || ctx.message.text.length < 2) {
      return ctx.reply("Iltimos, haqiqiy ismingizni kiriting (kamida 2 harf):");
    }
    ctx.wizard.state.data.first_name = ctx.message.text.trim();
    ctx.reply("2️⃣ Familiyangizni kiriting:");
    return ctx.wizard.next();
  },

  // QADAM 3: Telefon
  (ctx) => {
    if (!ctx.message?.text || ctx.message.text.length < 7) {
      return ctx.reply("Iltimos, to'g'ri telefon raqam kiriting:");
    }
    ctx.wizard.state.data.last_name = ctx.message.text.trim();
    ctx.reply("3️⃣ Telefon raqamingizni kiriting (+998...):");
    return ctx.wizard.next();
  },

  // QADAM 4: Bio
  (ctx) => {
    if (!ctx.message?.text) return ctx.reply("Iltimos, matn kiriting:");
    ctx.wizard.state.data.phone = ctx.message.text.trim();
    ctx.reply("4️⃣ O'zingiz haqingizda qisqacha yozing (bio):");
    return ctx.wizard.next();
  },

  // QADAM 5: Sinf
  (ctx) => {
    if (!ctx.message?.text) return ctx.reply("Iltimos, matn kiriting:");
    ctx.wizard.state.data.bio = ctx.message.text.trim();
    ctx.reply(
      "5️⃣ Nechinchi sinfda o'qiysiz?",
      Markup.keyboard([["9-sinf", "10-sinf", "11-sinf"]])
        .oneTime()
        .resize()
    );
    return ctx.wizard.next();
  },

  // QADAM 6: IELTS
  (ctx) => {
    const valid = ["9-sinf", "10-sinf", "11-sinf"];
    if (!valid.includes(ctx.message?.text)) {
      return ctx.reply(
        "Iltimos, quyidagi variantlardan birini tanlang:",
        Markup.keyboard([["9-sinf", "10-sinf", "11-sinf"]])
          .oneTime()
          .resize()
      );
    }
    ctx.wizard.state.data.grade = ctx.message.text;
    ctx.reply(
      "6️⃣ IELTS natijangiz qanday?",
      Markup.keyboard([
        ["Yo'q", "5.0", "5.5"],
        ["6.0", "6.5", "7.0+"],
      ])
        .oneTime()
        .resize()
    );
    return ctx.wizard.next();
  },

  // QADAM 7: Sabab
  (ctx) => {
    const valid = ["Yo'q", "5.0", "5.5", "6.0", "6.5", "7.0+"];
    if (!valid.includes(ctx.message?.text)) {
      return ctx.reply(
        "Iltimos, IELTS natijangizni tanlang:",
        Markup.keyboard([
          ["Yo'q", "5.0", "5.5"],
          ["6.0", "6.5", "7.0+"],
        ])
          .oneTime()
          .resize()
      );
    }
    ctx.wizard.state.data.ielts = ctx.message.text;
    ctx.reply(
      "7️⃣ Nima uchun bizning speaking clubga qo'shilmoqchisiz?",
      Markup.removeKeyboard()
    );
    return ctx.wizard.next();
  },

  // QADAM 8: Zaif joylar va YAKUNIY YUBORISH (Bu yerda async qo'shilgan)
  async (ctx) => {
    if (!ctx.message?.text || ctx.message.text.length < 3) {
      return ctx.reply("Iltimos, javobingizni batafsilroq yozing:");
    }
    ctx.wizard.state.data.reason = ctx.message.text.trim();

    // Zaif joylar uchun variantlar
    await ctx.reply(
      "8️⃣ Speaking clubda qaysi zaif joylaringizni kuchaytirmoqchisiz?\n\n" +
        "Variantlardan birini tanlang yoki o'zingiz yozing:",
      Markup.keyboard([
        ["Talaffuz (Pronunciation)"],
        ["Grammatika (Grammar)"],
        ["So'z boyligi (Vocabulary)"],
        ["O'z fikrini ifodalash (Fluency)"],
        ["Barchasi"],
      ])
        .oneTime()
        .resize()
    );
    return ctx.wizard.next();
  },

  // YAKUNIY QADAM: Saqlash va adminga yuborish (Bu yerda ham async bor)
  async (ctx) => {
    const text = ctx.message?.text;
    if (!text || text.length < 2) {
      return ctx.reply("Iltimos, zaif joyingizni tanlang yoki yozing:");
    }
    ctx.wizard.state.data.weak_areas = text;

    const d = ctx.wizard.state.data;
    const userId = ctx.from.id;
    const username = ctx.from.username || "yoq";

    // Bazaga saqlash
    const insert = db.prepare(`
      INSERT OR REPLACE INTO applications 
      (user_id, username, first_name, last_name, phone, bio, grade, ielts, reason, weak_areas, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
    `);
    insert.run(
      userId,
      username,
      d.first_name,
      d.last_name,
      d.phone,
      d.bio,
      d.grade,
      d.ielts,
      d.reason,
      d.weak_areas
    );

    // Adminga yuborish
    const adminMsg =
      "🆕 **YANGI SO'ROV**\n\n" +
      formatApplicationCard({
        ...d,
        user_id: userId,
        username,
        status: "pending",
        created_at: new Date().toISOString(),
      });

    try {
      await ctx.telegram.sendMessage(process.env.ADMIN_ID, adminMsg, {
        parse_mode: "MarkdownV2",
        ...Markup.inlineKeyboard([
          [Markup.button.callback("✅ Qabul qilish", `approve_${userId}`)],
          [Markup.button.callback("❌ Rad etish", `reject_${userId}`)],
        ]),
      });
    } catch (e) {
      console.error("Adminga yuborishda xatolik:", e.message);
    }

    await ctx.reply(
      "✅ So'rovingiz muvaffaqiyatli yuborildi!\n\n" +
        "Admin ko'rib chiqadi va sizga xabar beradi.",
      Markup.removeKeyboard()
    );

    return ctx.scene.leave();
  }
);

module.exports = registrationWizard;

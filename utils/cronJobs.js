const cron = require("node-cron");
const db = require("../database");

module.exports = (bot) => {
  // Har soatda ishlaydigan cron job (0-daqiqada)
  // Agar har 1 daqiqada test qilishni istasangiz: '* * * * *' qilib qo'ying
  cron.schedule("0 * * * *", async () => {
    try {
      const ADMIN_ID = process.env.ADMIN_ID;

      // 24 soatdan oshgan va hali "pending" holatida turgan so'rovlarni qidiramiz
      const oldApps = db
        .prepare(
          `
        SELECT * FROM applications 
        WHERE status = 'pending' 
        AND created_at <= datetime('now', '-24 hours')
      `
        )
        .all();

      // Agar bunday so'rovlar bo'lsa, adminga xabar yuboramiz
      if (oldApps.length > 0) {
        const msg = `⚠️ **DIQQAT!**\n\nSizda **${oldApps.length} ta** so'rov 24 soatdan beri ko'rib chiqilmagan holatda turibdi.\n\nIltimos, admin panelga kirib ularni tekshiring: /admin`;

        await bot.telegram
          .sendMessage(ADMIN_ID, msg, { parse_mode: "Markdown" })
          .catch((err) =>
            console.error("Admin eslatmasi yuborilmadi:", err.message)
          );
      }

      // (Ixtiyoriy) Foydalanuvchilarga ham eslatma yuborishimiz mumkin
      // Agar so'rovi 48 soatdan oshgan bo'lsa, foydalanuvchiga xabar beramiz
      const veryOldApps = db
        .prepare(
          `
        SELECT user_id, first_name FROM applications 
        WHERE status = 'pending' 
        AND created_at <= datetime('now', '-48 hours')
      `
        )
        .all();

      for (const app of veryOldApps) {
        const userMsg = `⏳ Hurmatli ${app.first_name}, sizning so'rovingiz hali ham admin tomonidan ko'rib chiqilmoqda. Iltimos, biroz kuting.`;
        // Sizni bezovta qilmaslik uchun har safar yubormaslik uchun bazada alohida "notified" ustun qo'shsangiz ham bo'ladi, lekin hozircha shunchaki yuboramiz.
        await bot.telegram.sendMessage(app.user_id, userMsg).catch(() => {});
      }
    } catch (err) {
      console.error("Cron job xatoligi:", err);
    }
  });

  console.log("⏰ Eslatma tizimi (Cron Job) ishga tushdi.");
};

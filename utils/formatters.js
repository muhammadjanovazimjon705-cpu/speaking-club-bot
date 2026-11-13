const STATUS_EMOJI = { pending: "⏳", approved: "✅", rejected: "❌" };
const STATUS_TEXT = {
  pending: "Kutilmoqda",
  approved: "Qabul qilingan",
  rejected: "Rad etilgan",
};

// MarkdownV2 uchun maxsus belgilarni xavfsiz holatga keltirish
function escapeMd(text) {
  if (!text) return "—";
  return String(text).replace(/([_*\[\]()~`>#+\-=|{}.!])/g, "\\$1");
}

// Bitta so'rovni batafsil chiroyli kartochka sifatida formatlash
function formatApplicationCard(app, index = null) {
  const emoji = STATUS_EMOJI[app.status] || "❓";
  const statusText = STATUS_TEXT[app.status] || app.status;
  const header = index !== null ? `${index}. ` : "";

  let usernameText = "yoq";
  if (app.username && app.username !== "yoq") {
    usernameText = "@" + escapeMd(app.username);
  }

  const divider = "➖➖➖➖➖➖➖➖➖➖➖➖";

  const lines = [
    `${header}${emoji} *${escapeMd(app.first_name)} ${escapeMd(
      app.last_name
    )}*`,
    divider,
    `🆔 *ID:* \`${app.user_id}\``,
    `👤 *Username:* ${usernameText}`,
    `📞 *Telefon:* ${escapeMd(app.phone)}`,
    `📚 *Sinf:* ${escapeMd(app.grade)}`,
    `📝 *IELTS:* ${escapeMd(app.ielts)}`,
    divider,
    `💬 *Bio:*`,
    `${escapeMd(app.bio)}`,
    ``,
    `🎯 *Maqsad:*`,
    `${escapeMd(app.reason)}`,
    ``,
    `🔧 *Zaif joylar:*`,
    `${escapeMd(app.weak_areas)}`,
    divider,
    `📌 *Holat:* ${emoji} ${escapeMd(statusText)}`,
    `📅 *Yuborilgan:* ${escapeMd(app.created_at || "—")}`,
  ];

  if (app.admin_note) {
    lines.push(`📝 *Admin izohi:* ${escapeMd(app.admin_note)}`);
  }

  return lines.join("\n");
}

// Qisqa ro'yxat formati (Zamonaviy karta ko'rinishida)
function formatApplicationShort(app, index) {
  const emoji = STATUS_EMOJI[app.status] || '❓';
  // Tugma uchun qisqa va aniq matn
  return `${index}. ${emoji} ${app.first_name} ${app.last_name} | ${app.grade}`;
}

module.exports = {
  formatApplicationCard,
  formatApplicationShort,
  escapeMd,
  STATUS_EMOJI,
  STATUS_TEXT,
};

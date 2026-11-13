const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

const dataDir = path.join(__dirname, "data");
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);

const db = new Database(path.join(dataDir, "club.db"));

// Asosiy jadval (language ustuni bilan)
db.exec(`
  CREATE TABLE IF NOT EXISTS applications (
    user_id INTEGER PRIMARY KEY,
    username TEXT,
    first_name TEXT,
    last_name TEXT,
    phone TEXT,
    bio TEXT,
    grade TEXT,
    ielts TEXT,
    reason TEXT,
    weak_areas TEXT,
    status TEXT DEFAULT 'pending',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    reviewed_at TEXT,
    language TEXT DEFAULT 'uz'
  )
`);

// Eski bazalarda qolib ketgan ustunlarni tekshirib qo'shish
try {
  db.exec(`ALTER TABLE applications ADD COLUMN admin_note TEXT`);
} catch (e) {}
try {
  db.exec(`ALTER TABLE applications ADD COLUMN language TEXT DEFAULT 'uz'`);
} catch (e) {}

db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    key TEXT PRIMARY KEY,
    value TEXT
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS blocked_users (
    user_id INTEGER PRIMARY KEY,
    blocked_at TEXT DEFAULT CURRENT_TIMESTAMP
  )
`);

db.exec(`
    CREATE TABLE IF NOT EXISTS admins (
      user_id INTEGER PRIMARY KEY,
      added_by INTEGER,
      added_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

// Indekslar
db.exec(`CREATE INDEX IF NOT EXISTS idx_status ON applications(status)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_created ON applications(created_at)`);

module.exports = db;

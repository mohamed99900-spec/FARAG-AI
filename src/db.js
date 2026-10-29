
const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const configuredPath = process.env.DATABASE_PATH || "./data/farag.sqlite";
const dbPath = path.resolve(process.cwd(), configuredPath);

fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.pragma("busy_timeout = 5000");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    user_id INTEGER PRIMARY KEY,
    name TEXT NOT NULL DEFAULT 'عضو',
    points INTEGER NOT NULL DEFAULT 0,
    last_daily TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS chats (
    chat_id TEXT PRIMARY KEY,
    title TEXT NOT NULL DEFAULT '',
    type TEXT NOT NULL DEFAULT 'supergroup',
    welcome TEXT NOT NULL DEFAULT 'أهلاً بك {name} 👋 نورت المجموعة!',
    links_enabled INTEGER NOT NULL DEFAULT 0,
    flood_enabled INTEGER NOT NULL DEFAULT 1,
    max_warnings INTEGER NOT NULL DEFAULT 3,
    mute_minutes INTEGER NOT NULL DEFAULT 10,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS warnings (
    chat_id TEXT NOT NULL,
    user_id INTEGER NOT NULL,
    count INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (chat_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS stats (
    key TEXT PRIMARY KEY,
    value INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id TEXT,
    actor_id INTEGER,
    target_id INTEGER,
    action TEXT NOT NULL,
    details TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS chat_members (
    chat_id TEXT NOT NULL,
    user_id INTEGER NOT NULL,
    last_seen TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (chat_id, user_id)
  );

  CREATE INDEX IF NOT EXISTS idx_events_chat
    ON events(chat_id, id DESC);

  CREATE INDEX IF NOT EXISTS idx_events_action
    ON events(action);
`);

const statements = {
  getUser: db.prepare("SELECT * FROM users WHERE user_id = ?"),

  upsertUser: db.prepare(`
    INSERT INTO users (user_id, name)
    VALUES (@user_id, @name)
    ON CONFLICT(user_id) DO UPDATE SET name = excluded.name
  `),

  addPoints: db.prepare(`
    UPDATE users SET points = points + ? WHERE user_id = ?
  `),

  daily: db.prepare(`
    UPDATE users
    SET points = points + 20, last_daily = ?
    WHERE user_id = ? AND (last_daily IS NULL OR last_daily <> ?)
  `),

  topUsers: db.prepare(`
    SELECT name, points FROM users
    ORDER BY points DESC, user_id ASC LIMIT 10
  `),

  getChat: db.prepare("SELECT * FROM chats WHERE chat_id = ?"),

  upsertChat: db.prepare(`
    INSERT INTO chats (chat_id, title, type)
    VALUES (@chat_id, @title, @type)
    ON CONFLICT(chat_id) DO UPDATE SET
      title = excluded.title,
      type = excluded.type
  `),

  updateChat: db.prepare(`
    UPDATE chats SET
      welcome = @welcome,
      links_enabled = @links_enabled,
      flood_enabled = @flood_enabled,
      max_warnings = @max_warnings,
      mute_minutes = @mute_minutes
    WHERE chat_id = @chat_id
  `),

  getWarnings: db.prepare(`
    SELECT count FROM warnings WHERE chat_id = ? AND user_id = ?
  `),

  setWarnings: db.prepare(`
    INSERT INTO warnings (chat_id, user_id, count)
    VALUES (?, ?, ?)
    ON CONFLICT(chat_id, user_id) DO UPDATE SET count = excluded.count
  `),

  clearWarnings: db.prepare(`
    DELETE FROM warnings WHERE chat_id = ? AND user_id = ?
  `),

  statAdd: db.prepare(`
    INSERT INTO stats (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = value + excluded.value
  `),

  statGet: db.prepare("SELECT value FROM stats WHERE key = ?"),

  logEvent: db.prepare(`
    INSERT INTO events (chat_id, actor_id, target_id, action, details)
    VALUES (?, ?, ?, ?, ?)
  `),

  memberSeen: db.prepare(`
    INSERT INTO chat_members (chat_id, user_id, last_seen)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(chat_id, user_id) DO UPDATE SET
      last_seen = CURRENT_TIMESTAMP
  `),

  memberCount: db.prepare(`
    SELECT COUNT(*) AS total FROM chat_members WHERE chat_id = ?
  `),

  recentEvents: db.prepare(`
    SELECT action, details, created_at
    FROM events WHERE chat_id = ?
    ORDER BY id DESC LIMIT 10
  `)
};

function ensureUser(user) {
  statements.upsertUser.run({
    user_id: user.id,
    name: [user.first_name, user.last_name].filter(Boolean).join(" ") ||
      user.username || "عضو"
  });

  return statements.getUser.get(user.id);
}

function ensureChat(chat) {
  statements.upsertChat.run({
    chat_id: String(chat.id),
    title: chat.title || "",
    type: chat.type || "supergroup"
  });

  return statements.getChat.get(String(chat.id));
}

function getChat(chat) {
  return ensureChat(chat);
}

function updateChat(chatId, values) {
  statements.updateChat.run({
    chat_id: String(chatId),
    ...values
  });

  return statements.getChat.get(String(chatId));
}

function incrementStat(key, amount = 1) {
  statements.statAdd.run(key, amount);
}

function getStat(key) {
  return statements.statGet.get(key)?.value || 0;
}

function logEvent(chatId, actorId, targetId, action, details = "") {
  statements.logEvent.run(
    chatId == null ? null : String(chatId),
    actorId ?? null,
    targetId ?? null,
    action,
    String(details).slice(0, 500)
  );
}

module.exports = {
  db,
  ensureUser,
  ensureChat,
  getChat,
  updateChat,
  incrementStat,
  getStat,
  logEvent,
  getWarnings: (chatId, userId) =>
    statements.getWarnings.get(String(chatId), userId)?.count || 0,
  setWarnings: (chatId, userId, count) =>
    statements.setWarnings.run(String(chatId), userId, count),
  clearWarnings: (chatId, userId) =>
    statements.clearWarnings.run(String(chatId), userId),
  addPoints: (userId, points) => {
    const result = statements.addPoints.run(points, userId);
    if (!result.changes) throw new Error("User not found");
    return statements.getUser.get(userId);
  },
  claimDaily: (userId, day) => {
    const result = statements.daily.run(day, userId, day);
    return result.changes === 1;
  },
  getUser: userId => statements.getUser.get(userId),
  topUsers: () => statements.topUsers.all(),
  memberSeen: (chatId, userId) =>
    statements.memberSeen.run(String(chatId), userId),
  memberCount: chatId =>
    statements.memberCount.get(String(chatId)).total,
  recentEvents: chatId =>
    statements.recentEvents.all(String(chatId))
};

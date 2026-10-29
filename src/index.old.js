
require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { Telegraf, Markup } = require("telegraf");

const TOKEN = process.env.BOT_TOKEN;
const OWNER_ID = Number(process.env.OWNER_ID || 0);
const AI_ENABLED = process.env.AI_ENABLED === "true";
const GROQ_API_KEY = process.env.GROQ_API_KEY || "";
const GROQ_MODEL =
  process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

if (!TOKEN || TOKEN === "PUT_YOUR_TELEGRAM_BOT_TOKEN_HERE") {
  console.error("❌ ضع BOT_TOKEN الصحيح داخل ملف .env أولاً.");
  process.exit(1);
}

const bot = new Telegraf(TOKEN);

const DATA_DIR = path.join(__dirname, "..", "data");
const DB_FILE = path.join(DATA_DIR, "db.json");

fs.mkdirSync(DATA_DIR, { recursive: true });

const initialDB = {
  chats: {},
  users: {},
  stats: {
    messages: 0,
    commands: 0,
    blocked: 0
  }
};

let db;

try {
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(
      DB_FILE,
      JSON.stringify(initialDB, null, 2),
      "utf8"
    );
  }

  db = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));

  db.chats ||= {};
  db.users ||= {};
  db.stats ||= { ...initialDB.stats };
} catch (error) {
  console.error("❌ تعذر قراءة قاعدة البيانات:", error.message);
  process.exit(1);
}

let saveTimer;

function saveDB() {
  clearTimeout(saveTimer);

  saveTimer = setTimeout(() => {
    try {
      const tempFile = DB_FILE + ".tmp";

      fs.writeFileSync(
        tempFile,
        JSON.stringify(db, null, 2),
        "utf8"
      );

      fs.renameSync(tempFile, DB_FILE);
    } catch (error) {
      console.error("تعذر حفظ البيانات:", error.message);
    }
  }, 200);
}

function getChatData(chatId) {
  const id = String(chatId);

  if (!db.chats[id]) {
    db.chats[id] = {
      welcome: "أهلاً بك {name} 👋 نورت مجموعتنا!",
      links: false,
      flood: true,
      warnings: {},
      settings: {
        maxWarnings: 3,
        muteMinutes: 10
      }
    };
  }

  const chat = db.chats[id];

  chat.warnings ||= {};
  chat.settings ||= {
    maxWarnings: 3,
    muteMinutes: 10
  };

  if (typeof chat.links !== "boolean") chat.links = false;
  if (typeof chat.flood !== "boolean") chat.flood = true;

  return chat;
}

function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function getUserName(user) {
  if (!user) return "عضو";

  const fullName = [user.first_name, user.last_name]
    .filter(Boolean)
    .join(" ");

  return fullName || user.username || "عضو";
}

function isGroup(ctx) {
  return ["group", "supergroup"].includes(ctx.chat?.type);
}

function isOwner(ctx) {
  return Boolean(
    OWNER_ID &&
    ctx.from &&
    Number(ctx.from.id) === OWNER_ID
  );
}

async function isAdmin(ctx, userId = ctx.from?.id) {
  if (isOwner(ctx)) return true;

  if (!ctx.chat || !userId) return false;

  if (ctx.chat.type === "private") {
    return false;
  }

  try {
    const member = await ctx.telegram.getChatMember(
      ctx.chat.id,
      userId
    );

    return ["creator", "administrator"].includes(member.status);
  } catch {
    return false;
  }
}

async function requireAdmin(ctx) {
  if (await isAdmin(ctx)) return true;

  await ctx.reply(
    "⛔ الأمر ده متاح لمشرفي المجموعة فقط."
  );

  return false;
}

async function isBotAdmin(ctx) {
  if (!ctx.chat) return false;

  try {
    const member = await ctx.telegram.getChatMember(
      ctx.chat.id,
      ctx.botInfo.id
    );

    return ["creator", "administrator"].includes(member.status);
  } catch {
    return false;
  }
}

function targetFromReply(ctx) {
  const message = ctx.message;

  if (!message?.reply_to_message?.from) return null;

  const target = message.reply_to_message.from;

  if (target.is_bot) return null;
  if (target.id === ctx.botInfo.id) return null;

  return target;
}

async function getModerationTarget(ctx) {
  const target = targetFromReply(ctx);

  if (!target) {
    await ctx.reply(
      "⚠️ استخدم الأمر بالرد على رسالة العضو المطلوب."
    );
    return null;
  }

  if (target.id === ctx.from?.id && !isOwner(ctx)) {
    await ctx.reply("❌ لا يمكنك تنفيذ الأمر على نفسك.");
    return null;
  }

  try {
    const member = await ctx.telegram.getChatMember(
      ctx.chat.id,
      target.id
    );

    if (["creator", "administrator"].includes(member.status)) {
      await ctx.reply("❌ لا يمكن استهداف مشرف بهذه العملية.");
      return null;
    }
  } catch {
    await ctx.reply("تعذر التحقق من صلاحيات العضو.");
    return null;
  }

  return target;
}

function ensureUser(user) {
  const id = String(user.id);

  if (!db.users[id]) {
    db.users[id] = {
      id: user.id,
      name: getUserName(user),
      points: 0,
      lastDaily: null
    };
  }

  db.users[id].name = getUserName(user);
  return db.users[id];
}

function mainKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("🛡️ الحماية", "menu_security"),
      Markup.button.callback("👥 الإدارة", "menu_admin")
    ],
    [
      Markup.button.callback("🏆 النقاط", "menu_points"),
      Markup.button.callback("🎮 لعبة", "menu_game")
    ],
    [
      Markup.button.callback("🧠 الذكاء الاصطناعي", "menu_ai"),
      Markup.button.callback("📊 الإحصائيات", "menu_stats")
    ],
    [
      Markup.button.callback("📚 المساعدة", "menu_help")
    ]
  ]);
}

const HELP_TEXT = `
<b>👑 FARAG AI — دليل الأوامر</b>

<b>👥 الأوامر العامة</b>
/start — القائمة الرئيسية
/help — المساعدة
/id — عرض رقمك ورقم المحادثة
/daily — مكافأة يومية
/points — رصيد نقاطك
/top — أفضل 10 أعضاء
/quiz — سؤال وجواب

<b>🛡️ أوامر المشرفين</b>
/ban — حظر العضو بالرد على رسالته
/unban — فك الحظر بالرد على رسالة العضو
/mute — كتم العضو بالرد على رسالته
/unmute — فك الكتم بالرد على رسالته
/warn — تحذير العضو
/warnings — عرض عدد التحذيرات
/resetwarn — تصفير التحذيرات
/stats — إحصائيات المحادثة
/links on — منع الروابط
/links off — السماح بالروابط
/flood on — تفعيل حماية التكرار
/flood off — تعطيل حماية التكرار
/setwelcome نص الترحيب — تغيير الترحيب
/settings — عرض إعدادات الحماية
/channelinfo — معلومات القناة أو المجموعة

<b>🤖 الذكاء الاصطناعي</b>
/ai سؤالك — سؤال FARAG AI

<b>ملاحظة:</b>
أوامر الإدارة تعمل داخل المحادثات التي يدعمها
Telegram وبعد منح البوت الصلاحيات اللازمة.
`;

bot.start(async ctx => {
  db.stats.commands++;
  saveDB();

  const name = escapeHTML(getUserName(ctx.from));

  await ctx.replyWithHTML(
    `👑 <b>أهلاً ${name} في FARAG AI!</b>\n\n` +
    "مساعدك الذكي لإدارة المجموعات وحمايتها.\n" +
    "استخدم الأزرار لاستكشاف المميزات، أو اكتب /help.",
    mainKeyboard()
  );
});

bot.command("help", async ctx => {
  db.stats.commands++;
  saveDB();
  await ctx.replyWithHTML(HELP_TEXT);
});

bot.command("id", async ctx => {
  const reply = ctx.message?.reply_to_message;
  const target = reply?.from;

  await ctx.reply(
    `🆔 رقم حسابك: ${ctx.from.id}\n` +
    `💬 رقم المحادثة: ${ctx.chat.id}` +
    (target ? `\n👤 رقم العضو المشار إليه: ${target.id}` : "")
  );
});

bot.action(/^menu_/, async ctx => {
  await ctx.answerCbQuery();

  const section = ctx.callbackQuery.data.slice(5);

  const pages = {
    security:
      "🛡️ الحماية\n\n" +
      "الروابط والتكرار والتحذيرات متاحة للمشرفين.\n" +
      "اضبطها داخل المجموعة باستخدام /links و /flood و /settings.",
    admin:
      "👥 إدارة الأعضاء\n\n" +
      "استخدم /ban و /unban و /mute و /unmute و /warn.\n" +
      "يجب الرد على رسالة العضو المستهدف.",
    points:
      "🏆 نظام النقاط\n\n" +
      "استخدم /daily للمكافأة اليومية، و /points لرصيدك، و /top للترتيب.",
    game:
      "🎮 تحدي FARAG AI\n\n" +
      "ابدأ جولة جديدة باستخدام /quiz.",
    ai:
      AI_ENABLED && GROQ_API_KEY
        ? "🧠 الذكاء الاصطناعي جاهز. استخدم /ai ثم اكتب سؤالك."
        : "🧠 الذكاء الاصطناعي متوقف حاليًا. أضف GROQ_API_KEY إلى .env ثم فعّل AI_ENABLED.",
    stats:
      "📊 الإحصائيات\n\n" +
      `رسائل تمت معالجتها: ${db.stats.messages}\n` +
      `أوامر تمت معالجتها: ${db.stats.commands}\n` +
      `رسائل حُجبت: ${db.stats.blocked}`,
    help: HELP_TEXT
  };

  const text = pages[section] || HELP_TEXT;

  await ctx.replyWithHTML(text, mainKeyboard());
});

bot.command("daily", async ctx => {
  if (!ctx.from) return;

  const user = ensureUser(ctx.from);
  const today = new Date().toISOString().slice(0, 10);

  if (user.lastDaily === today) {
    await ctx.reply("⏳ استلمت مكافأتك اليومية بالفعل. ارجع بكرة!");
    return;
  }

  user.lastDaily = today;
  user.points += 20;

  saveDB();

  await ctx.reply(
    `🎁 مبروك! حصلت على 20 نقطة.\n` +
    `🏆 رصيدك الآن: ${user.points}`
  );
});

bot.command("points", async ctx => {
  if (!ctx.from) return;

  const user = ensureUser(ctx.from);

  await ctx.reply(
    `🏆 ${user.name}\nرصيدك: ${user.points} نقطة`
  );
});

bot.command("top", async ctx => {
  const top = Object.values(db.users)
    .sort((a, b) => b.points - a.points)
    .slice(0, 10);

  if (!top.length) {
    await ctx.reply("لا توجد نقاط مسجلة حتى الآن.");
    return;
  }

  const lines = top.map((user, index) =>
    `${index + 1}. ${escapeHTML(user.name)} — ${user.points} نقطة`
  );

  await ctx.replyWithHTML(
    "<b>🏆 أفضل 10 أعضاء</b>\n\n" + lines.join("\n")
  );
});

const quizzes = [
  {
    q: "كم عدد أركان الإسلام؟",
    options: ["3", "5", "7"],
    answer: 1
  },
  {
    q: "ما الكوكب المعروف بالكوكب الأحمر؟",
    options: ["المريخ", "الزهرة", "زحل"],
    answer: 0
  },
  {
    q: "كم ضلعًا للمثلث؟",
    options: ["4", "5", "3"],
    answer: 2
  },
  {
    q: "ما عاصمة مصر؟",
    options: ["الإسكندرية", "القاهرة", "الأقصر"],
    answer: 1
  }
];

bot.command("quiz", async ctx => {
  const quiz = quizzes[Math.floor(Math.random() * quizzes.length)];

  await ctx.reply(
    `🎮 تحدي FARAG AI\n\n${quiz.q}`,
    Markup.inlineKeyboard(
      quiz.options.map((option, index) => [
        Markup.button.callback(
          option,
          `quiz_${quiz.answer}_${index}_${ctx.from.id}`
        )
      ])
    )
  );
});

bot.action(/^quiz_(\d+)_(\d+)_(\d+)$/, async ctx => {
  const [, answer, choice, playerId] = ctx.match;

  if (Number(playerId) !== ctx.from.id) {
    await ctx.answerCbQuery("ابدأ لعبتك أنت باستخدام /quiz", {
      show_alert: true
    });
    return;
  }

  await ctx.answerCbQuery();

  if (Number(answer) === Number(choice)) {
    const user = ensureUser(ctx.from);
    user.points += 10;
    saveDB();

    await ctx.reply(
      `🎉 إجابة صحيحة! +10 نقاط.\nرصيدك: ${user.points}`
    );
  } else {
    await ctx.reply("❌ إجابة غير صحيحة. جرّب سؤالًا آخر بـ /quiz");
  }
});

bot.command("ai", async ctx => {
  const prompt = ctx.message.text.replace(/^\/ai(?:@\w+)?\s*/i, "").trim();

  if (!AI_ENABLED || !GROQ_API_KEY) {
    await ctx.reply(
      "🧠 الذكاء الاصطناعي غير مفعّل.\n" +
      "أضف مفتاح Groq إلى .env ثم اجعل AI_ENABLED=true وأعد تشغيل البوت."
    );
    return;
  }

  if (!prompt) {
    await ctx.reply("اكتب سؤالك بعد الأمر، مثال:\n/ai اشرح لي الذكاء الاصطناعي");
    return;
  }

  if (prompt.length > 4000) {
    await ctx.reply("السؤال طويل جدًا. اختصره إلى 4000 حرف.");
    return;
  }

  await ctx.sendChatAction("typing");

  try {
    const response = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${GROQ_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: GROQ_MODEL,
          messages: [
            {
              role: "system",
              content:
                "أنت FARAG AI، مساعد عربي ودود ومفيد. " +
                "أجب بوضوح وباختصار مناسب، ولا تدّع معرفة ما لا تعرفه."
            },
            { role: "user", content: prompt }
          ],
          temperature: 0.7,
          max_tokens: 1000
        }),
        signal: AbortSignal.timeout(30000)
      }
    );

    if (!response.ok) {
      throw new Error(`Groq HTTP ${response.status}`);
    }

    const data = await response.json();
    const answer = data.choices?.[0]?.message?.content?.trim();

    if (!answer) throw new Error("AI returned an empty response");

    await ctx.reply(answer.slice(0, 4000));
  } catch (error) {
    console.error("AI error:", error.message);
    await ctx.reply(
      "تعذر الحصول على إجابة الآن. تحقق من المفتاح واسم النموذج واتصال الإنترنت."
    );
  }
});

bot.command("stats", async ctx => {
  if (ctx.chat.type !== "private" && !(await requireAdmin(ctx))) return;

  const chat = getChatData(ctx.chat.id);
  const warnings = Object.values(chat.warnings)
    .reduce((sum, count) => sum + Number(count || 0), 0);

  await ctx.reply(
    `📊 إحصائيات FARAG AI\n\n` +
    `💬 الرسائل المعالجة: ${db.stats.messages}\n` +
    `⚡ الأوامر المعالجة: ${db.stats.commands}\n` +
    `🚫 الرسائل المحجوبة: ${db.stats.blocked}\n` +
    `⚠️ التحذيرات المسجلة هنا: ${warnings}\n` +
    `🔗 منع الروابط: ${chat.links ? "مفعّل" : "متوقف"}\n` +
    `🔁 حماية التكرار: ${chat.flood ? "مفعّلة" : "متوقفة"}`
  );
});

bot.command("settings", async ctx => {
  if (!isGroup(ctx)) {
    await ctx.reply("استخدم الأمر داخل المجموعة.");
    return;
  }

  if (!(await requireAdmin(ctx))) return;

  const chat = getChatData(ctx.chat.id);

  await ctx.reply(
    `⚙️ إعدادات المجموعة\n\n` +
    `منع الروابط: ${chat.links ? "مفعّل" : "متوقف"}\n` +
    `حماية التكرار: ${chat.flood ? "مفعّلة" : "متوقفة"}\n` +
    `الحد الأقصى للتحذيرات: ${chat.settings.maxWarnings}\n` +
    `مدة الكتم: ${chat.settings.muteMinutes} دقائق`
  );
});

bot.command("links", async ctx => {
  if (!isGroup(ctx)) return ctx.reply("استخدم الأمر داخل المجموعة.");
  if (!(await requireAdmin(ctx))) return;

  const arg = ctx.message.text.split(/\s+/)[1]?.toLowerCase();

  if (!["on", "off"].includes(arg)) {
    return ctx.reply("الاستخدام: /links on أو /links off");
  }

  getChatData(ctx.chat.id).links = arg === "on";
  saveDB();

  await ctx.reply(
    arg === "on"
      ? "🔒 تم تفعيل منع الروابط."
      : "🔓 تم السماح بالروابط."
  );
});

bot.command("flood", async ctx => {
  if (!isGroup(ctx)) return ctx.reply("استخدم الأمر داخل المجموعة.");
  if (!(await requireAdmin(ctx))) return;

  const arg = ctx.message.text.split(/\s+/)[1]?.toLowerCase();

  if (!["on", "off"].includes(arg)) {
    return ctx.reply("الاستخدام: /flood on أو /flood off");
  }

  getChatData(ctx.chat.id).flood = arg === "on";
  saveDB();

  await ctx.reply(
    arg === "on"
      ? "🛡️ تم تفعيل حماية تكرار الرسائل."
      : "تم تعطيل حماية تكرار الرسائل."
  );
});

bot.command("setwelcome", async ctx => {
  if (!isGroup(ctx)) return ctx.reply("استخدم الأمر داخل المجموعة.");
  if (!(await requireAdmin(ctx))) return;

  const welcome = ctx.message.text
    .replace(/^\/setwelcome(?:@\w+)?\s*/i, "")
    .trim();

  if (!welcome || welcome.length > 500) {
    return ctx.reply(
      "اكتب رسالة من 1 إلى 500 حرف.\n" +
      "استخدم {name} لإظهار اسم العضو."
    );
  }

  getChatData(ctx.chat.id).welcome = welcome;
  saveDB();

  await ctx.reply("✅ تم حفظ رسالة الترحيب.");
});

bot.command("warn", async ctx => {
  if (!isGroup(ctx)) return ctx.reply("استخدم الأمر داخل المجموعة.");
  if (!(await requireAdmin(ctx))) return;

  const target = await getModerationTarget(ctx);
  if (!target) return;

  const chat = getChatData(ctx.chat.id);
  const id = String(target.id);

  chat.warnings[id] = (chat.warnings[id] || 0) + 1;

  const count = chat.warnings[id];
  const max = chat.settings.maxWarnings;

  if (count >= max) {
    try {
      await ctx.telegram.restrictChatMember(ctx.chat.id, target.id, {
        permissions: { can_send_messages: false },
        use_independent_chat_permissions: true,
        until_date: Math.floor(Date.now() / 1000) +
          chat.settings.muteMinutes * 60
      });

      chat.warnings[id] = 0;
      saveDB();

      return ctx.reply(
        `🔇 وصل العضو ${getUserName(target)} إلى الحد الأقصى للتحذيرات.\n` +
        `تم كتمه لمدة ${chat.settings.muteMinutes} دقائق.`
      );
    } catch (error) {
      saveDB();
      return ctx.reply(
        `⚠️ سُجّل التحذير ${count}/${max}، لكن تعذر الكتم.\n` +
        "تأكد أن البوت مشرف ويملك صلاحية تقييد الأعضاء."
      );
    }
  }

  saveDB();

  await ctx.reply(
    `⚠️ تحذير لـ ${getUserName(target)}\n` +
    `عدد التحذيرات: ${count}/${max}`
  );
});

bot.command("warnings", async ctx => {
  if (!isGroup(ctx)) return;

  const target = targetFromReply(ctx);

  if (!target) {
    return ctx.reply("رد على رسالة العضو ثم اكتب /warnings");
  }

  const chat = getChatData(ctx.chat.id);
  const count = chat.warnings[String(target.id)] || 0;

  await ctx.reply(
    `⚠️ تحذيرات ${getUserName(target)}: ` +
    `${count}/${chat.settings.maxWarnings}`
  );
});

bot.command("resetwarn", async ctx => {
  if (!isGroup(ctx)) return;
  if (!(await requireAdmin(ctx))) return;

  const target = await getModerationTarget(ctx);
  if (!target) return;

  const chat = getChatData(ctx.chat.id);
  delete chat.warnings[String(target.id)];
  saveDB();

  await ctx.reply(`✅ تم تصفير تحذيرات ${getUserName(target)}.`);
});

bot.command("ban", async ctx => {
  if (!isGroup(ctx)) return;
  if (!(await requireAdmin(ctx))) return;

  if (!(await isBotAdmin(ctx))) {
    return ctx.reply("❌ يجب منح البوت صلاحية الحظر.");
  }

  const target = await getModerationTarget(ctx);
  if (!target) return;

  try {
    await ctx.telegram.banChatMember(ctx.chat.id, target.id);
    await ctx.reply(`🔨 تم حظر ${getUserName(target)}.`);
  } catch (error) {
    console.error("Ban failed:", error.message);
    await ctx.reply("تعذر الحظر. تحقق من صلاحيات البوت.");
  }
});

bot.command("unban", async ctx => {
  if (!isGroup(ctx)) return;
  if (!(await requireAdmin(ctx))) return;

  const target = targetFromReply(ctx);

  if (!target) {
    return ctx.reply("رد على رسالة العضو ثم اكتب /unban");
  }

  try {
    await ctx.telegram.unbanChatMember(ctx.chat.id, target.id, {
      only_if_banned: true
    });

    await ctx.reply(`✅ تم فك حظر ${getUserName(target)} إن كان محظورًا.`);
  } catch (error) {
    console.error("Unban failed:", error.message);
    await ctx.reply("تعذر فك الحظر. تحقق من صلاحيات البوت.");
  }
});

bot.command("mute", async ctx => {
  if (!isGroup(ctx)) return;
  if (!(await requireAdmin(ctx))) return;

  if (!(await isBotAdmin(ctx))) {
    return ctx.reply("❌ يجب منح البوت صلاحية تقييد الأعضاء.");
  }

  const target = await getModerationTarget(ctx);
  if (!target) return;

  const minutes = Number(ctx.message.text.split(/\s+/)[1] || 10);

  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 10080) {
    return ctx.reply("حدد مدة من 1 إلى 10080 دقيقة.\nمثال: /mute 10");
  }

  try {
    await ctx.telegram.restrictChatMember(ctx.chat.id, target.id, {
      permissions: { can_send_messages: false },
      use_independent_chat_permissions: true,
      until_date: Math.floor(Date.now() / 1000) + minutes * 60
    });

    await ctx.reply(
      `🔇 تم كتم ${getUserName(target)} لمدة ${minutes} دقيقة.`
    );
  } catch (error) {
    console.error("Mute failed:", error.message);
    await ctx.reply("تعذر الكتم. تحقق من صلاحيات البوت.");
  }
});

bot.command("unmute", async ctx => {
  if (!isGroup(ctx)) return;
  if (!(await requireAdmin(ctx))) return;

  const target = await getModerationTarget(ctx);
  if (!target) return;

  try {
    await ctx.telegram.restrictChatMember(ctx.chat.id, target.id, {
      can_send_messages: true,
      can_send_audios: true,
      can_send_documents: true,
      can_send_photos: true,
      can_send_videos: true,
      can_send_video_notes: true,
      can_send_voice_notes: true,
      can_send_polls: true,
      can_send_other_messages: true,
      can_add_web_page_previews: true
    });

    await ctx.reply(`🔊 تم فك كتم ${getUserName(target)}.`);
  } catch (error) {
    console.error("Unmute failed:", error.message);
    await ctx.reply("تعذر فك الكتم. تحقق من صلاحيات البوت.");
  }
});

bot.command("channelinfo", async ctx => {
  if (!["channel", "group", "supergroup"].includes(ctx.chat.type)) {
    return ctx.reply("استخدم الأمر داخل القناة أو المجموعة.");
  }

  if (ctx.chat.type !== "channel" && !(await requireAdmin(ctx))) return;

  let count = "غير متاح";

  try {
    count = await ctx.telegram.getChatMemberCount(ctx.chat.id);
  } catch {
    // Telegram may not provide this information in every context.
  }

  await ctx.reply(
    `📡 معلومات المحادثة\n\n` +
    `الاسم: ${ctx.chat.title || "بدون اسم"}\n` +
    `النوع: ${ctx.chat.type}\n` +
    `المعرّف: ${ctx.chat.id}\n` +
    `عدد الأعضاء: ${count}`
  );
});

bot.command("post", async ctx => {
  if (!isOwner(ctx)) {
    return ctx.reply("⛔ الأمر ده مخصص لمالك البوت فقط.");
  }

  const args = ctx.message.text
    .replace(/^\/post(?:@\w+)?\s*/i, "")
    .trim();

  const separator = args.indexOf(" ");

  if (separator < 1) {
    return ctx.reply(
      "الاستخدام:\n/post @ChannelUsername نص المنشور\n\n" +
      "مثال:\n/post @MyChannel أهلاً بكم في قناتنا!"
    );
  }

  const channel = args.slice(0, separator);
  const postText = args.slice(separator + 1).trim();

  if (!/^@[A-Za-z0-9_]{5,}$/.test(channel)) {
    return ctx.reply(
      "اكتب اسم القناة العامة بصيغة @ChannelUsername."
    );
  }

  if (!postText || postText.length > 4000) {
    return ctx.reply("نص المنشور يجب أن يكون من 1 إلى 4000 حرف.");
  }

  try {
    const chat = await ctx.telegram.getChat(channel);

    if (chat.type !== "channel") {
      return ctx.reply("المعرّف ده مش قناة تليجرام.");
    }

    const member = await ctx.telegram.getChatMember(
      chat.id,
      ctx.botInfo.id
    );

    if (
      !["creator", "administrator"].includes(member.status) ||
      (member.status === "administrator" && !member.can_post_messages)
    ) {
      return ctx.reply(
        "❌ البوت ليس لديه صلاحية نشر المنشورات في القناة."
      );
    }

    await ctx.telegram.sendMessage(chat.id, postText);

    await ctx.reply(
      `✅ تم إرسال المنشور إلى ${channel} بنجاح.`
    );
  } catch (error) {
    console.error("Channel post failed:", error.message);

    await ctx.reply(
      "❌ تعذر النشر. تحقق من اسم القناة وصلاحيات البوت."
    );
  }
});


// استقبال الأعضاء الجدد.
bot.on("new_chat_members", async ctx => {
  if (!isGroup(ctx)) return;

  const chat = getChatData(ctx.chat.id);

  for (const user of ctx.message.new_chat_members) {
    if (user.id === ctx.botInfo.id) {
      await ctx.reply(
        "👑 تم إضافة FARAG AI!\n" +
        "امنحني الصلاحيات اللازمة ثم استخدم /help."
      );
      continue;
    }

    const name = escapeHTML(getUserName(user));
    const welcome = chat.welcome.replace(/\{name\}/g, name);

    await ctx.replyWithHTML(welcome);
  }
});

// حماية أساسية من الروابط والرسائل المتكررة.
const recentMessages = new Map();

bot.on("message", async (ctx, next) => {
  const msg = ctx.message;

  if (!msg || !ctx.from || ctx.from.is_bot) return next();

  ensureUser(ctx.from);

  if (!isGroup(ctx)) return next();

  const chat = getChatData(ctx.chat.id);
  const userId = String(ctx.from.id);

  // لا تطبق الحماية على مشرفي المجموعة.
  if (await isAdmin(ctx, ctx.from.id)) return next();

  const text = msg.text || msg.caption || "";

  const hasLink =
    /https?:\/\/|www\.|t\.me\/|telegram\.me\//i.test(text) ||
    Boolean(msg.entities?.some(e => e.type === "url" || e.type === "text_link")) ||
    Boolean(msg.caption_entities?.some(e => e.type === "url" || e.type === "text_link"));

  if (chat.links && hasLink) {
    if (!(await isBotAdmin(ctx))) return next();

    try {
      await ctx.deleteMessage();
      db.stats.blocked++;
      saveDB();
    } catch (error) {
      console.error("Link deletion failed:", error.message);
    }

    return;
  }

  if (chat.flood) {
    const key = `${ctx.chat.id}:${userId}`;
    const now = Date.now();
    const old = recentMessages.get(key) || [];
    const fresh = old.filter(time => now - time < 6000);

    fresh.push(now);
    recentMessages.set(key, fresh);

    if (fresh.length >= 6) {
      if (await isBotAdmin(ctx)) {
        try {
          await ctx.deleteMessage();
          db.stats.blocked++;
          saveDB();
        } catch (error) {
          console.error("Flood deletion failed:", error.message);
        }
      }

      return;
    }
  }

  db.stats.messages++;
  saveDB();

  return next();
});

// استقبال منشورات القنوات. لا يحذف أو يعدل أي منشور تلقائيًا.
bot.on("channel_post", async ctx => {
  console.log(
    `📡 منشور قناة تمت مشاهدته: ${ctx.chat.title || ctx.chat.id}`
  );
});

bot.catch((error, ctx) => {
  console.error("Bot handler error:", error.message);
});

async function main() {
  try {
    const me = await bot.telegram.getMe();

    console.log("==================================");
    console.log("👑 FARAG AI بدأ التشغيل");
    console.log(`🤖 الاسم: ${me.first_name}`);
    console.log(`🔗 Username: @${me.username}`);
    console.log(`🧠 AI: ${AI_ENABLED && GROQ_API_KEY ? "مفعّل" : "متوقف"}`);
    console.log("==================================");

    await bot.launch({
      allowedUpdates: [
        "message",
        "callback_query",
        "channel_post",
        "my_chat_member"
      ]
    });
  } catch (error) {
    console.error("❌ فشل تشغيل FARAG AI:", error.message);
    process.exitCode = 1;
  }
}

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));

main();

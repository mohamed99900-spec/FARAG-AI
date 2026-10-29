require("dotenv").config();
// Render Web Service health server
const httpServer = require("node:http").createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      status: "ok",
      bot: "FARAG AI"
    }));
    return;
  }

  res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("FARAG AI is running!");
});

const PORT = Number(process.env.PORT || 10000);

httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`🌐 HTTP server listening on port ${PORT}`);
});
const { Telegraf, Markup } = require("telegraf");
const db = require("./db");
const { askAI } = require("./ai");
const { containsLink, getFloodState } = require("./moderation");
const {
  mainKeyboard,
  backKeyboard,
  moderationKeyboard
} = require("./keyboards");

const TOKEN = process.env.BOT_TOKEN;
const OWNER_ID = Number(process.env.OWNER_ID || 0);

if (!TOKEN) {
  console.error("❌ BOT_TOKEN غير موجود في .env");
  process.exit(1);
}

if (!Number.isSafeInteger(OWNER_ID) || OWNER_ID <= 0) {
  console.error("❌ ضع OWNER_ID الصحيح في .env قبل التشغيل.");
  process.exit(1);
}

const bot = new Telegraf(TOKEN);
const flood = getFloodState();

const gameSessions = new Map();
const personalityCooldowns = new Map();

const QUIZZES = [
  { question: "كم عدد أركان الإسلام؟", options: ["3", "5", "6", "7"], answer: 1 },
  { question: "ما الكوكب المعروف بالكوكب الأحمر؟", options: ["المريخ", "الزهرة", "زحل", "عطارد"], answer: 0 },
  { question: "ما عاصمة اليابان؟", options: ["بكين", "سيول", "طوكيو", "بانكوك"], answer: 2 },
  { question: "كم ضلعًا للمثلث؟", options: ["2", "3", "4", "5"], answer: 1 },
  { question: "ما أكبر كوكب في المجموعة الشمسية؟", options: ["الأرض", "المشتري", "المريخ", "نبتون"], answer: 1 },
  { question: "كم يومًا في السنة العادية؟", options: ["360", "364", "365", "366"], answer: 2 },
  { question: "ما عاصمة مصر؟", options: ["القاهرة", "الإسكندرية", "الأقصر", "أسوان"], answer: 0 },
  { question: "كم دقيقة في الساعة؟", options: ["30", "45", "60", "100"], answer: 2 },
  { question: "ما الحيوان المعروف بسفينة الصحراء؟", options: ["الحصان", "الجمل", "الفيل", "الغزال"], answer: 1 },
  { question: "ما الغاز الذي تمتصه النباتات من الهواء؟", options: ["الأكسجين", "الهيدروجين", "ثاني أكسيد الكربون", "النيتروجين"], answer: 2 },
  { question: "كم عدد قارات العالم وفق التقسيم الشائع؟", options: ["5", "6", "7", "8"], answer: 2 },
  { question: "ما أقرب نجم إلى الأرض؟", options: ["الشمس", "الشعرى", "القمر", "سهيل"], answer: 0 }
];

const RIDDLES = [
  { question: "إيه اللي له أسنان ومابيعضش؟", options: ["المشط", "الأسد", "الكلب"], answer: 0 },
  { question: "إيه اللي كل ما تاخد منه يكبر؟", options: ["الفلوس", "الحفرة", "البحر"], answer: 1 },
  { question: "إيه اللي بيكتب ومابيعرفش يقرأ؟", options: ["القلم", "الكتاب", "المدرس"], answer: 0 },
  { question: "إيه اللي له عين واحدة ومابيشفش؟", options: ["الإبرة", "القطة", "العصفور"], answer: 0 },
  { question: "إيه اللي بيجري ومامعندوش رجلين؟", options: ["الطفل", "الماء", "الحصان"], answer: 1 },
  { question: "إيه اللي كل ما يزيد ينقص؟", options: ["العمر المتبقي", "المال", "الطول"], answer: 0 },
  { question: "إيه اللي بنشوفه في الليل 3 مرات وفي النهار مرة؟", options: ["حرف اللام", "القمر", "النجوم"], answer: 0 }
];

const MATH_QUESTIONS = [
  { question: "7 + 8 = ؟", options: ["14", "15", "16", "17"], answer: 1 },
  { question: "9 × 6 = ؟", options: ["45", "54", "56", "63"], answer: 1 },
  { question: "100 - 37 = ؟", options: ["63", "67", "73", "53"], answer: 0 },
  { question: "12 × 4 = ؟", options: ["36", "42", "48", "52"], answer: 2 },
  { question: "81 ÷ 9 = ؟", options: ["7", "8", "9", "10"], answer: 2 },
  { question: "15 + 27 = ؟", options: ["32", "42", "43", "52"], answer: 1 },
  { question: "144 ÷ 12 = ؟", options: ["10", "11", "12", "14"], answer: 2 }
];

function isGroup(ctx) {
  return ["group", "supergroup"].includes(ctx.chat?.type);
}

function isOwner(ctx) {
  return Number(ctx.from?.id) === OWNER_ID;
}

async function isAdmin(ctx, userId = ctx.from?.id) {
  if (Number(userId) === OWNER_ID) return true;
  if (!ctx.chat || !userId || ctx.chat.type === "private") return false;

  try {
    const member = await ctx.telegram.getChatMember(ctx.chat.id, userId);
    return ["creator", "administrator"].includes(member.status);
  } catch {
    return false;
  }
}

async function isBotAdmin(ctx) {
  try {
    const member = await ctx.telegram.getChatMember(ctx.chat.id, ctx.botInfo.id);
    return ["creator", "administrator"].includes(member.status);
  } catch {
    return false;
  }
}

async function requireAdmin(ctx) {
  if (await isAdmin(ctx)) return true;
  await ctx.reply("⛔ الأمر ده متاح لمشرفي المجموعة فقط.");
  return false;
}

bot.command("purge", async ctx => {
  try {
    if (!ctx.chat || !["group", "supergroup"].includes(ctx.chat.type)) {
      return ctx.reply("❌ الأمر ده متاح داخل المجموعات فقط.");
    }

    if (!(await isAdmin(ctx))) {
      return ctx.reply("❌ الأمر ده للمشرفين فقط.");
    }

    if (!(await isBotAdmin(ctx))) {
      return ctx.reply("❌ لازم البوت يكون مشرفًا مع صلاحية حذف الرسائل.");
    }

    const count = Number(ctx.message.text.split(/\s+/)[1]);

    if (!Number.isInteger(count) || count < 1 || count > 1000) {
      return ctx.reply("استخدم الأمر بالشكل ده:\n/purge 100\nالحد الأقصى 1000 رسالة.");
    }

    const repliedMessageId = ctx.message.reply_to_message?.message_id;

    if (!repliedMessageId) {
      return ctx.reply(
        "↩️ ردّ على رسالة من المكان اللي عايز تبدأ المسح منه، وبعدها اكتب:\n/purge 100"
      );
    }

    const startId = repliedMessageId;
    const endId = ctx.message.message_id;
    const firstId = Math.max(startId, endId - count);

    let deleted = 0;
    let failed = 0;

    for (let id = firstId; id <= endId; id++) {
      try {
        await ctx.telegram.deleteMessage(ctx.chat.id, id);
        deleted++;
      } catch {
        failed++;
      }

      if (id % 25 === 0) {
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }

    try {
      await ctx.reply(
        `🧹 انتهى التنظيف.\n✅ رسائل محذوفة: ${deleted}\n⚠️ رسائل تعذر حذفها: ${failed}`
      );
    } catch {
      // قد تكون رسالة الأمر نفسها حُذفت أثناء العملية.
    }
  } catch (error) {
    console.error("Purge error:", error.message);
  }
});

function targetFromReply(ctx) {
  const target = ctx.message?.reply_to_message?.from;
  if (!target || target.is_bot || target.id === ctx.botInfo.id) return null;
  return target;
}

async function getTarget(ctx) {
  const target = targetFromReply(ctx);

  if (!target) {
    await ctx.reply("رد على رسالة العضو المطلوب ثم أرسل الأمر.");
    return null;
  }

  if (target.id === ctx.from.id) {
    await ctx.reply("❌ لا يمكنك تنفيذ هذا الإجراء على نفسك.");
    return null;
  }

  try {
    const member = await ctx.telegram.getChatMember(ctx.chat.id, target.id);

    if (["creator", "administrator"].includes(member.status)) {
      await ctx.reply("❌ لا يمكن تنفيذ هذا الإجراء على مشرف.");
      return null;
    }
  } catch {
    await ctx.reply("تعذر التحقق من حالة العضو. لم يُنفذ الإجراء.");
    return null;
  }

  return target;
}

function record(chatId, actorId, targetId, action, details = "") {
  db.logEvent(chatId, actorId, targetId, action, details);
}

function safeName(user) {
  return [user.first_name, user.last_name].filter(Boolean).join(" ") ||
    user.username || "عضو";
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/[؟?!.,،؛:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function randomItem(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function personalityReply(text) {
  const value = normalize(text);

  if (
    /^(بتحبني|تحبني|انت بتحبني|انتا بتحبني)( يا)? فرج$/.test(value) ||
    /بتحبني يا فرج/.test(value)
  ) {
    return randomItem([
      "وأنت مالك يا عم 😂❤️",
      "إنت حبيبي يا نجم ❤️🫶",
      "حب إيه بس، هاتلي شاي الأول ☕😂",
      "يا عم ده سؤال محرج في الجروب كله 😂"
    ]);
  }

  if (/^(يا )?فرج$/.test(value) || /^يا فرج\b/.test(value)) {
    return randomItem([
      "أيوه يا حبيبي، فرج معاك 😂",
      "عيون فرج يا نجم 👀❤️",
      "ناديتني يا أسطورة؟ 😎",
      "خير يا عم، مين مزعلك؟ 😂",
      "يا قلب فرج ❤️"
    ]);
  }

  if (/^(فرج فين|فين فرج|حد شاف فرج)$/.test(value)) {
    return randomItem([
      "أهو يا عم، كنت بتدور عليا ليه؟ 😂",
      "فرج موجود، بس عامل نفسه مش واخد باله 😎",
      "كنت بجيب شاي، فيه حاجة؟ ☕"
    ]);
  }

  if (/^(صباح الخير|صباح النور|صباح الفل)$/.test(value)) {
    return randomItem([
      "صباح الفل والياسمين على أحلى جروب 🌞🌷",
      "صباحكم ضحكة ورزق وخير ❤️"
    ]);
  }

  if (/^(مساء الخير|مساء النور|مساء الفل)$/.test(value)) {
    return randomItem([
      "مساء الفل على الناس الرايقة 🌙❤️",
      "مساء الضحكة الحلوة يا أحلى جروب 🫶"
    ]);
  }

  if (/^(شكرا|تسلم|تسلم يا فرج)$/.test(value)) {
    return randomItem([
      "حبيبي يا نجم، ده واجب فرج ❤️",
      "تؤمر يا كبير 😎",
      "ولا يهمك يا غالي 🫶"
    ]);
  }

  if (/^(هههه+|😂+|🤣+)$/.test(value)) {
    return randomItem([
      "ضحكتك بالدنيا يا نجم 😂",
      "الجروب قلب ستاند أب كوميدي 😂🔥"
    ]);
  }

  return null;
}

async function syncChat(ctx) {
  if (ctx.chat && ctx.chat.type !== "private") {
    db.ensureChat(ctx.chat);
  }
}

async function showHome(ctx, edit = false) {
  const text =
    "👑 <b>FARAG AI</b>\n\n" +
    "مساعدك الذكي لإدارة المجموعات والقنوات.\n" +
    "ذكاء اصطناعي، حماية، ألعاب ونقاط — كله في مكان واحد.\n\n" +
    "اختار القسم المطلوب:";

  if (edit) {
    try {
      await ctx.editMessageText(text, {
        parse_mode: "HTML",
        ...mainKeyboard()
      });
      return;
    } catch (error) {
      if (String(error.description || "").includes("message is not modified")) {
        return;
      }
    }
  }

  await ctx.reply(text, {
    parse_mode: "HTML",
    ...mainKeyboard()
  });
}

function gamesKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("🧠 معلومات عامة", "game:start:quiz"),
      Markup.button.callback("🧩 فوازير", "game:start:riddle")
    ],
    [
      Markup.button.callback("⚡ حساب سريع", "game:start:math"),
      Markup.button.callback("🎯 خمن الرقم", "game:start:number")
    ],
    [
      Markup.button.callback("🏆 المتصدرون", "game:top"),
      Markup.button.callback("💰 نقاطي", "game:points")
    ],
    [Markup.button.callback("⬅️ القائمة الرئيسية", "menu:home")]
  ]);
}

async function showGames(ctx, edit = false) {
  const text =
    "🎮 <b>مركز ألعاب فرج</b>\n\n" +
    "🧠 معلومات عامة — +10 نقاط\n" +
    "🧩 فوازير مصرية — +10 نقاط\n" +
    "⚡ حساب سريع — +10 نقاط\n" +
    "🎯 خمن رقم من 1 إلى 5 — +10 نقاط\n\n" +
    "الجولات صالحة لمدة 5 دقائق، وأول إجابة صحيحة تكسب.";

  if (edit) {
    try {
      await ctx.editMessageText(text, {
        parse_mode: "HTML",
        ...gamesKeyboard()
      });
      return;
    } catch (error) {
      if (String(error.description || "").includes("message is not modified")) {
        return;
      }
    }
  }

  await ctx.reply(text, {
    parse_mode: "HTML",
    ...gamesKeyboard()
  });
}

function createSession(ctx, type, data = {}) {
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

  gameSessions.set(id, {
    id,
    type,
    chatId: String(ctx.chat.id),
    ownerId: ctx.from.id,
    answered: new Set(),
    expiresAt: Date.now() + 5 * 60 * 1000,
    ...data
  });

  return id;
}

async function startQuestion(ctx, type) {
  const list =
    type === "quiz" ? QUIZZES :
    type === "riddle" ? RIDDLES :
    MATH_QUESTIONS;

  const question = randomItem(list);
  const id = createSession(ctx, type, {
    question,
    winner: false
  });

  const heading =
    type === "quiz" ? "🧠 مسابقة معلومات عامة" :
    type === "riddle" ? "🧩 فزورة فرج" :
    "⚡ تحدي الحساب";

  const buttons = question.options.map((option, index) => [
    Markup.button.callback(option, `game:answer:${id}:${index}`)
  ]);

  buttons.push([
    Markup.button.callback("❌ إلغاء الجولة", `game:cancel:${id}`)
  ]);

  await ctx.reply(
    `${heading}\n\n${question.question}\n\n` +
    "🏆 أول إجابة صحيحة تكسب 10 نقاط!\n⏳ الجولة لمدة 5 دقائق.",
    Markup.inlineKeyboard(buttons)
  );
}

async function startNumberGame(ctx) {
  const secret = Math.floor(Math.random() * 5) + 1;
  const id = createSession(ctx, "number", {
    secret,
    winner: false
  });

  await ctx.reply(
    "🎯 <b>خمن الرقم</b>\n\nفرج اختار رقم من 1 إلى 5.\n" +
    "أول واحد يختاره صح يكسب 10 نقاط!",
    {
      parse_mode: "HTML",
      ...Markup.inlineKeyboard([
        [1, 2, 3, 4, 5].map(n =>
          Markup.button.callback(String(n), `game:guess:${id}:${n}`)
        ),
        [Markup.button.callback("❌ إلغاء الجولة", `game:cancel:${id}`)]
      ])
    }
  );
}

async function showTop(ctx) {
  const top = db.topUsers();

  if (!top.length) {
    return ctx.reply("لسه مفيش نقاط. ابدأ اللعب يا بطل! 🎮");
  }

  const medals = ["🥇", "🥈", "🥉"];

  await ctx.reply(
    "🏆 <b>أبطال FARAG AI</b>\n\n" +
    top.map((user, i) =>
      `${medals[i] || `${i + 1}.`} ${escapeHtml(user.name)} — ${user.points} نقطة`
    ).join("\n"),
    { parse_mode: "HTML" }
  );
}

bot.start(async ctx => {
  db.incrementStat("commands");
  await showHome(ctx);
});

bot.command("help", async ctx => {
  db.incrementStat("commands");

  await ctx.reply(
    "📚 <b>أوامر FARAG AI</b>\n\n" +
    "<b>عام:</b>\n" +
    "/start — القائمة الرئيسية\n" +
    "/help — المساعدة\n" +
    "/id — المعرفات\n" +
    "/ai سؤالك — الذكاء الاصطناعي\n" +
    "/daily — مكافأة يومية\n" +
    "/points — رصيدك\n" +
    "/top — ترتيب النقاط\n" +
    "/games — مركز الألعاب\n" +
    "/quiz — معلومات عامة\n" +
    "/riddle — فوازير\n" +
    "/math — حساب سريع\n" +
    "/guess — خمن الرقم\n\n" +
    "<b>للمشرفين:</b>\n" +
    "/stats — إحصائيات\n" +
    "/settings — الإعدادات\n" +
    "/links on|off — التحكم بالروابط\n" +
    "/flood on|off — حماية التكرار\n" +
    "/setwelcome نص — تعديل الترحيب\n" +
    "/warn و/warnings و/resetwarn — التحذيرات\n" +
    "/ban و/unban — الحظر\n" +
    "/mute 10 و/unmute — الكتم\n\n" +
    "<b>لمالك البوت:</b>\n" +
    "/post @ChannelUsername نص المنشور",
    { parse_mode: "HTML" }
  );
});

bot.command("id", async ctx => {
  const target = targetFromReply(ctx);

  await ctx.reply(
    `🆔 معرفك: ${ctx.from.id}\n💬 معرف المحادثة: ${ctx.chat.id}` +
    (target ? `\n👤 معرف العضو المشار إليه: ${target.id}` : "")
  );
});

bot.action("menu:home", async ctx => {
  await ctx.answerCbQuery();
  await showHome(ctx, true);
});

const menuContent = {
  security: "🛡️ <b>الحماية</b>\n\nتحكم في منع الروابط وحماية التكرار. يجب أن يكون البوت مشرفًا ليحذف الرسائل المخالفة.",
  admin: "👥 <b>إدارة الأعضاء</b>\n\nرد على رسالة العضو ثم استخدم /ban أو /mute أو /warn. لفك الحظر أو الكتم استخدم /unban أو /unmute.",
  ai: "🧠 <b>الذكاء الاصطناعي</b>\n\nاستخدم /ai ثم اكتب سؤالك. يتطلب إعداد GROQ_API_KEY وتفعيل AI_ENABLED في .env.",
  stats: "📊 <b>الإحصائيات</b>\n\nاستخدم /stats داخل المجموعة لعرض إحصائياتها المسجلة.",
  points: "🏆 <b>النقاط</b>\n\n/daily — مكافأة يومية 20 نقطة\n/points — رصيدك\n/top — أفضل 10 أعضاء",
  games: "🎮 <b>ألعاب فرج</b>\n\nاختار مسابقة أو فزورة أو تحدي حساب، واكسب النقاط مع الجروب.",
  settings: "⚙️ <b>إعدادات المجموعة</b>\n\nاستخدم /settings داخل المجموعة. تعديل الإعدادات متاح للمشرفين فقط.",
  help: "📚 <b>المساعدة</b>\n\nاستخدم /help لرؤية قائمة الأوامر كاملة."
};

bot.action(/^menu:(.+)$/, async ctx => {
  await ctx.answerCbQuery();

  const section = ctx.match[1];

  if (section === "games") {
    return showGames(ctx, true);
  }

  const text = menuContent[section];

  if (!text) {
    return showHome(ctx, true);
  }

  const keyboard =
    section === "security" ? moderationKeyboard() :
    backKeyboard();

  await ctx.editMessageText(text, {
    parse_mode: "HTML",
    ...keyboard
  });
});

bot.action(/^toggle:(links|flood)$/, async ctx => {
  if (!isGroup(ctx)) {
    return ctx.answerCbQuery("افتح القائمة داخل مجموعة أولًا.", {
      show_alert: true
    });
  }

  if (!(await isAdmin(ctx))) {
    return ctx.answerCbQuery("المشرفون فقط يمكنهم تغيير الإعدادات.", {
      show_alert: true
    });
  }

  const chat = db.getChat(ctx.chat);
  const field = ctx.match[1] === "links" ? "links_enabled" : "flood_enabled";
  const nextValue = chat[field] ? 0 : 1;

  db.updateChat(ctx.chat.id, {
    welcome: chat.welcome,
    links_enabled: field === "links" ? nextValue : chat.links_enabled,
    flood_enabled: field === "flood" ? nextValue : chat.flood_enabled,
    max_warnings: chat.max_warnings,
    mute_minutes: chat.mute_minutes
  });

  record(ctx.chat.id, ctx.from.id, null, "setting_changed", `${field}=${nextValue}`);

  await ctx.answerCbQuery(nextValue ? "تم التفعيل" : "تم الإيقاف");

  const linksValue =
    field === "links" ? nextValue : chat.links_enabled;

  const floodValue =
    field === "flood" ? nextValue : chat.flood_enabled;

  await ctx.editMessageText(
    `🛡️ إعدادات الحماية\n\n🔗 منع الروابط: ${linksValue ? "مفعّل" : "متوقف"}\n` +
    `🔁 حماية التكرار: ${floodValue ? "مفعّلة" : "متوقفة"}`,
    moderationKeyboard()
  );
});

bot.command("settings", async ctx => {
  if (!isGroup(ctx)) return ctx.reply("استخدم الأمر داخل المجموعة.");
  if (!(await requireAdmin(ctx))) return;

  const chat = db.getChat(ctx.chat);

  await ctx.reply(
    `⚙️ إعدادات ${chat.title || "المجموعة"}\n\n` +
    `🔗 منع الروابط: ${chat.links_enabled ? "مفعّل" : "متوقف"}\n` +
    `🔁 حماية التكرار: ${chat.flood_enabled ? "مفعّلة" : "متوقفة"}\n` +
    `⚠️ حد التحذيرات: ${chat.max_warnings}\n` +
    `🔇 مدة الكتم التلقائي: ${chat.mute_minutes} دقيقة`
  );
});

bot.command("links", async ctx => {
  if (!isGroup(ctx)) return ctx.reply("استخدم الأمر داخل المجموعة.");
  if (!(await requireAdmin(ctx))) return;

  const arg = ctx.message.text.split(/\s+/)[1]?.toLowerCase();

  if (!["on", "off"].includes(arg)) {
    return ctx.reply("الاستخدام: /links on أو /links off");
  }

  const chat = db.getChat(ctx.chat);

  db.updateChat(ctx.chat.id, {
    welcome: chat.welcome,
    links_enabled: arg === "on" ? 1 : 0,
    flood_enabled: chat.flood_enabled,
    max_warnings: chat.max_warnings,
    mute_minutes: chat.mute_minutes
  });

  record(ctx.chat.id, ctx.from.id, null, "links_setting", arg);

  await ctx.reply(
    arg === "on" ? "🔒 منع الروابط مفعّل." : "🔓 منع الروابط متوقف."
  );
});

bot.command("flood", async ctx => {
  if (!isGroup(ctx)) return ctx.reply("استخدم الأمر داخل المجموعة.");
  if (!(await requireAdmin(ctx))) return;

  const arg = ctx.message.text.split(/\s+/)[1]?.toLowerCase();

  if (!["on", "off"].includes(arg)) {
    return ctx.reply("الاستخدام: /flood on أو /flood off");
  }

  const chat = db.getChat(ctx.chat);

  db.updateChat(ctx.chat.id, {
    welcome: chat.welcome,
    links_enabled: chat.links_enabled,
    flood_enabled: arg === "on" ? 1 : 0,
    max_warnings: chat.max_warnings,
    mute_minutes: chat.mute_minutes
  });

  record(ctx.chat.id, ctx.from.id, null, "flood_setting", arg);

  await ctx.reply(
    arg === "on" ? "🛡️ حماية التكرار مفعّلة." : "حماية التكرار متوقفة."
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
      "اكتب رسالة ترحيب من 1 إلى 500 حرف. استخدم {name} للاسم."
    );
  }

  const chat = db.getChat(ctx.chat);

  db.updateChat(ctx.chat.id, {
    welcome,
    links_enabled: chat.links_enabled,
    flood_enabled: chat.flood_enabled,
    max_warnings: chat.max_warnings,
    mute_minutes: chat.mute_minutes
  });

  record(ctx.chat.id, ctx.from.id, null, "welcome_changed");

  await ctx.reply("✅ تم حفظ رسالة الترحيب.");
});

bot.command("stats", async ctx => {
  if (isGroup(ctx) && !(await requireAdmin(ctx))) return;

  if (ctx.chat.type === "private" && !isOwner(ctx)) {
    return ctx.reply("الإحصائيات العامة متاحة لمالك البوت فقط.");
  }

  const globalMessages = db.getStat("messages");
  const globalBlocked = db.getStat("blocked");
  const globalCommands = db.getStat("commands");

  let groupInfo = "";

  if (isGroup(ctx)) {
    const chat = db.getChat(ctx.chat);
    const events = db.recentEvents(ctx.chat.id);

    groupInfo =
      `\n\n<b>هذه المجموعة</b>\nالاسم: ${escapeHtml(ctx.chat.title || "بدون اسم")}\n` +
      `منع الروابط: ${chat.links_enabled ? "مفعّل" : "متوقف"}\n` +
      `حماية التكرار: ${chat.flood_enabled ? "مفعّلة" : "متوقفة"}\n` +
      `الأحداث المسجلة مؤخرًا: ${events.length}`;
  }

  await ctx.reply(
    `<b>📊 إحصائيات FARAG AI</b>\n\nالرسائل المعالجة: ${globalMessages}\n` +
    `الأوامر المسجلة: ${globalCommands}\n` +
    `الرسائل المحذوفة بواسطة الحماية: ${globalBlocked}${groupInfo}`,
    { parse_mode: "HTML" }
  );
});

bot.command("warn", async ctx => {
  if (!isGroup(ctx)) return ctx.reply("استخدم الأمر داخل المجموعة.");
  if (!(await requireAdmin(ctx))) return;

  const target = targetFromReply(ctx);

  if (!target) {
    return ctx.reply("رد على رسالة العضو ثم اكتب /warn.");
  }

  const verifiedTarget = await getTarget(ctx);
  if (!verifiedTarget) return;

  const chat = db.getChat(ctx.chat);
  const count = db.getWarnings(ctx.chat.id, target.id) + 1;

  db.setWarnings(ctx.chat.id, target.id, count);
  record(ctx.chat.id, ctx.from.id, target.id, "warn", `count=${count}`);

  if (count >= chat.max_warnings) {
    if (!(await isBotAdmin(ctx))) {
      return ctx.reply(
        `⚠️ التحذير ${count}/${chat.max_warnings} سُجّل، لكن البوت ليس مشرفًا ولا يستطيع الكتم.`
      );
    }

    try {
      await ctx.telegram.restrictChatMember(ctx.chat.id, target.id, {
        permissions: { can_send_messages: false },
        until_date: Math.floor(Date.now() / 1000) + chat.mute_minutes * 60
      });

      db.clearWarnings(ctx.chat.id, target.id);

      record(
        ctx.chat.id,
        ctx.from.id,
        target.id,
        "auto_mute",
        `${chat.mute_minutes} minutes`
      );

      return ctx.reply(
        `🔇 وصل ${safeName(target)} للحد الأقصى للتحذيرات وتم كتمه ${chat.mute_minutes} دقيقة.`
      );
    } catch (error) {
      console.error("Auto mute failed:", error.message);
      return ctx.reply("سُجّل التحذير، لكن تعذر الكتم. راجع صلاحيات البوت.");
    }
  }

  await ctx.reply(`⚠️ تحذير ${safeName(target)}: ${count}/${chat.max_warnings}`);
});

bot.command("warnings", async ctx => {
  if (!isGroup(ctx)) return;
  if (!(await requireAdmin(ctx))) return;

  const target = targetFromReply(ctx);

  if (!target) {
    return ctx.reply("رد على رسالة العضو ثم اكتب /warnings.");
  }

  const count = db.getWarnings(ctx.chat.id, target.id);
  const chat = db.getChat(ctx.chat);

  await ctx.reply(
    `⚠️ تحذيرات ${safeName(target)}: ${count}/${chat.max_warnings}`
  );
});

bot.command("resetwarn", async ctx => {
  if (!isGroup(ctx)) return;
  if (!(await requireAdmin(ctx))) return;

  const target = await getTarget(ctx);
  if (!target) return;

  db.clearWarnings(ctx.chat.id, target.id);
  record(ctx.chat.id, ctx.from.id, target.id, "reset_warnings");

  await ctx.reply(`✅ تم تصفير تحذيرات ${safeName(target)}.`);
});

bot.command("ban", async ctx => {
  if (!isGroup(ctx)) return;
  if (!(await requireAdmin(ctx))) return;

  if (!(await isBotAdmin(ctx))) {
    return ctx.reply("يجب ترقية البوت إلى مشرف ومنحه صلاحية الحظر.");
  }

  const target = await getTarget(ctx);
  if (!target) return;

  try {
    await ctx.telegram.banChatMember(ctx.chat.id, target.id);

    record(ctx.chat.id, ctx.from.id, target.id, "ban");

    await ctx.reply(`🔨 تم حظر ${safeName(target)}.`);
  } catch (error) {
    console.error("Ban failed:", error.message);
    await ctx.reply("تعذر الحظر. تأكد من الصلاحيات ورتبة العضو المستهدف.");
  }
});

bot.command("unban", async ctx => {
  if (!isGroup(ctx)) return;
  if (!(await requireAdmin(ctx))) return;

  const target = targetFromReply(ctx);

  if (!target) {
    return ctx.reply("رد على رسالة العضو ثم اكتب /unban.");
  }

  if (target.id === ctx.from.id) {
    return ctx.reply("لا يمكنك تنفيذ الأمر على نفسك.");
  }

  try {
    const member = await ctx.telegram.getChatMember(ctx.chat.id, target.id);

    if (["creator", "administrator"].includes(member.status)) {
      return ctx.reply("لا يمكن فك حظر حساب بهذه الرتبة.");
    }
  } catch {
    // قد لا يكون العضو المحظور موجودًا في المجموعة.
  }

  try {
    await ctx.telegram.unbanChatMember(ctx.chat.id, target.id, {
      only_if_banned: true
    });

    record(ctx.chat.id, ctx.from.id, target.id, "unban");

    await ctx.reply(`✅ تم تنفيذ طلب فك الحظر عن ${safeName(target)}.`);
  } catch (error) {
    console.error("Unban failed:", error.message);
    await ctx.reply("تعذر فك الحظر. تحقق من الصلاحيات.");
  }
});

bot.command("mute", async ctx => {
  if (!isGroup(ctx)) return;
  if (!(await requireAdmin(ctx))) return;

  if (!(await isBotAdmin(ctx))) {
    return ctx.reply("يجب منح البوت صلاحية تقييد الأعضاء.");
  }

  const target = await getTarget(ctx);
  if (!target) return;

  const minutes = Number(ctx.message.text.split(/\s+/)[1] || 10);

  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 10080) {
    return ctx.reply("حدد مدة بين دقيقة و10080 دقيقة. مثال: /mute 10");
  }

  try {
    await ctx.telegram.restrictChatMember(ctx.chat.id, target.id, {
      permissions: { can_send_messages: false },
      until_date: Math.floor(Date.now() / 1000) + minutes * 60
    });

    record(ctx.chat.id, ctx.from.id, target.id, "mute", `${minutes} minutes`);

    await ctx.reply(`🔇 تم كتم ${safeName(target)} لمدة ${minutes} دقيقة.`);
  } catch (error) {
    console.error("Mute failed:", error.message);
    await ctx.reply("تعذر الكتم. تحقق من صلاحيات البوت.");
  }
});

bot.command("unmute", async ctx => {
  if (!isGroup(ctx)) return;
  if (!(await requireAdmin(ctx))) return;

  const target = await getTarget(ctx);
  if (!target) return;

  try {
    await ctx.telegram.restrictChatMember(ctx.chat.id, target.id, {
      permissions: {
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
      }
    });

    record(ctx.chat.id, ctx.from.id, target.id, "unmute");

    await ctx.reply(`🔊 تم فك الكتم عن ${safeName(target)}.`);
  } catch (error) {
    console.error("Unmute failed:", error.message);
    await ctx.reply("تعذر فك الكتم. تحقق من صلاحيات البوت.");
  }
});

bot.command("daily", async ctx => {
  const user = db.ensureUser(ctx.from);
  const day = new Date().toISOString().slice(0, 10);

  if (!db.claimDaily(user.user_id, day)) {
    return ctx.reply("⏳ حصلت على مكافأتك اليومية بالفعل. ارجع غدًا.");
  }

  const updated = db.getUser(user.user_id);

  await ctx.reply(`🎁 حصلت على 20 نقطة!\n🏆 رصيدك الآن: ${updated.points}`);
});

bot.command("points", async ctx => {
  const user = db.ensureUser(ctx.from);

  await ctx.reply(`🏆 ${user.name}\nرصيدك: ${user.points} نقطة`);
});

bot.command("top", showTop);

bot.command("games", ctx => showGames(ctx));
bot.command("quiz", ctx => startQuestion(ctx, "quiz"));
bot.command("riddle", ctx => startQuestion(ctx, "riddle"));
bot.command("math", ctx => startQuestion(ctx, "math"));
bot.command("guess", ctx => startNumberGame(ctx));

bot.action(/^game:start:(quiz|riddle|math|number)$/, async ctx => {
  await ctx.answerCbQuery();

  if (ctx.match[1] === "number") {
    return startNumberGame(ctx);
  }

  return startQuestion(ctx, ctx.match[1]);
});

bot.action("game:top", async ctx => {
  await ctx.answerCbQuery();
  await showTop(ctx);
});

bot.action("game:points", async ctx => {
  await ctx.answerCbQuery();

  const user = db.ensureUser(ctx.from);

  await ctx.reply(
    `💰 نقاطك يا ${escapeHtml(safeName(ctx.from))}: ${user.points} نقطة\n` +
    "🎁 المكافأة اليومية: /daily"
  );
});

bot.action(/^game:cancel:([a-z0-9]+)$/, async ctx => {
  const session = gameSessions.get(ctx.match[1]);

  if (!session || session.chatId !== String(ctx.chat.id)) {
    return ctx.answerCbQuery("الجولة انتهت بالفعل.", {
      show_alert: true
    });
  }

  if (session.ownerId !== ctx.from.id && !(await isAdmin(ctx))) {
    return ctx.answerCbQuery(
      "صاحب الجولة أو مشرف المجموعة فقط يقدر يلغيها.",
      { show_alert: true }
    );
  }

  gameSessions.delete(session.id);

  await ctx.answerCbQuery("تم إلغاء الجولة.");

  try {
    await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
  } catch {}
});

bot.action(/^game:answer:([a-z0-9]+):(\d+)$/, async ctx => {
  const id = ctx.match[1];
  const choice = Number(ctx.match[2]);
  const session = gameSessions.get(id);

  if (
    !session ||
    session.chatId !== String(ctx.chat.id) ||
    session.expiresAt < Date.now()
  ) {
    gameSessions.delete(id);

    return ctx.answerCbQuery("الجولة انتهت. ابدأ جولة جديدة! ⏳", {
      show_alert: true
    });
  }

  if (session.type === "number") {
    return ctx.answerCbQuery("الجولة دي مش لعبة أسئلة.", {
      show_alert: true
    });
  }

  if (session.answered.has(ctx.from.id)) {
    return ctx.answerCbQuery("إجابتك اتحسبت بالفعل في الجولة دي.", {
      show_alert: true
    });
  }

  session.answered.add(ctx.from.id);

  if (choice !== session.question.answer) {
    return ctx.answerCbQuery("مش هي دي 😅 حظ أوفر في الجولة الجاية!");
  }

  gameSessions.delete(id);

  const user = db.ensureUser(ctx.from);
  const updated = db.addPoints(user.user_id, 10);

  await ctx.answerCbQuery("إجابة صحيحة! +10 نقاط 🎉");

  try {
    await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
  } catch {}

  await ctx.reply(
    `🎉 برافو يا ${escapeHtml(safeName(ctx.from))}!\n` +
    "إجابة صحيحة وكسبت 10 نقاط 🏆\n" +
    `💰 رصيدك الحالي: ${updated.points}`,
    { parse_mode: "HTML" }
  );
});

bot.action(/^game:guess:([a-z0-9]+):([1-5])$/, async ctx => {
  const id = ctx.match[1];
  const guess = Number(ctx.match[2]);
  const session = gameSessions.get(id);

  if (
    !session ||
    session.type !== "number" ||
    session.chatId !== String(ctx.chat.id) ||
    session.expiresAt < Date.now()
  ) {
    gameSessions.delete(id);

    return ctx.answerCbQuery("اللعبة انتهت. ابدأ من جديد! ⏳", {
      show_alert: true
    });
  }

  if (session.answered.has(ctx.from.id)) {
    return ctx.answerCbQuery("اختيارك اتحسب بالفعل.", {
      show_alert: true
    });
  }

  session.answered.add(ctx.from.id);

  if (guess !== session.secret) {
    return ctx.answerCbQuery("مش الرقم الصح 😅 جرّب حظك في جولة جديدة.", {
      show_alert: true
    });
  }

  gameSessions.delete(id);

  const user = db.ensureUser(ctx.from);
  const updated = db.addPoints(user.user_id, 10);

  await ctx.answerCbQuery("أصبت الرقم! +10 نقاط 🎉");

  try {
    await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
  } catch {}

  await ctx.reply(
    `🎯 ${escapeHtml(safeName(ctx.from))} عرف الرقم الصح!\n` +
    `الرقم كان ${session.secret}.\n` +
    `🏆 +10 نقاط | رصيدك: ${updated.points}`,
    { parse_mode: "HTML" }
  );
});

bot.command("ai", async ctx => {
  const prompt = ctx.message.text
    .replace(/^\/ai(?:@\w+)?\s*/i, "")
    .trim();

  if (!prompt) {
    return ctx.reply("اكتب سؤالك بعد /ai.");
  }

  if (prompt.length > 4000) {
    return ctx.reply("اختصر السؤال إلى 4000 حرف أو أقل.");
  }

  await ctx.sendChatAction("typing");

  try {
    const answer = await askAI(prompt);
    await ctx.reply(answer);
  } catch (error) {
    if (error.message === "AI_DISABLED") {
      return ctx.reply("🧠 الذكاء الاصطناعي غير مفعّل. راجع إعدادات .env.");
    }

    console.error("AI request failed:", error.message);

    await ctx.reply(
      error.message.startsWith("GROQ_HTTP_")
        ? "تعذر الاتصال بخدمة الذكاء الاصطناعي. راجع المفتاح وحدود الاستخدام والنموذج."
        : "تعذر الحصول على إجابة حاليًا. حاول لاحقًا."
    );
  }
});

bot.command("post", async ctx => {
  if (!isOwner(ctx)) {
    return ctx.reply("⛔ هذا الأمر مخصص لمالك البوت فقط.");
  }

  const args = ctx.message.text
    .replace(/^\/post(?:@\w+)?\s*/i, "")
    .trim();

  const separator = args.indexOf(" ");

  if (separator < 1) {
    return ctx.reply("الاستخدام:\n/post @ChannelUsername نص المنشور");
  }

  const channelName = args.slice(0, separator);
  const text = args.slice(separator + 1).trim();

  if (!/^@[A-Za-z0-9_]{5,}$/.test(channelName)) {
    return ctx.reply("اكتب اسم القناة العامة بالشكل @ChannelUsername.");
  }

  if (!text || text.length > 4000) {
    return ctx.reply("نص المنشور يجب أن يكون بين 1 و4000 حرف.");
  }

  try {
    const channel = await ctx.telegram.getChat(channelName);

    if (channel.type !== "channel") {
      return ctx.reply("هذا الحساب ليس قناة.");
    }

    const member = await ctx.telegram.getChatMember(
      channel.id,
      ctx.botInfo.id
    );

    if (
      !["creator", "administrator"].includes(member.status) ||
      (member.status === "administrator" && !member.can_post_messages)
    ) {
      return ctx.reply("البوت لا يملك صلاحية النشر في هذه القناة.");
    }

    await ctx.telegram.sendMessage(channel.id, text);

    record(channel.id, ctx.from.id, null, "channel_post", channelName);

    await ctx.reply("✅ تم نشر الرسالة بنجاح.");
  } catch (error) {
    console.error("Channel post failed:", error.message);
    await ctx.reply("تعذر النشر. تحقق من القناة وصلاحيات البوت.");
  }
});

bot.on("new_chat_members", async ctx => {
  if (!isGroup(ctx)) return;

  const chat = db.getChat(ctx.chat);

  for (const user of ctx.message.new_chat_members) {
    if (user.id === ctx.botInfo.id) {
      await ctx.reply("👑 شكرًا لإضافة FARAG AI. استخدم /help لمعرفة الأوامر.");
      continue;
    }

    const name = safeName(user).replace(/[<>&"]/g, "");

    await ctx.reply(chat.welcome.replace(/\{name\}/g, name));
  }
});

// شخصية فرج المصرية: ترد بشكل محدود لتجنب إزعاج الجروب.
bot.on("text", async (ctx, next) => {
  if (!isGroup(ctx) || !ctx.from || ctx.from.is_bot) {
    return next();
  }

  const message = ctx.message.text || "";

  if (message.startsWith("/") || message.length > 150) {
    return next();
  }

  const reply = personalityReply(message);

  if (!reply) {
    return next();
  }

  const key = String(ctx.chat.id);
  const now = Date.now();
  const last = personalityCooldowns.get(key) || 0;

  if (now - last < 8000) {
    return next();
  }

  personalityCooldowns.set(key, now);

  try {
    await ctx.reply(reply);
  } catch (error) {
    console.error("FARAG personality error:", error.message);
  }

  return next();
});

// الحماية الأساسية. لفحص رسائل المجموعة العادية، راجع Privacy Mode من BotFather.
bot.on("message", async (ctx, next) => {
  const message = ctx.message;

  if (!ctx.from || ctx.from.is_bot || !isGroup(ctx)) {
    return next();
  }

  db.ensureChat(ctx.chat);
  db.ensureUser(ctx.from);
  db.memberSeen(ctx.chat.id, ctx.from.id);

  if (message.new_chat_members || message.left_chat_member) {
    return next();
  }

  if (await isAdmin(ctx, ctx.from.id)) {
    return next();
  }

  const chat = db.getChat(ctx.chat);

  if (chat.links_enabled && containsLink(message)) {
    if (!(await isBotAdmin(ctx))) {
      return next();
    }

    try {
      await ctx.deleteMessage();
      db.incrementStat("blocked");
      record(ctx.chat.id, ctx.from.id, null, "link_deleted");
    } catch (error) {
      console.error("Link deletion failed:", error.message);
    }

    return;
  }

  if (chat.flood_enabled && flood.isFlood(ctx.chat.id, ctx.from.id)) {
    if (!(await isBotAdmin(ctx))) {
      return next();
    }

    try {
      await ctx.deleteMessage();
      db.incrementStat("blocked");
      record(ctx.chat.id, ctx.from.id, null, "flood_deleted");
    } catch (error) {
      console.error("Flood deletion failed:", error.message);
    }

    return;
  }

  db.incrementStat("messages");

  return next();
});

bot.catch((error, ctx) => {
  console.error(
    `Bot error on update ${ctx.update?.update_id ?? "unknown"}:`,
    error.message
  );
});

async function main() {
  try {
    const me = await bot.telegram.getMe();

    console.log("====================================");
    console.log("👑 FARAG AI v2.1");
    console.log(`🤖 Bot: ${me.first_name}`);
    console.log(`🔗 Username: @${me.username}`);
    console.log("🗄️ Database: SQLite");
    console.log(
      `🧠 AI: ${
        process.env.AI_ENABLED === "true" && process.env.GROQ_API_KEY
          ? "Enabled"
          : "Disabled"
      }`
    );
    console.log("====================================");

    await bot.telegram.setMyCommands([
      { command: "start", description: "القائمة الرئيسية" },
      { command: "help", description: "المساعدة والأوامر" },
      { command: "id", description: "عرض المعرفات" },
      { command: "ai", description: "اسأل الذكاء الاصطناعي" },
      { command: "daily", description: "المكافأة اليومية" },
      { command: "points", description: "رصيد النقاط" },
      { command: "top", description: "ترتيب الأعضاء" },
      { command: "games", description: "مركز الألعاب" },
      { command: "quiz", description: "مسابقة معلومات عامة" },
      { command: "riddle", description: "فوازير فرج" },
      { command: "math", description: "تحدي الحساب" },
      { command: "guess", description: "خمن الرقم" },
      { command: "stats", description: "الإحصائيات" },
      { command: "settings", description: "إعدادات المجموعة" }
    ]);

    await bot.launch({
      allowedUpdates: [
        "message",
        "callback_query",
        "channel_post",
        "my_chat_member"
      ]
    });

    console.log("✅ FARAG AI is running.");
  } catch (error) {
    console.error("❌ Startup failed:", error.message);
    process.exitCode = 1;
  }
}

const cleanupTimer = setInterval(() => {
  const now = Date.now();

  for (const [id, session] of gameSessions) {
    if (session.expiresAt < now) {
      gameSessions.delete(id);
    }
  }

  for (const [chatId, timestamp] of personalityCooldowns) {
    if (now - timestamp > 60000) {
      personalityCooldowns.delete(chatId);
    }
  }
}, 60000);

cleanupTimer.unref();

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));

main();

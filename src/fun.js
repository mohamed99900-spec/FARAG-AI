
const { Markup } = require("telegraf");

const sessions = new Map();
const chatCooldowns = new Map();

const QUIZZES = [
  { q: "كم عدد أركان الإسلام؟", a: ["3", "5", "7", "6"], correct: 1 },
  { q: "ما الكوكب المعروف بالكوكب الأحمر؟", a: ["المريخ", "الزهرة", "زحل", "عطارد"], correct: 0 },
  { q: "ما عاصمة اليابان؟", a: ["بكين", "سيول", "طوكيو", "بانكوك"], correct: 2 },
  { q: "كم ضلعًا للمثلث؟", a: ["2", "3", "4", "5"], correct: 1 },
  { q: "ما أكبر كوكب في المجموعة الشمسية؟", a: ["الأرض", "المشتري", "المريخ", "نبتون"], correct: 1 },
  { q: "كم يومًا في السنة العادية؟", a: ["360", "364", "365", "366"], correct: 2 },
  { q: "ما عاصمة مصر؟", a: ["القاهرة", "الإسكندرية", "الأقصر", "أسوان"], correct: 0 },
  { q: "كم دقيقة في الساعة؟", a: ["30", "45", "60", "100"], correct: 2 },
  { q: "ما الحيوان المعروف بسفينة الصحراء؟", a: ["الحصان", "الجمل", "الفيل", "الغزال"], correct: 1 },
  { q: "كم عدد ألوان قوس قزح التقليدية؟", a: ["5", "6", "7", "8"], correct: 2 }
];

const RIDDLES = [
  { q: "إيه اللي له أسنان ومابيعضش؟", a: ["المشط", "الأسد", "الكلب"], correct: 0 },
  { q: "إيه اللي كل ما تاخد منه يكبر؟", a: ["الفلوس", "الحفرة", "البحر"], correct: 1 },
  { q: "إيه اللي بيكتب ومابيعرفش يقرأ؟", a: ["القلم", "الكتاب", "المدرس"], correct: 0 },
  { q: "إيه اللي له عين واحدة ومابيشفش؟", a: ["الإبرة", "القطة", "العصفور"], correct: 0 },
  { q: "إيه اللي بيجري ومامعندوش رجلين؟", a: ["الطفل", "الماء", "الحصان"], correct: 1 }
];

const MATH = [
  { q: "7 + 8 = ؟", a: ["14", "15", "16", "17"], correct: 1 },
  { q: "9 × 6 = ؟", a: ["45", "54", "56", "63"], correct: 1 },
  { q: "100 - 37 = ؟", a: ["63", "67", "73", "53"], correct: 0 },
  { q: "12 × 4 = ؟", a: ["36", "42", "48", "52"], correct: 2 },
  { q: "81 ÷ 9 = ؟", a: ["7", "8", "9", "10"], correct: 2 }
];

function randomItem(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function makeId() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

function nameOf(user) {
  return user?.first_name || user?.username || "يا نجم";
}

function isGroup(ctx) {
  return ["group", "supergroup"].includes(ctx.chat?.type);
}

function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/[؟?!.,،]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getPersonalityReply(text) {
  const t = normalize(text);

  if (/^(بتحبني|تحبني|انت بتحبني|انتا بتحبني)( يا)? فرج$/.test(t) ||
      /بتحبني يا فرج/.test(t)) {
    return randomItem([
      "وأنت مالك يا عم 😂❤️",
      "بعشقك يا نجم، بس متقولش لحد 🤫❤️",
      "بموت في ميتينك يا عم 😂",
      "يا عم ده سؤال محرج في الجروب كله 😂",
      "حب إيه بس، هاتلي شاي الأول ☕😂",
      "إنت حبيبي يا جدع ❤️🫶"
    ]);
  }

  if (/^(يا )?فرج$/.test(t) || /^يا فرج\b/.test(t)) {
    return randomItem([
      "يا قلب فرج ❤️",
      "يا روح فرج 🫶",
      "أيوه يا حبيبي، فرج معاك 😂",
      "عيون فرج يا نجم 👀❤️",
      "اللي مجنّني فرج وصل 😂🔥",
      "ناديتني يا أسطورة؟ 😎",
      "قلب فرج ينور يا غالي ❤️",
      "خير يا عم، مين مزعلك؟ 😂"
    ]);
  }

  if (/^(فرج فين|فين فرج|حد شاف فرج)$/.test(t)) {
    return randomItem([
      "أهو يا عم، كنت بتدور عليا ليه؟ 😂",
      "فرج موجود، بس عامل نفسه مش واخد باله 😎",
      "في قلبك يا نجم ❤️😂",
      "كنت بجيب شاي، فيه حاجة؟ ☕"
    ]);
  }

  if (/^(صباح الخير|صباح النور|صباح الفل)$/.test(t)) {
    return randomItem([
      "صباح الفل والياسمين على أحلى جروب 🌞🌷",
      "صباح العسل يا جماعة، مين جاب الفطار؟ 😂",
      "صباحكم ضحكة ورزق وخير ❤️"
    ]);
  }

  if (/^(مساء الخير|مساء النور|مساء الفل)$/.test(t)) {
    return randomItem([
      "مساء الفل على الناس الرايقة 🌙❤️",
      "مساء العسل، مين لسه صاحي معانا؟ 😂",
      "مساء الضحكة الحلوة يا أحلى جروب 🫶"
    ]);
  }

  if (/^(شكرا|شكراً|تسلم|تسلم يا فرج)$/.test(t)) {
    return randomItem([
      "حبيبي يا نجم، ده واجب فرج ❤️",
      "تؤمر يا كبير 😎",
      "ولا يهمك يا غالي 🫶"
    ]);
  }

  if (/^(هههه+|😂+|🤣+)$/.test(t)) {
    return randomItem([
      "ضحكتك بالدنيا يا نجم 😂",
      "استنى بس، لسه النكتة الجامدة مجتش 🤣",
      "الجروب قلب ستاند أب كوميدي 😂🔥"
    ]);
  }

  return null;
}

async function showGames(ctx, edit = false) {
  const text =
    "🎮 FARAG AI — مركز الألعاب\n\n" +
    "اختار لعبتك وورّي الجروب شطارتك!\n\n" +
    "🧠 مسابقة معلومات عامة: +10 نقاط\n" +
    "🧩 ألغاز وفوازير: +10 نقاط\n" +
    "⚡ تحدي الحساب: +10 نقاط\n" +
    "🎯 خمن الرقم: +10 نقاط\n\n" +
    "🏆 شوف ترتيبك بـ /top\n" +
    "💰 شوف رصيدك بـ /points";

  if (edit) {
    try {
      return await ctx.editMessageText(text, gamesKeyboard());
    } catch (e) {
      if (String(e.description || "").includes("message is not modified")) return;
    }
  }

  return ctx.reply(text, gamesKeyboard());
}

function gamesKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("🧠 مسابقة المعلومات", "farag:quiz"),
      Markup.button.callback("🧩 لغز وفزورة", "farag:riddle")
    ],
    [
      Markup.button.callback("⚡ تحدي الحساب", "farag:math"),
      Markup.button.callback("🎯 خمن الرقم", "farag:number")
    ],
    [
      Markup.button.callback("🏆 المتصدرون", "farag:top"),
      Markup.button.callback("💰 نقاطي", "farag:points")
    ]
  ]);
}

function makeQuestionKeyboard(id, question, type) {
  const rows = question.a.map((option, index) => [
    Markup.button.callback(option, `farag:answer:${id}:${index}`)
  ]);

  rows.push([
    Markup.button.callback("❌ إلغاء الجولة", `farag:cancel:${id}`)
  ]);

  return Markup.inlineKeyboard(rows);
}

async function startQuestion(ctx, db, type) {
  const collection =
    type === "quiz" ? QUIZZES :
    type === "riddle" ? RIDDLES :
    MATH;

  const question = randomItem(collection);
  const id = makeId();

  sessions.set(id, {
    type,
    chatId: String(ctx.chat.id),
    question,
    answered: new Set(),
    ownerId: ctx.from.id,
    expiresAt: Date.now() + 5 * 60 * 1000
  });

  const title =
    type === "quiz" ? "🧠 مسابقة المعلومات العامة" :
    type === "riddle" ? "🧩 لغز فرج" :
    "⚡ تحدي الحساب";

  await ctx.reply(
    `${title}\n\n${question.q}\n\n` +
    "أول إجابة صحيحة تكسب 10 نقاط! 🏆\n" +
    "⏳ الجولة صالحة لمدة 5 دقائق.",
    makeQuestionKeyboard(id, question, type)
  );
}

async function startNumberGame(ctx) {
  const id = makeId();
  const secret = Math.floor(Math.random() * 5) + 1;

  sessions.set(id, {
    type: "number",
    chatId: String(ctx.chat.id),
    secret,
    answered: new Set(),
    expiresAt: Date.now() + 5 * 60 * 1000
  });

  await ctx.reply(
    "🎯 خمن الرقم!\n\nفرج مختار رقم من 1 إلى 5.\n" +
    "أول واحد يختار الرقم الصح يكسب 10 نقاط.",
    Markup.inlineKeyboard([
      [1, 2, 3, 4, 5].map(n =>
        Markup.button.callback(String(n), `farag:guess:${id}:${n}`)
      )
    ])
  );
}

function registerFun(bot, db) {
  bot.command("games", async ctx => {
    await showGames(ctx);
  });

  bot.command("quiz", async ctx => {
    await startQuestion(ctx, db, "quiz");
  });

  bot.command("riddle", async ctx => {
    await startQuestion(ctx, db, "riddle");
  });

  bot.command("math", async ctx => {
    await startQuestion(ctx, db, "math");
  });

  bot.command("guess", async ctx => {
    await startNumberGame(ctx);
  });

  bot.action(/^farag:(quiz|riddle|math|number)$/, async ctx => {
    await ctx.answerCbQuery();

    if (ctx.match[1] === "number") {
      return startNumberGame(ctx);
    }

    return startQuestion(ctx, db, ctx.match[1]);
  });

  bot.action(/^farag:points$/, async ctx => {
    await ctx.answerCbQuery();

    const user = db.ensureUser(ctx.from);
    await ctx.reply(
      `💰 نقاطك يا ${nameOf(ctx.from)}: ${user.points} نقطة\n` +
      "🎁 المكافأة اليومية: /daily\n" +
      "🏆 الترتيب: /top"
    );
  });

  bot.action(/^farag:top$/, async ctx => {
    await ctx.answerCbQuery();

    const top = db.topUsers();
    if (!top.length) return ctx.reply("لسه مفيش نقاط. ابدأ اللعب يا بطل! 🎮");

    const medals = ["🥇", "🥈", "🥉"];
    const text = top.map((user, i) =>
      `${medals[i] || `${i + 1}.`} ${user.name}: ${user.points} نقطة`
    ).join("\n");

    await ctx.reply(`🏆 أبطال FARAG AI\n\n${text}`);
  });

  bot.action(/^farag:cancel:([a-z0-9]+)$/, async ctx => {
    const id = ctx.match[1];
    const session = sessions.get(id);

    if (!session || session.chatId !== String(ctx.chat.id)) {
      return ctx.answerCbQuery("الجولة انتهت بالفعل.", { show_alert: true });
    }

    if (session.ownerId !== ctx.from.id) {
      return ctx.answerCbQuery("صاحب الجولة فقط يقدر يلغيها.", { show_alert: true });
    }

    sessions.delete(id);
    await ctx.answerCbQuery("تم إلغاء الجولة.");
    try {
      await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
    } catch {}
  });

  bot.action(/^farag:answer:([a-z0-9]+):(\d+)$/, async ctx => {
    const id = ctx.match[1];
    const choice = Number(ctx.match[2]);
    const session = sessions.get(id);

    if (!session || session.chatId !== String(ctx.chat.id) ||
        session.expiresAt < Date.now()) {
      sessions.delete(id);
      return ctx.answerCbQuery("الجولة انتهت. ابدأ جولة جديدة! ⏳", {
        show_alert: true
      });
    }

    if (session.answered.has(ctx.from.id)) {
      return ctx.answerCbQuery("إجابتك اتحسبت بالفعل في الجولة دي.", {
        show_alert: true
      });
    }

    session.answered.add(ctx.from.id);

    if (choice !== session.question.correct) {
      await ctx.answerCbQuery("مش هي دي 😅 جرّب في الجولة الجاية.");
      return;
    }

    sessions.delete(id);
    const user = db.ensureUser(ctx.from);
    const updated = db.addPoints(user.user_id, 10);

    await ctx.answerCbQuery("إجابة صحيحة! +10 نقاط 🎉");
    try {
      await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
    } catch {}

    await ctx.reply(
      `🎉 برافو يا ${nameOf(ctx.from)}!\n\n` +
      "إجابة صحيحة وكسبت +10 نقاط 🏆\n" +
      `💰 رصيدك الحالي: ${updated.points} نقطة`
    );
  });

  bot.action(/^farag:guess:([a-z0-9]+):(\d+)$/, async ctx => {
    const id = ctx.match[1];
    const guess = Number(ctx.match[2]);
    const session = sessions.get(id);

    if (!session || session.type !== "number" ||
        session.chatId !== String(ctx.chat.id) ||
        session.expiresAt < Date.now()) {
      sessions.delete(id);
      return ctx.answerCbQuery("اللعبة انتهت. ابدأ من جديد! ⏳", {
        show_alert: true
      });
    }

    if (session.answered.has(ctx.from.id)) {
      return ctx.answerCbQuery("اختيارك اتحسب بالفعل.", { show_alert: true });
    }

    session.answered.add(ctx.from.id);

    if (guess !== session.secret) {
      return ctx.answerCbQuery("مش الرقم الصح 😅 حظ أوفر!", {
        show_alert: true
      });
    }

    sessions.delete(id);
    const user = db.ensureUser(ctx.from);
    const updated = db.addPoints(user.user_id, 10);

    await ctx.answerCbQuery("أصبت الرقم! +10 نقاط 🎉");
    try {
      await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
    } catch {}

    await ctx.reply(
      `🎯 ${nameOf(ctx.from)} عرف الرقم الصح!\n` +
      `الرقم كان ${session.secret}.\n` +
      `🏆 +10 نقاط | رصيدك: ${updated.points}`
    );
  });

  bot.on("text", async (ctx, next) => {
    try {
      if (!isGroup(ctx) || !ctx.from || ctx.from.is_bot) {
        return next();
      }

      const message = ctx.message.text || "";

      if (message.startsWith("/") || message.length > 150) {
        return next();
      }

      const reply = getPersonalityReply(message);
      if (!reply) return next();

      const key = String(ctx.chat.id);
      const now = Date.now();
      const last = chatCooldowns.get(key) || 0;

      // منع تتابع ردود الشخصية في الجروب: رد واحد كل 8 ثوانٍ.
      if (now - last < 8000) return next();

      chatCooldowns.set(key, now);
      await ctx.reply(reply);
    } catch (error) {
      console.error("FARAG personality error:", error.message);
    }

    return next();
  });

  // تنظيف الجولات المنتهية لتقليل استخدام الذاكرة.
  const cleanup = setInterval(() => {
    const now = Date.now();

    for (const [id, session] of sessions) {
      if (session.expiresAt < now) sessions.delete(id);
    }

    for (const [chatId, time] of chatCooldowns) {
      if (now - time > 60000) chatCooldowns.delete(chatId);
    }
  }, 60000);

  cleanup.unref();
}

module.exports = { registerFun };


const { Markup } = require("telegraf");

function mainKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("🛡️ الحماية", "menu:security"),
      Markup.button.callback("👥 الإدارة", "menu:admin")
    ],
    [
      Markup.button.callback("🧠 الذكاء الاصطناعي", "menu:ai"),
      Markup.button.callback("📊 الإحصائيات", "menu:stats")
    ],
    [
      Markup.button.callback("🏆 النقاط", "menu:points"),
      Markup.button.callback("🎮 الألعاب", "menu:games")
    ],
    [
      Markup.button.callback("⚙️ الإعدادات", "menu:settings"),
      Markup.button.callback("📚 المساعدة", "menu:help")
    ]
  ]);
}

function backKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("⬅️ القائمة الرئيسية", "menu:home")]
  ]);
}

function moderationKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("🔗 منع الروابط", "toggle:links"),
      Markup.button.callback("🔁 حماية التكرار", "toggle:flood")
    ],
    [Markup.button.callback("⬅️ رجوع", "menu:home")]
  ]);
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
    ],
    [Markup.button.callback("⬅️ القائمة الرئيسية", "menu:home")]
  ]);
}

module.exports = {
  mainKeyboard,
  backKeyboard,
  moderationKeyboard,
  gamesKeyboard
};

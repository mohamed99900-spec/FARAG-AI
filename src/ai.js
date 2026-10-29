
const MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

async function askAI(prompt) {
  const apiKey = process.env.GROQ_API_KEY;
  const enabled = process.env.AI_ENABLED === "true";

  if (!enabled || !apiKey) {
    throw new Error("AI_DISABLED");
  }

  const cleanPrompt = String(prompt || "").trim();

  if (!cleanPrompt) {
    throw new Error("AI_EMPTY_PROMPT");
  }

  const response = await fetch(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          {
            role: "system",
            content:
              "أنت FARAG AI، مساعد عربي ودود وذكي. " +
              "تحدث بالعربية الواضحة أو باللهجة المصرية حسب سياق المستخدم. " +
              "كن مفيدًا ومحترمًا، ولا تخترع معلومات أو تدّعي تنفيذ أفعال لم تنفذها."
          },
          {
            role: "user",
            content: cleanPrompt.slice(0, 12000)
          }
        ],
        temperature: 0.7,
        max_tokens: 1000
      }),
      signal: AbortSignal.timeout(30000)
    }
  );

  if (!response.ok) {
    throw new Error(`GROQ_HTTP_${response.status}`);
  }

  const data = await response.json();
  const answer = data.choices?.[0]?.message?.content?.trim();

  if (!answer) {
    throw new Error("AI_EMPTY_RESPONSE");
  }

  return answer.slice(0, 4000);
}

module.exports = { askAI };

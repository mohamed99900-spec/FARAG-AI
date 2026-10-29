
function containsLink(message) {
  const text = String(message?.text || message?.caption || "");

  const entities = [
    ...(message?.entities || []),
    ...(message?.caption_entities || [])
  ];

  const urlPattern =
    /(?:https?:\/\/|www\.|t\.me\/|telegram\.me\/|telegram\.dog\/|telegra\.ph\/|telegram\.org\/)/i;

  return (
    urlPattern.test(text) ||
    entities.some(
      entity =>
        entity.type === "url" ||
        entity.type === "text_link"
    )
  );
}

function getFloodState() {
  const recent = new Map();

  return {
    isFlood(chatId, userId, now = Date.now()) {
      const key = `${chatId}:${userId}`;

      const messages = (recent.get(key) || []).filter(
        timestamp => now - timestamp < 6000
      );

      messages.push(now);
      recent.set(key, messages);

      if (recent.size > 5000) {
        for (const [entry, timestamps] of recent) {
          const last = timestamps[timestamps.length - 1];

          if (!last || now - last > 60000) {
            recent.delete(entry);
          }
        }
      }

      return messages.length >= 6;
    },

    clear(chatId, userId) {
      recent.delete(`${chatId}:${userId}`);
    }
  };
}

module.exports = { containsLink, getFloodState };

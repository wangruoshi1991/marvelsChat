// Callers supply authorized turns strictly before the current input. The current
// input is passed separately to the Agent; identical earlier requests are history.
export function agentChatHistory(messages = []) {
  const visible = messages.filter(
    (message) => !message.recalledAt && !message.deletedAt,
  );
  return visible.slice(-10).map((message) => ({
    role: message.senderType === "user" ? "user" : "assistant",
    content: String(message.content || ""),
  }));
}

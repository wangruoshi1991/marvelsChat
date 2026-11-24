const invalid = () => new Error("CHAT_VOICE_CALLS_ICE_SERVERS_JSON must be an explicit array of ICE URL objects without credentials.");

export function createVoiceCallConfig(env = process.env) {
  const flag = String(env.CHAT_VOICE_CALLS_ENABLED ?? "false").trim();
  if (!["", "false", "true"].includes(flag)) throw new Error("CHAT_VOICE_CALLS_ENABLED must be true or false.");
  if (flag !== "true") return Object.freeze({ enabled: false });
  const raw = env.CHAT_VOICE_CALLS_ICE_SERVERS_JSON;
  if (typeof raw !== "string" || !raw.trim() || raw.length > 8192) throw invalid();
  let values;
  try { values = JSON.parse(raw); } catch { throw invalid(); }
  if (!Array.isArray(values) || values.length > 8) throw invalid();
  const urlValid = value => {
    if (typeof value !== "string" || value.length > 512 || /[\s@/#]/.test(value)) return false;
    const match = /^(stun|stuns|turn|turns):((?:\[[0-9a-fA-F:]+\])|(?:[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?))(?::([0-9]{1,5}))?(?:\?transport=(udp|tcp))?$/.exec(value);
    return Boolean(match && (!match[3] || (Number(match[3]) > 0 && Number(match[3]) <= 65535)) &&
      (!match[4] || match[1].startsWith("turn")));
  };
  const iceServers = values.map(value => {
    if (!value || typeof value !== "object" || Array.isArray(value) ||
        Object.keys(value).length !== 1 || !Object.hasOwn(value, "urls")) throw invalid();
    const urls = typeof value.urls === "string" ? [value.urls] : value.urls;
    if (!Array.isArray(urls) || !urls.length || urls.length > 8 || !urls.every(urlValid)) throw invalid();
    return Object.freeze({ urls: typeof value.urls === "string" ? value.urls : Object.freeze([...urls]) });
  });
  return Object.freeze({ enabled: true, iceServers: Object.freeze(iceServers) });
}

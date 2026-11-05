export function createChatAttachmentConfig(env = process.env) {
  const integer = (name, defaultValue, minimum, maximum) => {
    const raw = env[name];
    const value = raw === undefined ? defaultValue : Number(raw);
    if ((raw !== undefined && !/^\d+$/.test(String(raw))) || !Number.isSafeInteger(value) || value < minimum || value > maximum)
      throw new Error(`${name} must be an integer between ${minimum} and ${maximum}.`);
    return value;
  };
  return Object.freeze({
    draftRetentionHours: integer('CHAT_ATTACHMENT_DRAFT_RETENTION_HOURS', 24, 1, 168),
    userMaxBytes: integer('CHAT_ATTACHMENT_USER_MAX_BYTES', 104857600, 1, 10737418240),
    userMaxCount: integer('CHAT_ATTACHMENT_USER_MAX_COUNT', 1000, 1, 100000),
    globalMaxBytes: integer('CHAT_ATTACHMENT_GLOBAL_MAX_BYTES', 5368709120, 1, 1099511627776),
    globalMaxCount: integer('CHAT_ATTACHMENT_GLOBAL_MAX_COUNT', 100000, 1, 10000000),
    cleanupBatchSize: integer('CHAT_ATTACHMENT_CLEANUP_BATCH_SIZE', 200, 1, 1000),
    maintenanceIntervalMs: integer('CHAT_ATTACHMENT_MAINTENANCE_INTERVAL_MS', 300000, 1000, 3600000),
  });
}

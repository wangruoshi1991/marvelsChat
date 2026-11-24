export const profileLanguageOptions = [
  ["zh", "中文"],
  ["en", "英语"],
  ["ja", "日语"],
  ["ko", "韩语"],
  ["fr", "法语"],
  ["de", "德语"],
  ["es", "西班牙语"],
  ["pt", "葡萄牙语"],
  ["ru", "俄语"],
  ["ar", "阿拉伯语"],
];

export function buildAdminProfileUpdate(values) {
  const result = {};
  for (const [field, label, limit] of [
    ["nickname", "昵称", 80],
    ["bio", "简介", 500],
    ["community", "社区", 120],
    ["activityArea", "活动区域", 120],
    ["headline", "身份标题", 80],
    ["publicLocation", "公开城市", 120],
  ]) {
    result[field] = String(values[field] ?? "").trim();
    if (result[field].length > limit)
      throw new Error(`${label}最多 ${limit} 个字符。`);
  }
  if (!result.nickname) throw new Error("请输入昵称。");

  const years = String(values.experienceYears ?? "").trim();
  if (years !== "" && (!/^\d+$/.test(years) || Number(years) > 80)) {
    throw new Error("从业年限请填写 0 至 80 的整数，或留空清除。");
  }
  result.experienceYears = years === "" ? null : Number(years);

  const languages = values.languages;
  const supportedLanguages = new Set(
    profileLanguageOptions.map(([code]) => code)
  );
  if (
    !Array.isArray(languages) ||
    languages.length > 10 ||
    new Set(languages).size !== languages.length ||
    languages.some((code) => !supportedLanguages.has(code))
  ) {
    throw new Error("请从列表中选择语言，每种语言只能选择一次。");
  }
  result.languages = [...languages];
  return result;
}

export const mediaRetrievalDiagnosticGuidance = (diagnostic = {}) => {
  if (diagnostic.stage === "timeout" || diagnostic.stage === "transport")
    return "检查服务出口、DNS 和供应商连通性；先核对账单，勿自动重复调用。";
  if (diagnostic.stage === "http-response") {
    if (diagnostic.httpStatus === 401 || diagnostic.httpStatus === 403)
      return "核对供应商凭据、工作空间和模型授权；请勿在后台粘贴密钥。";
    if (diagnostic.httpStatus === 429)
      return "核对供应商配额、并发及限流；确认恢复后再人工重试。";
    if (diagnostic.providerCode === "Arrearage")
      return "核对供应商账户余额与账单。";
    return "根据 HTTP 状态和供应商错误代码核对模型、参数及服务状态。";
  }
  if (
    ["descriptor-validation", "query-validation", "response-json"].includes(
      diagnostic.stage
    )
  )
    return "核对模型输出协议及列出的字段；保持校验开启，不使用原始输出绕过规则。";
  if (diagnostic.stage === "embedding-validation")
    return "核对向量模型、输出维度及部署配置，确认与现有索引一致。";
  return "该记录没有可验证的供应商诊断，需在后续明确授权的调用中采集。";
};

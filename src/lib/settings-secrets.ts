/**
 * 与后端 `config::is_sensitive_settings_key` 对齐的敏感键判定，
 * 供导入预览侧检测密钥风险（文件导入 / deep link 共用 UI 门禁）。
 */
export function isSensitiveSettingsKey(key: string): boolean {
  const normalized = key.toLowerCase();
  return (
    normalized === "authorization" ||
    normalized === "token" ||
    normalized.endsWith("_token") ||
    normalized.endsWith("-token") ||
    normalized.includes("secret") ||
    normalized.includes("password") ||
    normalized.includes("api_key") ||
    normalized.includes("api-key") ||
    normalized === "apikey"
  );
}

export function settingsValueContainsSecrets(value: unknown): boolean {
  if (value == null || typeof value !== "object") {
    return false;
  }
  if (Array.isArray(value)) {
    return value.some(settingsValueContainsSecrets);
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (isSensitiveSettingsKey(key)) {
      if (typeof child === "string") {
        if (child.trim() !== "") return true;
      } else if (child != null) {
        return true;
      }
    } else if (settingsValueContainsSecrets(child)) {
      return true;
    }
  }
  return false;
}

/** 从预览 JSON 文本检测是否含认证密钥；解析失败视为无密钥。 */
export function settingsJsonContainsSecrets(jsonText: string): boolean {
  try {
    return settingsValueContainsSecrets(JSON.parse(jsonText) as unknown);
  } catch {
    return false;
  }
}

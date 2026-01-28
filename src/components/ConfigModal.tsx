import { useState, useMemo } from "react";
import { ClaudeConfig, generateClaudeJson } from "../types";
import "./ConfigModal.css";

interface ConfigModalProps {
  config: ClaudeConfig | null;
  onSave: (config: Omit<ClaudeConfig, "id" | "createdAt" | "updatedAt" | "isActive">) => void;
  onClose: () => void;
}

function ConfigModal({ config, onSave, onClose }: ConfigModalProps) {
  const [name, setName] = useState(config?.name || "");
  const [description, setDescription] = useState(config?.description || "");
  const [apiKey, setApiKey] = useState(config?.apiKey || "");
  const [apiUrl, setApiUrl] = useState(config?.apiUrl || "");
  const [websiteUrl, setWebsiteUrl] = useState(config?.websiteUrl || "");
  const [model, setModel] = useState(config?.model || "");
  const [thinkingModel, setThinkingModel] = useState(config?.thinkingModel || "");
  const [haikuModel, setHaikuModel] = useState(config?.haikuModel || "");
  const [sonnetModel, setSonnetModel] = useState(config?.sonnetModel || "");
  const [opusModel, setOpusModel] = useState(config?.opusModel || "");
  const [alwaysThinkingEnabled, setAlwaysThinkingEnabled] = useState(config?.alwaysThinkingEnabled || false);
  const [disableNonessentialTraffic, setDisableNonessentialTraffic] = useState(config?.disableNonessentialTraffic || false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const currentConfig = useMemo(() => ({
    id: config?.id || "",
    name,
    description,
    apiKey,
    apiUrl: apiUrl || undefined,
    websiteUrl: websiteUrl || undefined,
    model: model || undefined,
    thinkingModel: thinkingModel || undefined,
    haikuModel: haikuModel || undefined,
    sonnetModel: sonnetModel || undefined,
    opusModel: opusModel || undefined,
    alwaysThinkingEnabled,
    disableNonessentialTraffic,
    isActive: config?.isActive || false,
    createdAt: config?.createdAt || 0,
    updatedAt: config?.updatedAt || 0,
  }), [name, description, apiKey, apiUrl, websiteUrl, model, thinkingModel, haikuModel, sonnetModel, opusModel, alwaysThinkingEnabled, disableNonessentialTraffic, config]);

  const previewJson = useMemo(() => {
    if (!apiKey) return "{}";
    return JSON.stringify(generateClaudeJson(currentConfig), null, 2);
  }, [currentConfig, apiKey]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !apiKey.trim()) {
      return;
    }
    onSave({
      name: name.trim(),
      description: description.trim(),
      apiKey: apiKey.trim(),
      apiUrl: apiUrl.trim() || undefined,
      websiteUrl: websiteUrl.trim() || undefined,
      model: model.trim() || undefined,
      thinkingModel: thinkingModel.trim() || undefined,
      haikuModel: haikuModel.trim() || undefined,
      sonnetModel: sonnetModel.trim() || undefined,
      opusModel: opusModel.trim() || undefined,
      alwaysThinkingEnabled,
      disableNonessentialTraffic,
    });
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-large" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <button className="back-btn" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
          </button>
          <h2>{config ? "编辑配置" : "添加配置"}</h2>
          <div className="header-spacer"></div>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {/* 配置徽章 */}
            <div className="config-badge-large">
              <span>{name ? name.substring(0, 2).toUpperCase() : "CC"}</span>
            </div>

            {/* 基本信息 */}
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="name">配置名称 *</label>
                <input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="例如：个人账号、公司账号"
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="description">备注</label>
                <input
                  id="description"
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="例如：公司专用账号"
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="websiteUrl">官网链接</label>
              <input
                id="websiteUrl"
                type="url"
                value={websiteUrl}
                onChange={(e) => setWebsiteUrl(e.target.value)}
                placeholder="https://example.com（可选）"
              />
            </div>

            <div className="form-group">
              <label htmlFor="apiKey">API Key *</label>
              <div className="input-with-toggle">
                <input
                  id="apiKey"
                  type={showApiKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-ant-..."
                  required
                />
                <button
                  type="button"
                  className="toggle-visibility"
                  onClick={() => setShowApiKey(!showApiKey)}
                >
                  {showApiKey ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                      <line x1="1" y1="1" x2="23" y2="23"/>
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                      <circle cx="12" cy="12" r="3"/>
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="apiUrl">请求地址</label>
              <input
                id="apiUrl"
                type="url"
                value={apiUrl}
                onChange={(e) => setApiUrl(e.target.value)}
                placeholder="https://api.anthropic.com"
              />
              <p className="form-hint warning">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="8" x2="12" y2="12"/>
                  <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                填写兼容 Claude API 的服务端点地址，不要以斜杠结尾
              </p>
            </div>

            {/* 模型配置 */}
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="model">主模型</label>
                <input
                  id="model"
                  type="text"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="claude-sonnet-4-5"
                />
              </div>
              <div className="form-group">
                <label htmlFor="thinkingModel">推理模型 (Thinking)</label>
                <input
                  id="thinkingModel"
                  type="text"
                  value={thinkingModel}
                  onChange={(e) => setThinkingModel(e.target.value)}
                  placeholder=""
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="haikuModel">Haiku 默认模型</label>
                <input
                  id="haikuModel"
                  type="text"
                  value={haikuModel}
                  onChange={(e) => setHaikuModel(e.target.value)}
                  placeholder="claude-sonnet-4-5"
                />
              </div>
              <div className="form-group">
                <label htmlFor="sonnetModel">Sonnet 默认模型</label>
                <input
                  id="sonnetModel"
                  type="text"
                  value={sonnetModel}
                  onChange={(e) => setSonnetModel(e.target.value)}
                  placeholder="claude-sonnet-4-5"
                />
              </div>
            </div>

            <div className="form-group half-width">
              <label htmlFor="opusModel">Opus 默认模型</label>
              <input
                id="opusModel"
                type="text"
                value={opusModel}
                onChange={(e) => setOpusModel(e.target.value)}
                placeholder="claude-opus-4-5-thinking"
              />
            </div>
            <p className="form-hint">可选：指定默认使用的 Claude 模型，留空则使用系统默认。</p>

            {/* 高级选项 */}
            <div className="section-toggle" onClick={() => setShowAdvanced(!showAdvanced)}>
              <span>高级选项</span>
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className={showAdvanced ? "expanded" : ""}
              >
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </div>

            {showAdvanced && (
              <div className="advanced-options">
                <div className="checkbox-group">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={alwaysThinkingEnabled}
                      onChange={(e) => setAlwaysThinkingEnabled(e.target.checked)}
                    />
                    <span className="checkbox-custom"></span>
                    <span>始终启用思考模式 (Always Thinking)</span>
                  </label>
                </div>
                <div className="checkbox-group">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={disableNonessentialTraffic}
                      onChange={(e) => setDisableNonessentialTraffic(e.target.checked)}
                    />
                    <span className="checkbox-custom"></span>
                    <span>禁用非必要网络请求</span>
                  </label>
                </div>
              </div>
            )}

            {/* 配置预览 */}
            <div className="section-toggle" onClick={() => setShowPreview(!showPreview)}>
              <span>配置 JSON 预览</span>
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className={showPreview ? "expanded" : ""}
              >
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </div>

            {showPreview && (
              <div className="json-preview">
                <pre><code>{previewJson}</code></pre>
              </div>
            )}
          </div>

          <div className="modal-footer">
            <button type="button" className="btn-cancel" onClick={onClose}>
              取消
            </button>
            <button type="submit" className="btn-save">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                <polyline points="17 21 17 13 7 13 7 21"/>
                <polyline points="7 3 7 8 15 8"/>
              </svg>
              保存
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default ConfigModal;

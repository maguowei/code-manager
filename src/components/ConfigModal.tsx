import { useState } from "react";
import { ClaudeConfig } from "../types";
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
  const [model, setModel] = useState(config?.model || "");
  const [showApiKey, setShowApiKey] = useState(false);

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
      model: model.trim() || undefined,
    });
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{config ? "编辑配置" : "添加配置"}</h2>
          <button className="modal-close" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit}>
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
            <label htmlFor="description">描述</label>
            <input
              id="description"
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="可选的配置描述"
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
            <label htmlFor="apiUrl">API URL</label>
            <input
              id="apiUrl"
              type="url"
              value={apiUrl}
              onChange={(e) => setApiUrl(e.target.value)}
              placeholder="https://api.anthropic.com (可选，自定义 API 端点)"
            />
          </div>

          <div className="form-group">
            <label htmlFor="model">默认模型</label>
            <input
              id="model"
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="例如：claude-sonnet-4-20250514 (可选)"
            />
          </div>

          <div className="modal-actions">
            <button type="button" className="btn-cancel" onClick={onClose}>
              取消
            </button>
            <button type="submit" className="btn-save">
              {config ? "保存" : "添加"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default ConfigModal;

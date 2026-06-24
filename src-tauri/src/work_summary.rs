//! 工作总结：扫描昨日有变更的 git 项目，调用本机 claude CLI 生成分项目总结并落盘。
use serde::{Deserialize, Serialize};

/// 单条提交的结构化信息（body 在 v1 不采集，subject 已足够表达意图）。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ProjectCommit {
    pub hash: String,
    pub subject: String,
    pub author: String,
    pub timestamp: u64,
    pub files_changed: u32,
    pub insertions: u32,
    pub deletions: u32,
}

/// 单个项目某日的变更集合：提交 + 未提交素材。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ProjectChangeset {
    /// 项目绝对路径
    pub project: String,
    /// 路径最后一级，用于展示
    pub short_name: String,
    pub branch: Option<String>,
    /// 是否遵循 conventional commits
    pub is_conventional: bool,
    pub commits: Vec<ProjectCommit>,
    pub has_uncommitted: bool,
    /// 截断后的未提交 diff 素材；无未提交时为空串
    pub uncommitted_material: String,
    /// 扫描该项目时的错误（git 失败等）；正常为 None
    pub scan_error: Option<String>,
}

/// 本机 claude CLI 探测结果
#[derive(Debug, Clone, PartialEq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeCliStatus {
    pub available: bool,
    pub version: Option<String>,
}

/// 一份已落盘的总结文档
#[derive(Debug, Clone, PartialEq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct SummaryDocument {
    /// "daily" | "weekly"
    pub kind: String,
    /// daily 为 "2026-06-23"，weekly 为 "2026-W26"
    pub key: String,
    pub path: String,
    pub content: String,
}

/// 总结列表项（不含正文）
#[derive(Debug, Clone, PartialEq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct SummaryListItem {
    pub kind: String,
    pub key: String,
    pub path: String,
}

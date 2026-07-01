#!/bin/bash

# OSC8 超链接大量使用 \033\\（ST 终结符），shellcheck 会误报为单引号转义，禁用 SC1003
# 下方所有字段经单次 jq @sh + eval 赋值，shellcheck 看不到赋值，禁用 SC2154 误报
# shellcheck disable=SC1003,SC2154

# 缺少 jq 时输出明确提示，避免后续解析静默失败
if ! command -v jq >/dev/null 2>&1; then
    printf 'statusline requires jq'
    exit 0
fi

# 读取 JSON 输入
input=$(cat)

# 一次性提取所有 JSON 标量字段（@sh 保证 shell 安全，eval 导入；缺失字段回退空串）
# cache_pct / ctx_current 的占比与判空也在此 jq 内算好，避免额外进程
eval "$(echo "$input" | jq -r '
  @sh "cwd=\(.workspace.current_dir // "")",
  @sh "project_dir=\(.workspace.project_dir // "")",
  @sh "model=\(.model.display_name // "")",
  @sh "effort_level=\(.effort.level // "")",
  @sh "thinking_enabled=\(.thinking.enabled // false | tostring)",
  @sh "git_worktree=\(.workspace.git_worktree // "")",
  @sh "agent_name=\(.agent.name // "")",
  @sh "session_name=\(.session_name // "")",
  @sh "rl_5h_pct=\(.rate_limits.five_hour.used_percentage // "")",
  @sh "rl_5h_reset=\(.rate_limits.five_hour.resets_at // "")",
  @sh "rl_7d_pct=\(.rate_limits.seven_day.used_percentage // "")",
  @sh "rl_7d_reset=\(.rate_limits.seven_day.resets_at // "")",
  @sh "repo_host=\(.workspace.repo.host // "")",
  @sh "repo_owner=\(.workspace.repo.owner // "")",
  @sh "repo_name=\(.workspace.repo.name // "")",
  @sh "used_pct=\(.context_window.used_percentage // "")",
  @sh "ctx_total=\(.context_window.context_window_size // "")",
  @sh "ctx_current=\((.context_window.total_input_tokens // 0) | if . == 0 then "" else . end)",
  @sh "cache_pct=\((.context_window.total_input_tokens // 0) as $t | if $t > 0 then ((.context_window.current_usage.cache_read_input_tokens // 0) * 100 / $t | round) else "" end)",
  @sh "total_duration_ms=\(.cost.total_duration_ms // "")",
  @sh "total_api_duration_ms=\(.cost.total_api_duration_ms // "")",
  @sh "total_cost=\(.cost.total_cost_usd // "")",
  @sh "lines_added=\(.cost.total_lines_added // "")",
  @sh "lines_removed=\(.cost.total_lines_removed // "")",
  @sh "session_id=\(.session_id // "")",
  @sh "transcript_path=\(.transcript_path // "")",
  @sh "version=\(.version // "")",
  @sh "output_style=\(.output_style.name // "")"
')"

# 当前目录取 basename（仿 robbyrussell 主题 %c）
dir_name=$(basename "$cwd")

# 项目根目录 basename（与当前目录不同时才显示）
project_name=""
if [ -n "$project_dir" ] && [ "$project_dir" != "$cwd" ]; then
    project_name=$(basename "$project_dir")
fi

# ── 工具函数：unix epoch 秒 → 相对时间字符串（如 2h30m、5d、45m）──
fmt_relative_time() {
    local target=$1
    local now
    now=$(date +%s)
    local diff=$(( target - now ))
    [ "$diff" -le 0 ] && { printf 'now'; return; }
    local d=$(( diff / 86400 ))
    local h=$(( (diff % 86400) / 3600 ))
    local m=$(( (diff % 3600) / 60 ))
    if [ "$d" -gt 0 ]; then
        [ "$h" -gt 0 ] && printf '%dd%dh' "$d" "$h" || printf '%dd' "$d"
    elif [ "$h" -gt 0 ]; then
        [ "$m" -gt 0 ] && printf '%dh%dm' "$h" "$m" || printf '%dh' "$h"
    else
        printf '%dm' "$m"
    fi
}

# ── 工具函数：rate limit 百分比 → 带 ANSI 颜色字符串（<70 绿,70-89 黄,≥90 红）──
fmt_rate_pct() {
    local pct_raw=$1
    local pct_int
    pct_int=$(printf '%.0f' "$pct_raw")
    if [ "$pct_int" -ge 90 ]; then
        printf '\033[31m%d%%\033[0m' "$pct_int"
    elif [ "$pct_int" -ge 70 ]; then
        printf '\033[33m%d%%\033[0m' "$pct_int"
    else
        printf '\033[32m%d%%\033[0m' "$pct_int"
    fi
}

# 获取 git 分支、工作区状态及变更行数（带缓存，避免频繁执行 git diff）
# 缓存文件按仓库目录路径 hash 区分，避免不同仓库共用同一缓存
git_info=""
git_diff_info=""
if git -C "$cwd" rev-parse --git-dir > /dev/null 2>&1; then
    # 获取 git 根目录，以其路径作为缓存 key（md5 取前 8 位）
    git_root=$(GIT_OPTIONAL_LOCKS=0 git -C "$cwd" rev-parse --show-toplevel 2>/dev/null || echo "$cwd")
    cache_key=$(printf '%s' "$git_root" | md5sum 2>/dev/null | cut -c1-8 || printf '%s' "$git_root" | md5 2>/dev/null | cut -c1-8)
    cache_dir="${TMPDIR:-/tmp}"
    cache_file="${cache_dir%/}/statusline-git-cache-${cache_key}"
    cache_max_age=5  # 缓存有效期（秒）

    # 判断缓存是否过期（兼容 macOS stat -f %m 和 Linux stat -c %Y）
    cache_is_stale() {
        [ ! -f "$cache_file" ] || \
        [ $(( $(date +%s) - $(stat -f %m "$cache_file" 2>/dev/null || stat -c %Y "$cache_file" 2>/dev/null || echo 0) )) -gt $cache_max_age ]
    }

    if cache_is_stale; then
        # 缓存过期，重新执行 git 查询并写入缓存
        git_branch=$(GIT_OPTIONAL_LOCKS=0 git -C "$cwd" branch --show-current 2>/dev/null || echo "detached")
        # 统计工作区（未暂存）和暂存区的变更行数
        worktree_stat=$(GIT_OPTIONAL_LOCKS=0 git -C "$cwd" diff --numstat 2>/dev/null)
        staged_stat=$(GIT_OPTIONAL_LOCKS=0 git -C "$cwd" diff --cached --numstat 2>/dev/null)
        # 汇总新增行数和删除行数（工作区 + 暂存区合并）
        diff_added=0
        diff_removed=0
        while IFS=$'\t' read -r added removed _file; do
            [ -n "$added" ] && [ "$added" != "-" ] && diff_added=$(( diff_added + added ))
            [ -n "$removed" ] && [ "$removed" != "-" ] && diff_removed=$(( diff_removed + removed ))
        done <<EOF
$worktree_stat
$staged_stat
EOF
        # 判断工作区是否有变更（有变更则 dirty=1）
        if [ -n "$worktree_stat" ] || [ -n "$staged_stat" ]; then
            dirty=1
        else
            dirty=0
        fi
        # 格式：branch|dirty|added|removed，写入缓存文件
        printf '%s|%s|%s|%s\n' "$git_branch" "$dirty" "$diff_added" "$diff_removed" > "$cache_file"
    fi

    # 从缓存读取 git 信息
    IFS='|' read -r git_branch dirty diff_added diff_removed < "$cache_file"

    # 由 workspace.repo（Claude Code 从 origin 解析，已在顶部统一提取）构建可点击的 HTTPS 链接
    repo_url=""
    if [ -n "$repo_host" ] && [ -n "$repo_owner" ] && [ -n "$repo_name" ]; then
        repo_url="https://${repo_host}/${repo_owner}/${repo_name}"
        # 若有分支则拼接分支路径（GitHub/GitLab 风格）
        if [ -n "$git_branch" ] && [ "$git_branch" != "detached" ]; then
            repo_url="${repo_url}/tree/${git_branch}"
        fi
    fi
    # 构建带 OSC 8 超链接的分支文本（若有可用 URL）
    if [ -n "$repo_url" ]; then
        # OSC 8 格式：\e]8;;URL\e\\文字\e]8;;\e\\
        branch_link=$(printf '\033]8;;%s\033\\%s\033]8;;\033\\' "$repo_url" "$git_branch")
    else
        branch_link="$git_branch"
    fi
    # 根据 dirty 状态选择 git_info 样式
    if [ "$dirty" = "1" ]; then
        # 有变更：蓝色括号 + 红色分支（可点击）+ 蓝色括号 + 黄色叉号
        git_info=$(printf '\033[1;34mgit:(\033[0;31m%s\033[1;34m)\033[0;33m x\033[0m' "$branch_link")
    else
        # 干净：蓝色括号 + 红色分支（可点击）+ 蓝色括号
        git_info=$(printf '\033[1;34mgit:(\033[0;31m%s\033[1;34m)\033[0m' "$branch_link")
    fi
    # 构建 git diff 行数显示（仅在有变更时显示）
    if [ "$dirty" = "1" ] && { [ "${diff_added:-0}" -gt 0 ] || [ "${diff_removed:-0}" -gt 0 ]; }; then
        git_diff_info=$(printf '\033[32m+%d\033[0m/\033[31m-%d\033[0m' "${diff_added:-0}" "${diff_removed:-0}")
    fi
fi

# 当前上下文缓存命中占比（cache_pct 已在顶部 jq 内算好：cache_read / total_input_tokens，越高越省）
cache_info=""
if [ -n "$cache_pct" ]; then
    # 命中率越高越好：≥90 绿、70-89 黄、<70 红（与上下文用量配色相反）
    if [ "$cache_pct" -ge 90 ]; then
        cache_info=$(printf 'cache \033[32m%d%%\033[0m' "$cache_pct")
    elif [ "$cache_pct" -ge 70 ]; then
        cache_info=$(printf 'cache \033[33m%d%%\033[0m' "$cache_pct")
    else
        cache_info=$(printf 'cache \033[31m%d%%\033[0m' "$cache_pct")
    fi
fi

# 计算上下文窗口使用百分比及 token 统计（used_pct/ctx_current/ctx_total 已在顶部提取）
context_info=""
if [ -n "$used_pct" ]; then
    # 根据使用比例选择颜色：低于 70% 绿色，70%-90% 黄色，超过 90% 红色
    used_int=$(printf '%.0f' "$used_pct")
    # 将 token 数（整数）格式化为 k 单位，四舍五入整数除法
    ctx_current_fmt=""
    ctx_total_fmt=""
    [ -n "$ctx_current" ] && ctx_current_fmt="$(( (ctx_current + 500) / 1000 ))k"
    [ -n "$ctx_total" ] && ctx_total_fmt="$(( (ctx_total + 500) / 1000 ))k"
    # 构建窗口用量附加信息（如 90k/200k）
    ctx_usage_suffix=""
    if [ -n "$ctx_current_fmt" ] && [ -n "$ctx_total_fmt" ]; then
        ctx_usage_suffix=" (${ctx_current_fmt}/${ctx_total_fmt})"
    fi
    if [ "$used_int" -ge 90 ]; then
        context_info=$(printf 'ctx \033[31m%d%%\033[0m\033[90m%s\033[0m' "$used_int" "$ctx_usage_suffix")
    elif [ "$used_int" -ge 70 ]; then
        context_info=$(printf 'ctx \033[33m%d%%\033[0m\033[90m%s\033[0m' "$used_int" "$ctx_usage_suffix")
    else
        context_info=$(printf 'ctx \033[32m%d%%\033[0m\033[90m%s\033[0m' "$used_int" "$ctx_usage_suffix")
    fi
fi

# 会话耗时（total_duration_ms 挂钟、total_api_duration_ms API 等待，已在顶部提取）
duration_info=""

# ── 工具函数：毫秒 → 可读时间字符串（如 1m30s、45s、2h3m）──
fmt_duration_ms() {
    local ms=$1
    local total_s=$(( ms / 1000 ))
    local h=$(( total_s / 3600 ))
    local m=$(( (total_s % 3600) / 60 ))
    local s=$(( total_s % 60 ))
    if [ "$h" -gt 0 ]; then
        [ "$m" -gt 0 ] && printf '%dh%dm' "$h" "$m" || printf '%dh' "$h"
    elif [ "$m" -gt 0 ]; then
        [ "$s" -gt 0 ] && printf '%dm%ds' "$m" "$s" || printf '%dm' "$m"
    else
        printf '%ds' "$s"
    fi
}

if [ -n "$total_duration_ms" ] && [ "$total_duration_ms" != "0" ]; then
    wall_fmt=$(fmt_duration_ms "$total_duration_ms")
    if [ -n "$total_api_duration_ms" ] && [ "$total_api_duration_ms" != "0" ]; then
        api_fmt=$(fmt_duration_ms "$total_api_duration_ms")
        duration_info=$(printf '\033[90m%s/%s\033[0m' "$api_fmt" "$wall_fmt")
    else
        duration_info=$(printf '\033[90m%s\033[0m' "$wall_fmt")
    fi
fi

# 会话总成本（USD，total_cost 已在顶部提取）
cost_info=""
if [ -n "$total_cost" ]; then
    cost_info=$(printf '\033[90m$%.2f\033[0m' "$total_cost")
fi

# 累计代码行变更数（已在顶部提取），两者均为 0 时不显示
lines_info=""
if [ -n "$lines_added" ] || [ -n "$lines_removed" ]; then
    added=${lines_added:-0}
    removed=${lines_removed:-0}
    # 两个都为 0 时不输出（无实质变更）
    if [ "$added" -gt 0 ] || [ "$removed" -gt 0 ]; then
        lines_info=$(printf '\033[32m+%d\033[0m/\033[31m-%d\033[0m' "$added" "$removed")
    fi
fi

# 构建当前目录的 file:// URL，用于 OSC 8 超链接（支持在访达中点击打开）
file_url="file://${cwd}"

# ── 第一行：工作区信息（目录 + git 分支 + git 变更行数）+ 核心会话状态（模型 + 上下文 + 费用）──
line1=""
# 绿色箭头前缀（仿 robbyrussell 的 ➜）
line1+=$(printf '\033[1;32m->\033[0m')
# 若项目根目录与当前目录不同，先显示项目名（暗色）再显示当前目录，整体包装为 OSC 8 超链接
if [ -n "$project_name" ]; then
    dir_text=$(printf '\033[2;36m%s/\033[0;36m%s\033[0m' "$project_name" "$dir_name")
else
    dir_text=$(printf '\033[0;36m%s\033[0m' "$dir_name")
fi
# 使用 OSC 8 将目录文本包装为 file:// 超链接，在支持的终端（如 Ghostty）中可点击打开访达
line1+=$(printf ' \033]8;;%s\033\\%s\033]8;;\033\\' "$file_url" "$dir_text")
# git 信息（分支 + 脏状态标记）
[ -n "$git_info" ] && line1+=" $git_info"
# git 当前工作区变更行数（新增/删除）
[ -n "$git_diff_info" ] && line1+=" $git_diff_info"
# 分隔符 + 模型名称 + 可选 effort.level + 可选 thinking 指示器
model_segment=$(printf '\033[34m%s\033[0m' "$model")
if [ -n "$effort_level" ]; then
    model_segment+=$(printf ' \033[90m[%s]\033[0m' "$effort_level")
fi
# thinking.enabled=true 时追加 [thinking] 暗色指示器
if [ "$thinking_enabled" = "true" ]; then
    model_segment+=$(printf ' \033[90m[thinking]\033[0m')
fi
line1+=$(printf ' \033[90m|\033[0m %s' "$model_segment")
# 上下文使用百分比（含用量/总量）
[ -n "$context_info" ] && line1+=$(printf ' \033[90m|\033[0m %s' "$context_info")
# 当前上下文缓存命中占比（cache N%）
[ -n "$cache_info" ] && line1+=$(printf ' \033[90m|\033[0m %s' "$cache_info")
# 会话总成本
[ -n "$cost_info" ] && line1+=$(printf ' \033[90m|\033[0m %s' "$cost_info")

# ── 第二行：rate_limits + 会话锚点 & 产出 + 资源 & 元信息（rate_limits + id + session_name + 代码行变更 + duration + worktree + agent + version + style）──
# 用数组收集各段，只有非空段加入，首段不加分隔符前缀
line2_parts=()

# 1. 5h rate limit：带阈值色 + 相对重置时间
if [ -n "$rl_5h_pct" ]; then
    pct_colored=$(fmt_rate_pct "$rl_5h_pct")
    if [ -n "$rl_5h_reset" ]; then
        reset_str=$(fmt_relative_time "$rl_5h_reset")
        line2_parts+=("$(printf '5h:%s(%s)' "$pct_colored" "$reset_str")")
    else
        line2_parts+=("$(printf '5h:%s' "$pct_colored")")
    fi
fi

# 2. 7d rate limit：带阈值色 + 相对重置时间（天数级，仅显示 Xd）
if [ -n "$rl_7d_pct" ]; then
    pct_colored=$(fmt_rate_pct "$rl_7d_pct")
    if [ -n "$rl_7d_reset" ]; then
        reset_str=$(fmt_relative_time "$rl_7d_reset")
        line2_parts+=("$(printf '7d:%s(%s)' "$pct_colored" "$reset_str")")
    else
        line2_parts+=("$(printf '7d:%s' "$pct_colored")")
    fi
fi

# 3. #xxxxxxxx：session_id 前 8 位作为会话锚点（暗灰；若有 transcript_path 则带 OSC 8 链向其父目录）
if [ -n "$session_id" ]; then
    short_id="${session_id:0:8}"
    if [ -n "$transcript_path" ]; then
        transcript_dir=$(dirname "$transcript_path")
        session_link=$(printf '\033]8;;file://%s\033\\#%s\033]8;;\033\\' "$transcript_dir" "$short_id")
        line2_parts+=("$(printf '\033[90m%s\033[0m' "$session_link")")
    else
        line2_parts+=("$(printf '\033[90m#%s\033[0m' "$short_id")")
    fi
fi

# 4. @session_name：/rename 设置后显示，紧跟 session_id（暗色）
if [ -n "$session_name" ]; then
    line2_parts+=("$(printf '\033[90m@%s\033[0m' "$session_name")")
fi

# 5. +N/-N：本次会话累计代码行变更（两者均为 0 则不显示）
[ -n "$lines_info" ] && line2_parts+=("$lines_info")

# 6. api/wall：会话 API 等待时间 / 总挂钟时间
[ -n "$duration_info" ] && line2_parts+=("$duration_info")

# 7. wt:NAME：当前所在 git worktree 名称（暗青色）
if [ -n "$git_worktree" ]; then
    line2_parts+=("$(printf '\033[2;36mwt:%s\033[0m' "$git_worktree")")
fi

# 8. agent:NAME：--agent 模式下的 agent 名称（暗色）
if [ -n "$agent_name" ]; then
    line2_parts+=("$(printf '\033[90magent:%s\033[0m' "$agent_name")")
fi

# 9. vX.Y.Z：版本号（已在顶部提取；暗灰；带 OSC 8 链到 CHANGELOG）
if [ -n "$version" ]; then
    version_link=$(printf '\033]8;;https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md\033\\v%s\033]8;;\033\\' "$version")
    line2_parts+=("$(printf '\033[90m%s\033[0m' "$version_link")")
fi

# 10. [STYLE]：output_style.name（已在顶部提取；暗灰；仅当非 "default" 时显示）
if [ -n "$output_style" ] && [ "$output_style" != "default" ]; then
    line2_parts+=("$(printf '\033[90m[%s]\033[0m' "$output_style")")
fi

# 拼装 Line 2：两空格缩进 + 各段以 " | " 连接
line2=""
if [ "${#line2_parts[@]}" -gt 0 ]; then
    line2="  "
    first=1
    for part in "${line2_parts[@]}"; do
        if [ "$first" = "1" ]; then
            line2+="$part"
            first=0
        else
            line2+=" | $part"
        fi
    done
fi

# ── 分别输出两行，每行独立输出确保 Claude Code 正确识别为单独行 ───────────
# 使用 %s 而非 %b，避免 %b 将 OSC 8 结束符中的 \f、\e 等重新解析为控制字符
printf '%s\n' "$line1"
[ -n "$line2" ] && printf '%s\n' "$line2"

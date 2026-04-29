#!/bin/bash

# 读取 JSON 输入
input=$(cat)

# 提取当前目录，取 basename（仿 robbyrussell 主题 %c）
cwd=$(echo "$input" | jq -r '.workspace.current_dir')
dir_name=$(basename "$cwd")

# 提取项目根目录（basename）
project_dir=$(echo "$input" | jq -r '.workspace.project_dir // empty')
project_name=""
if [ -n "$project_dir" ] && [ "$project_dir" != "$cwd" ]; then
    project_name=$(basename "$project_dir")
fi

# 提取模型名称
model=$(echo "$input" | jq -r '.model.display_name')

# 提取推理强度等级（仅在模型支持时存在）
effort_level=$(echo "$input" | jq -r '.effort.level // empty')

# 提取 thinking 状态（extended thinking 是否启用）
thinking_enabled=$(echo "$input" | jq -r '.thinking.enabled // false')

# 提取 exceeds_200k_tokens 警告标志
exceeds_200k=$(echo "$input" | jq -r '.exceeds_200k_tokens // false')

# 提取新增字段：git_worktree、agent 名称、session_name
git_worktree=$(echo "$input" | jq -r '.workspace.git_worktree // empty')
agent_name=$(echo "$input" | jq -r '.agent.name // empty')
session_name=$(echo "$input" | jq -r '.session_name // empty')

# 提取 rate_limits（Pro/Max 订阅用户专属限额信息）
rl_5h_pct=$(echo "$input" | jq -r '.rate_limits.five_hour.used_percentage // empty')
rl_5h_reset=$(echo "$input" | jq -r '.rate_limits.five_hour.resets_at // empty')
rl_7d_pct=$(echo "$input" | jq -r '.rate_limits.seven_day.used_percentage // empty')
rl_7d_reset=$(echo "$input" | jq -r '.rate_limits.seven_day.resets_at // empty')

# ── 工具函数：unix epoch 秒 → 相对时间字符串（如 2h30m、5d、45m）──
fmt_relative_time() {
    local target=$1
    local now=$(date +%s)
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
    local pct_int=$(printf '%.0f' "$pct_raw")
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
    cache_file="/tmp/statusline-git-cache-${cache_key}"
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

    # 尝试获取远程仓库 URL 并转换为可点击的 HTTPS 链接
    repo_url=""
    remote_url=$(GIT_OPTIONAL_LOCKS=0 git -C "$cwd" remote get-url origin 2>/dev/null || true)
    if [ -n "$remote_url" ]; then
        # 将 SSH 格式（git@github.com:user/repo.git）转换为 HTTPS 格式
        if echo "$remote_url" | grep -q '^git@'; then
            repo_url=$(echo "$remote_url" | sed 's|git@\([^:]*\):\(.*\)\.git$|https://\1/\2|' | sed 's|git@\([^:]*\):\(.*\)$|https://\1/\2|')
        elif echo "$remote_url" | grep -q '^ssh://'; then
            # 将 ssh://git@hostname:port/path/repo.git 转换为 https://hostname/path/repo
            # 去掉 ssh:// 前缀、用户名（git@）、端口号，替换为 https://，并去掉 .git 后缀
            repo_url=$(echo "$remote_url" | sed 's|^ssh://[^@]*@\([^:/]*\):[0-9]*/\(.*\)\.git$|https://\1/\2|' | sed 's|^ssh://[^@]*@\([^:/]*\):[0-9]*/\(.*\)$|https://\1/\2|')
        elif echo "$remote_url" | grep -q '^https\?://'; then
            # 去掉末尾 .git 后缀
            repo_url=$(echo "$remote_url" | sed 's|\.git$||')
        fi
        # 若有分支则拼接分支路径（GitHub/GitLab 风格）
        if [ -n "$repo_url" ] && [ -n "$git_branch" ] && [ "$git_branch" != "detached" ]; then
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

# 提取会话累计 token 计数（总输入 / 总输出）
total_tokens_info=""
total_input_tokens=$(echo "$input" | jq -r '.context_window.total_input_tokens // empty')
total_output_tokens=$(echo "$input" | jq -r '.context_window.total_output_tokens // empty')
if [ -n "$total_input_tokens" ] && [ "$total_input_tokens" != "0" ]; then
    in_fmt=$(awk "BEGIN {printf \"%.0fk\", $total_input_tokens/1000}")
    out_fmt=""
    if [ -n "$total_output_tokens" ] && [ "$total_output_tokens" != "0" ]; then
        out_fmt=$(awk "BEGIN {printf \"%.0fk\", $total_output_tokens/1000}")
    fi
    if [ -n "$out_fmt" ]; then
        total_tokens_info=$(printf '\033[90min:%s out:%s\033[0m' "$in_fmt" "$out_fmt")
    else
        total_tokens_info=$(printf '\033[90min:%s\033[0m' "$in_fmt")
    fi
fi

# 计算上下文窗口使用百分比及 token 统计
context_info=""
used_pct=$(echo "$input" | jq -r '.context_window.used_percentage // empty')
if [ -n "$used_pct" ]; then
    # 根据使用比例选择颜色：低于 70% 绿色，70%-90% 黄色，超过 90% 红色
    used_int=$(printf '%.0f' "$used_pct")
    # 提取当前用量（input_tokens + cache_creation_input_tokens + cache_read_input_tokens）和窗口总大小
    # 与 used_percentage 的计算公式保持一致，不包含 output_tokens
    ctx_current=$(echo "$input" | jq -r '
        (.context_window.current_usage.input_tokens // 0) +
        (.context_window.current_usage.cache_creation_input_tokens // 0) +
        (.context_window.current_usage.cache_read_input_tokens // 0)
        | if . == 0 then empty else . end
    ')
    ctx_total=$(echo "$input" | jq -r '.context_window.context_window_size // empty')
    # 将数值格式化为 k 单位
    ctx_current_fmt=""
    ctx_total_fmt=""
    if [ -n "$ctx_current" ]; then
        ctx_current_fmt=$(awk "BEGIN {printf \"%.0fk\", $ctx_current/1000}")
    fi
    if [ -n "$ctx_total" ]; then
        ctx_total_fmt=$(awk "BEGIN {printf \"%.0fk\", $ctx_total/1000}")
    fi
    # 构建窗口用量附加信息（如 90k/200k）
    ctx_usage_suffix=""
    if [ -n "$ctx_current_fmt" ] && [ -n "$ctx_total_fmt" ]; then
        ctx_usage_suffix=" (${ctx_current_fmt}/${ctx_total_fmt})"
    fi
    # exceeds_200k_tokens 为 true 时在 ctx 前加红色警告前缀
    ctx_warn_prefix=""
    if [ "$exceeds_200k" = "true" ]; then
        ctx_warn_prefix=$(printf '\033[31m⚠ \033[0m')
    fi
    if [ "$used_int" -ge 90 ]; then
        context_info=$(printf '%sctx \033[31m%d%%\033[0m\033[90m%s\033[0m' "$ctx_warn_prefix" "$used_int" "$ctx_usage_suffix")
    elif [ "$used_int" -ge 70 ]; then
        context_info=$(printf '%sctx \033[33m%d%%\033[0m\033[90m%s\033[0m' "$ctx_warn_prefix" "$used_int" "$ctx_usage_suffix")
    else
        context_info=$(printf '%sctx \033[32m%d%%\033[0m\033[90m%s\033[0m' "$ctx_warn_prefix" "$used_int" "$ctx_usage_suffix")
    fi
fi

# 提取会话耗时：total_duration_ms（总挂钟时间）和 total_api_duration_ms（API 等待时间）
duration_info=""
total_duration_ms=$(echo "$input" | jq -r '.cost.total_duration_ms // empty')
total_api_duration_ms=$(echo "$input" | jq -r '.cost.total_api_duration_ms // empty')

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

# 提取会话总成本（USD）
cost_info=""
total_cost=$(echo "$input" | jq -r '.cost.total_cost_usd // empty')
if [ -n "$total_cost" ]; then
    cost_info=$(printf '\033[90m$%.4f\033[0m' "$total_cost")
fi

# 提取累计代码行变更数（新增/删除），两者均为 0 时不显示
lines_info=""
lines_added=$(echo "$input" | jq -r '.cost.total_lines_added // empty')
lines_removed=$(echo "$input" | jq -r '.cost.total_lines_removed // empty')
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
# thinking.enabled=true 时追加 [💭] 暗色指示器
if [ "$thinking_enabled" = "true" ]; then
    model_segment+=$(printf ' \033[90m[💭]\033[0m')
fi
line1+=$(printf ' \033[90m|\033[0m %s' "$model_segment")
# 上下文使用百分比（含用量/总量；exceeds_200k 时含红色 ⚠ 前缀）
[ -n "$context_info" ] && line1+=$(printf ' \033[90m|\033[0m %s' "$context_info")
# 会话累计 token 计数（in:Xk out:Yk）
[ -n "$total_tokens_info" ] && line1+=$(printf ' \033[90m|\033[0m %s' "$total_tokens_info")
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
session_id=$(echo "$input" | jq -r '.session_id // empty')
transcript_path=$(echo "$input" | jq -r '.transcript_path // empty')
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

# 9. vX.Y.Z：版本号（暗灰；带 OSC 8 链到 CHANGELOG）
version=$(echo "$input" | jq -r '.version // empty')
if [ -n "$version" ]; then
    version_link=$(printf '\033]8;;https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md\033\\v%s\033]8;;\033\\' "$version")
    line2_parts+=("$(printf '\033[90m%s\033[0m' "$version_link")")
fi

# 10. [STYLE]：output_style.name（暗灰；仅当非 "default" 时显示）
output_style=$(echo "$input" | jq -r '.output_style.name // empty')
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

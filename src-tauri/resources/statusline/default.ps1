# Claude Code 默认状态行脚本（Windows / PowerShell 版）
# 功能完整对齐 resources/statusline/default.sh：两行布局、目录/项目名、git 分支与脏标记、
# diff 行数、模型/effort/thinking、上下文百分比、token、费用、rate limits、session id、
# worktree、agent、版本、output style、ANSI 颜色与 OSC 8 超链接。
# PowerShell 与 ConvertFrom-Json 为系统自带，无需 jq；git 由 Git for Windows 提供。

# 状态行追求健壮而非严格：单个字段异常不应导致整行无输出
$ErrorActionPreference = 'SilentlyContinue'
# 强制 UTF-8 输出，避免 ->、⚠、💭 等字符被系统代码页破坏
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

# ── ANSI 颜色常量（用拼接构造，避免字符串插值把 $var[ 当作索引）──
$ESC = [char]27
$C_RESET = $ESC + '[0m'
$C_1_32  = $ESC + '[1;32m'   # 绿色粗体（箭头）
$C_0_36  = $ESC + '[0;36m'   # 青色（当前目录）
$C_2_36  = $ESC + '[2;36m'   # 暗青色（项目名 / worktree）
$C_0_31  = $ESC + '[0;31m'   # 红色（分支名）
$C_1_34  = $ESC + '[1;34m'   # 蓝色粗体（git 括号）
$C_0_33  = $ESC + '[0;33m'   # 黄色（dirty 标记）
$C_34    = $ESC + '[34m'     # 蓝色（模型名）
$C_32    = $ESC + '[32m'     # 绿色（新增行 / 低用量）
$C_33    = $ESC + '[33m'     # 黄色（中等用量）
$C_31    = $ESC + '[31m'     # 红色（删除行 / 高用量 / 警告）
$C_90    = $ESC + '[90m'     # 暗灰（分隔符、token、时长、版本等）

# ── 工具函数 ───────────────────────────────────────────────
# 安全读取嵌套字段（路径任一层为 null 即返回 null）
function Get-Field($obj, [string[]]$path) {
    $cur = $obj
    foreach ($p in $path) {
        if ($null -eq $cur) { return $null }
        $cur = $cur.$p
    }
    return $cur
}

# 数值化（null/空 → 0）
function AsNum($v) {
    if ($null -eq $v -or "$v" -eq '') { return 0 }
    try { return [double]$v } catch { return 0 }
}

# 安全整数解析（失败 → 0）
function ToInt($v) {
    $n = 0
    [void][int]::TryParse("$v", [ref]$n)
    return $n
}

# OSC 8 超链接：ESC ]8;; URL ESC \ TEXT ESC ]8;; ESC \
function Osc8($url, $text) {
    return $ESC + ']8;;' + $url + $ESC + '\' + $text + $ESC + ']8;;' + $ESC + '\'
}

# unix epoch 秒 → 相对时间字符串（如 2h30m、5d、45m）
function Format-RelativeTime($target) {
    try { $t = [int64][math]::Floor([double]$target) } catch { return '' }
    $now = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
    $diff = $t - $now
    if ($diff -le 0) { return 'now' }
    $d = [math]::Floor($diff / 86400)
    $h = [math]::Floor(($diff % 86400) / 3600)
    $m = [math]::Floor(($diff % 3600) / 60)
    if ($d -gt 0) {
        if ($h -gt 0) { return ('{0}d{1}h' -f $d, $h) } else { return ('{0}d' -f $d) }
    } elseif ($h -gt 0) {
        if ($m -gt 0) { return ('{0}h{1}m' -f $h, $m) } else { return ('{0}h' -f $h) }
    } else {
        return ('{0}m' -f $m)
    }
}

# rate limit 百分比 → 带 ANSI 颜色字符串（<70 绿,70-89 黄,≥90 红）
function Format-RatePct($pctRaw) {
    $pctInt = [int][math]::Round([double]$pctRaw)
    if ($pctInt -ge 90) { return $C_31 + $pctInt + '%' + $C_RESET }
    elseif ($pctInt -ge 70) { return $C_33 + $pctInt + '%' + $C_RESET }
    else { return $C_32 + $pctInt + '%' + $C_RESET }
}

# 毫秒 → 可读时间字符串（如 1m30s、45s、2h3m）
function Format-DurationMs($ms) {
    $totalS = [int64]([double]$ms / 1000)
    $h = [math]::Floor($totalS / 3600)
    $m = [math]::Floor(($totalS % 3600) / 60)
    $s = $totalS % 60
    if ($h -gt 0) {
        if ($m -gt 0) { return ('{0}h{1}m' -f $h, $m) } else { return ('{0}h' -f $h) }
    } elseif ($m -gt 0) {
        if ($s -gt 0) { return ('{0}m{1}s' -f $m, $s) } else { return ('{0}m' -f $m) }
    } else {
        return ('{0}s' -f $s)
    }
}

# 千分位 k 格式化（如 90k）
function Format-K($n) {
    return ('{0:0}k' -f ([double]$n / 1000))
}

# ── 读取并解析 stdin JSON ──────────────────────────────────
$stdin = [Console]::In.ReadToEnd()
if ([string]::IsNullOrWhiteSpace($stdin)) { exit 0 }
try { $data = $stdin | ConvertFrom-Json } catch { exit 0 }

# ── 提取基础字段 ───────────────────────────────────────────
$cwd = Get-Field $data @('workspace', 'current_dir')
if (-not $cwd) { $cwd = '' }
$dirName = if ($cwd) { Split-Path $cwd -Leaf } else { '' }

# 项目根目录（与当前目录不同时显示项目名）
$projectDir = Get-Field $data @('workspace', 'project_dir')
$projectName = ''
if ($projectDir -and $projectDir -ne $cwd) {
    $projectName = Split-Path $projectDir -Leaf
}

$model = Get-Field $data @('model', 'display_name')
$effortLevel = Get-Field $data @('effort', 'level')
$thinkingEnabled = Get-Field $data @('thinking', 'enabled')
$exceeds200k = Get-Field $data @('exceeds_200k_tokens')
$gitWorktree = Get-Field $data @('workspace', 'git_worktree')
$agentName = Get-Field $data @('agent', 'name')
$sessionName = Get-Field $data @('session_name')

$rl5hPct = Get-Field $data @('rate_limits', 'five_hour', 'used_percentage')
$rl5hReset = Get-Field $data @('rate_limits', 'five_hour', 'resets_at')
$rl7dPct = Get-Field $data @('rate_limits', 'seven_day', 'used_percentage')
$rl7dReset = Get-Field $data @('rate_limits', 'seven_day', 'resets_at')

# ── git 分支、脏状态及变更行数（带缓存，避免频繁执行 git diff）──
$gitInfo = ''
$gitDiffInfo = ''
$env:GIT_OPTIONAL_LOCKS = '0'
$gitAvailable = $null -ne (Get-Command git -ErrorAction SilentlyContinue)

if ($cwd -and $gitAvailable) {
    $null = git -C $cwd rev-parse --git-dir 2>$null
    if ($LASTEXITCODE -eq 0) {
        # 以 git 根目录路径的 MD5 前 8 位作为缓存 key，区分不同仓库
        $gitRoot = git -C $cwd rev-parse --show-toplevel 2>$null
        if (-not $gitRoot) { $gitRoot = $cwd }
        $md5 = [System.Security.Cryptography.MD5]::Create()
        $hashBytes = $md5.ComputeHash([System.Text.Encoding]::UTF8.GetBytes("$gitRoot"))
        $cacheKey = (($hashBytes | ForEach-Object { $_.ToString('x2') }) -join '').Substring(0, 8)
        $cacheDir = if ($env:TEMP) { $env:TEMP } else { [System.IO.Path]::GetTempPath() }
        $cacheFile = Join-Path $cacheDir "statusline-git-cache-$cacheKey"
        $cacheMaxAge = 5

        # 缓存是否过期
        $cacheStale = $true
        if (Test-Path $cacheFile) {
            $mtime = [DateTimeOffset]((Get-Item $cacheFile).LastWriteTimeUtc).ToUnixTimeSeconds()
            $age = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds() - $mtime
            if ($age -le $cacheMaxAge) { $cacheStale = $false }
        }

        if ($cacheStale) {
            $gitBranch = git -C $cwd branch --show-current 2>$null
            if (-not $gitBranch) { $gitBranch = 'detached' }
            # 统计工作区 + 暂存区变更行数
            $worktreeStat = git -C $cwd diff --numstat 2>$null
            $stagedStat = git -C $cwd diff --cached --numstat 2>$null
            $diffAdded = 0
            $diffRemoved = 0
            foreach ($line in (@($worktreeStat) + @($stagedStat))) {
                if (-not $line) { continue }
                $cols = $line -split "`t"
                if ($cols.Count -ge 2) {
                    if ($cols[0] -ne '-') { $diffAdded += (ToInt $cols[0]) }
                    if ($cols[1] -ne '-') { $diffRemoved += (ToInt $cols[1]) }
                }
            }
            $dirty = if ($worktreeStat -or $stagedStat) { 1 } else { 0 }
            ("$gitBranch|$dirty|$diffAdded|$diffRemoved") | Set-Content -LiteralPath $cacheFile -Encoding UTF8 -NoNewline
        }

        # 从缓存读取
        $cacheContent = (Get-Content -LiteralPath $cacheFile -Raw -Encoding UTF8)
        if ($cacheContent) { $cacheContent = $cacheContent.TrimEnd("`r", "`n") }
        $parts = "$cacheContent" -split '\|'
        $gitBranch = if ($parts.Count -ge 1) { $parts[0] } else { 'detached' }
        $dirty = if ($parts.Count -ge 2) { $parts[1] } else { '0' }
        $diffAdded = if ($parts.Count -ge 3) { ToInt $parts[2] } else { 0 }
        $diffRemoved = if ($parts.Count -ge 4) { ToInt $parts[3] } else { 0 }

        # 远程仓库 URL → 可点击的 HTTPS 链接
        $repoUrl = ''
        $remoteUrl = git -C $cwd remote get-url origin 2>$null
        if ($remoteUrl) {
            $remoteUrl = "$remoteUrl".Trim()
            if ($remoteUrl -match '^git@') {
                # git@host:user/repo(.git) → https://host/user/repo
                $repoUrl = $remoteUrl -replace '^git@([^:]+):(.*?)(\.git)?$', 'https://$1/$2'
            } elseif ($remoteUrl -match '^ssh://') {
                # ssh://git@host:port/path/repo(.git) → https://host/path/repo
                $repoUrl = $remoteUrl -replace '^ssh://[^@]*@([^:/]+):?[0-9]*/(.*?)(\.git)?$', 'https://$1/$2'
            } elseif ($remoteUrl -match '^https?://') {
                $repoUrl = $remoteUrl -replace '\.git$', ''
            }
            if ($repoUrl -and $gitBranch -and $gitBranch -ne 'detached') {
                $repoUrl = "$repoUrl/tree/$gitBranch"
            }
        }

        # 带 OSC 8 超链接的分支文本
        if ($repoUrl) {
            $branchLink = Osc8 $repoUrl $gitBranch
        } else {
            $branchLink = $gitBranch
        }

        # 根据 dirty 状态选择样式
        if ("$dirty" -eq '1') {
            $gitInfo = $C_1_34 + 'git:(' + $C_0_31 + $branchLink + $C_1_34 + ')' + $C_0_33 + ' x' + $C_RESET
        } else {
            $gitInfo = $C_1_34 + 'git:(' + $C_0_31 + $branchLink + $C_1_34 + ')' + $C_RESET
        }
        # git diff 行数（仅在有变更时显示）
        if ("$dirty" -eq '1' -and ($diffAdded -gt 0 -or $diffRemoved -gt 0)) {
            $gitDiffInfo = $C_32 + '+' + $diffAdded + $C_RESET + '/' + $C_31 + '-' + $diffRemoved + $C_RESET
        }
    }
}

# ── 会话累计 token 计数（in:Xk out:Yk）──
$totalTokensInfo = ''
$totalInput = Get-Field $data @('context_window', 'total_input_tokens')
$totalOutput = Get-Field $data @('context_window', 'total_output_tokens')
if ($totalInput -and (AsNum $totalInput) -ne 0) {
    $inFmt = Format-K $totalInput
    if ($totalOutput -and (AsNum $totalOutput) -ne 0) {
        $outFmt = Format-K $totalOutput
        $totalTokensInfo = $C_90 + 'in:' + $inFmt + ' out:' + $outFmt + $C_RESET
    } else {
        $totalTokensInfo = $C_90 + 'in:' + $inFmt + $C_RESET
    }
}

# ── 上下文窗口使用百分比及用量 ──
$contextInfo = ''
$usedPct = Get-Field $data @('context_window', 'used_percentage')
if ($null -ne $usedPct -and "$usedPct" -ne '') {
    $usedInt = [int][math]::Round([double]$usedPct)
    # 当前用量 = input + cache_creation + cache_read（与 used_percentage 公式一致，不含 output）
    $ctxCurrent = (AsNum (Get-Field $data @('context_window', 'current_usage', 'input_tokens'))) +
                  (AsNum (Get-Field $data @('context_window', 'current_usage', 'cache_creation_input_tokens'))) +
                  (AsNum (Get-Field $data @('context_window', 'current_usage', 'cache_read_input_tokens')))
    $ctxTotal = Get-Field $data @('context_window', 'context_window_size')
    $ctxCurrentFmt = ''
    $ctxTotalFmt = ''
    if ($ctxCurrent -gt 0) { $ctxCurrentFmt = Format-K $ctxCurrent }
    if ($ctxTotal -and (AsNum $ctxTotal) -ne 0) { $ctxTotalFmt = Format-K $ctxTotal }
    $ctxUsageSuffix = ''
    if ($ctxCurrentFmt -and $ctxTotalFmt) { $ctxUsageSuffix = ' (' + $ctxCurrentFmt + '/' + $ctxTotalFmt + ')' }
    # exceeds_200k_tokens 时加红色 ⚠ 前缀
    $ctxWarnPrefix = ''
    if ($exceeds200k) { $ctxWarnPrefix = $C_31 + ([char]0x26A0) + ' ' + $C_RESET }
    if ($usedInt -ge 90) {
        $contextInfo = $ctxWarnPrefix + 'ctx ' + $C_31 + $usedInt + '%' + $C_RESET + $C_90 + $ctxUsageSuffix + $C_RESET
    } elseif ($usedInt -ge 70) {
        $contextInfo = $ctxWarnPrefix + 'ctx ' + $C_33 + $usedInt + '%' + $C_RESET + $C_90 + $ctxUsageSuffix + $C_RESET
    } else {
        $contextInfo = $ctxWarnPrefix + 'ctx ' + $C_32 + $usedInt + '%' + $C_RESET + $C_90 + $ctxUsageSuffix + $C_RESET
    }
}

# ── 会话耗时（api/wall）──
$durationInfo = ''
$totalDurationMs = Get-Field $data @('cost', 'total_duration_ms')
$totalApiDurationMs = Get-Field $data @('cost', 'total_api_duration_ms')
if ($totalDurationMs -and (AsNum $totalDurationMs) -ne 0) {
    $wallFmt = Format-DurationMs $totalDurationMs
    if ($totalApiDurationMs -and (AsNum $totalApiDurationMs) -ne 0) {
        $apiFmt = Format-DurationMs $totalApiDurationMs
        $durationInfo = $C_90 + $apiFmt + '/' + $wallFmt + $C_RESET
    } else {
        $durationInfo = $C_90 + $wallFmt + $C_RESET
    }
}

# ── 会话总成本（USD）──
$costInfo = ''
$totalCost = Get-Field $data @('cost', 'total_cost_usd')
if ($null -ne $totalCost -and "$totalCost" -ne '') {
    $amount = '{0:0.0000}' -f [double]$totalCost
    $costInfo = $C_90 + '$' + $amount + $C_RESET
}

# ── 累计代码行变更（新增/删除，均为 0 不显示）──
$linesInfo = ''
$linesAdded = Get-Field $data @('cost', 'total_lines_added')
$linesRemoved = Get-Field $data @('cost', 'total_lines_removed')
if ($null -ne $linesAdded -or $null -ne $linesRemoved) {
    $added = [int](AsNum $linesAdded)
    $removed = [int](AsNum $linesRemoved)
    if ($added -gt 0 -or $removed -gt 0) {
        $linesInfo = $C_32 + '+' + $added + $C_RESET + '/' + $C_31 + '-' + $removed + $C_RESET
    }
}

# 当前目录的 file:// URL（Windows 路径转正斜杠）
$fileUrl = 'file:///' + ("$cwd" -replace '\\', '/')

# ── 第一行：工作区信息 + 核心会话状态 ──
$line1 = $C_1_32 + '->' + $C_RESET
if ($projectName) {
    $dirText = $C_2_36 + $projectName + '/' + $C_0_36 + $dirName + $C_RESET
} else {
    $dirText = $C_0_36 + $dirName + $C_RESET
}
# 目录文本包装为 OSC 8 file:// 超链接
$line1 += ' ' + (Osc8 $fileUrl $dirText)
if ($gitInfo) { $line1 += ' ' + $gitInfo }
if ($gitDiffInfo) { $line1 += ' ' + $gitDiffInfo }
# 模型名 + 可选 effort.level + 可选 thinking 指示器
$modelSegment = $C_34 + $model + $C_RESET
if ($effortLevel) { $modelSegment += ' ' + $C_90 + '[' + $effortLevel + ']' + $C_RESET }
if ($thinkingEnabled) { $modelSegment += ' ' + $C_90 + '[' + ([char]::ConvertFromUtf32(0x1F4AD)) + ']' + $C_RESET }
$line1 += ' ' + $C_90 + '|' + $C_RESET + ' ' + $modelSegment
if ($contextInfo) { $line1 += ' ' + $C_90 + '|' + $C_RESET + ' ' + $contextInfo }
if ($totalTokensInfo) { $line1 += ' ' + $C_90 + '|' + $C_RESET + ' ' + $totalTokensInfo }
if ($costInfo) { $line1 += ' ' + $C_90 + '|' + $C_RESET + ' ' + $costInfo }

# ── 第二行：rate_limits + 会话锚点 & 产出 + 资源 & 元信息 ──
$line2Parts = @()

# 1. 5h rate limit
if ($null -ne $rl5hPct -and "$rl5hPct" -ne '') {
    $pctColored = Format-RatePct $rl5hPct
    if ($null -ne $rl5hReset -and "$rl5hReset" -ne '') {
        $resetStr = Format-RelativeTime $rl5hReset
        $line2Parts += ('5h:' + $pctColored + '(' + $resetStr + ')')
    } else {
        $line2Parts += ('5h:' + $pctColored)
    }
}

# 2. 7d rate limit
if ($null -ne $rl7dPct -and "$rl7dPct" -ne '') {
    $pctColored = Format-RatePct $rl7dPct
    if ($null -ne $rl7dReset -and "$rl7dReset" -ne '') {
        $resetStr = Format-RelativeTime $rl7dReset
        $line2Parts += ('7d:' + $pctColored + '(' + $resetStr + ')')
    } else {
        $line2Parts += ('7d:' + $pctColored)
    }
}

# 3. #xxxxxxxx：session_id 前 8 位（有 transcript_path 则带 OSC 8 链向其父目录）
$sessionId = Get-Field $data @('session_id')
$transcriptPath = Get-Field $data @('transcript_path')
if ($sessionId) {
    $sid = "$sessionId"
    $shortId = $sid.Substring(0, [math]::Min(8, $sid.Length))
    if ($transcriptPath) {
        $transcriptDir = Split-Path $transcriptPath -Parent
        $transcriptUrl = 'file:///' + ("$transcriptDir" -replace '\\', '/')
        $sessionLink = Osc8 $transcriptUrl ('#' + $shortId)
        $line2Parts += ($C_90 + $sessionLink + $C_RESET)
    } else {
        $line2Parts += ($C_90 + '#' + $shortId + $C_RESET)
    }
}

# 4. @session_name
if ($sessionName) { $line2Parts += ($C_90 + '@' + $sessionName + $C_RESET) }

# 5. +N/-N：本次会话累计代码行变更
if ($linesInfo) { $line2Parts += $linesInfo }

# 6. api/wall：会话耗时
if ($durationInfo) { $line2Parts += $durationInfo }

# 7. wt:NAME：当前 git worktree 名称
if ($gitWorktree) { $line2Parts += ($C_2_36 + 'wt:' + $gitWorktree + $C_RESET) }

# 8. agent:NAME：--agent 模式下的 agent 名称
if ($agentName) { $line2Parts += ($C_90 + 'agent:' + $agentName + $C_RESET) }

# 9. vX.Y.Z：版本号（带 OSC 8 链到 CHANGELOG）
$version = Get-Field $data @('version')
if ($version) {
    $versionLink = Osc8 'https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md' ('v' + $version)
    $line2Parts += ($C_90 + $versionLink + $C_RESET)
}

# 10. [STYLE]：output_style.name（仅当非 default 时显示）
$outputStyle = Get-Field $data @('output_style', 'name')
if ($outputStyle -and $outputStyle -ne 'default') {
    $line2Parts += ($C_90 + '[' + $outputStyle + ']' + $C_RESET)
}

# 拼装 Line 2：两空格缩进 + 各段以 " | " 连接
$line2 = ''
if ($line2Parts.Count -gt 0) {
    $line2 = '  ' + ($line2Parts -join ' | ')
}

# ── 分别输出两行（用 [Console]::Out.Write 配合 UTF-8 编码，避免 CRLF 与编码问题）──
[Console]::Out.Write($line1 + "`n")
if ($line2) { [Console]::Out.Write($line2 + "`n") }

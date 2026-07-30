# Requirements Document

## Introduction

Solara（光域）是一款部署在 Cloudflare Pages 上的网页音乐播放器，当前通过 Cloudflare Pages Functions 代理 GD Studio 公共 API（`https://music-api.gdstudio.xyz/api.php`）。本次优化对齐上游 API 文档与项目实际行为之间的差距，统一缓存策略、增强容错与限流处理，并修正若干与 Cloudflare Pages Functions 兼容性相关的问题，使播放器在 Cloudflare 免费套餐下保持稳定。

## Glossary

- **System**：Solara 播放器项目，包含前端静态资源与 Cloudflare Pages Functions 后端。
- **Proxy Function**：Cloudflare Pages Functions 中由 `functions/proxy.ts` 暴露的 `/proxy` 路径，统一处理 GD Studio API 请求与音频直链代理。
- **GD Studio API**：上游音乐数据接口 `https://music-api.gdstudio.xyz/api.php`，支持 `types=search|url|lyric|pic|playlist` 五类操作及 `_album` 高级用法。
- **Stable Source**：GD Studio 公告中标记为稳定的音乐源集合，本项目固定为 `netease`、`joox`、`bilibili`。
- **Audio Direct URL**：上游音源返回的、需通过代理解决跨域的音频直链（含 Kuwo 等仅允许特定 Referer 的来源）。
- **Cache Tier**：根据资源类型（搜索/详情/封面/歌词/音频）划分的 Cloudflare Cache 缓存档位。

## Requirements

### Requirement 1: 对齐 GD Studio API 参数语义

**User Story:** AS 播放器用户，I want 搜索、歌单、歌词与封面接口的参数与上游文档一致，so that 搜索结果更准确、歌单翻页与专辑曲库查询可用。

#### Acceptance Criteria

1. WHEN 调用 `types=playlist` 接口，THE Proxy Function SHALL 支持同时解析 `id` 与 `count`/`pages` 两个分页参数，并将请求转发至上游 `id={id}&count={count}&pages={pages}`。
2. WHEN 调用 `types=search` 接口，THE Proxy Function SHALL 将 `count` 与 `pages` 原样转发，且默认值分别为 20 与 1。
3. WHEN 调用 `types=pic` 接口，THE Proxy Function SHALL 支持 `size` 参数（300 或 500）并转发至上游，未提供时默认 300。
4. WHEN 调用任意接口，THE Proxy Function SHALL 将前端附带的随机签名参数 `s` 直接转发，丢弃本地伪造签名逻辑。

### Requirement 2: 统一按类型的缓存策略

**User Story:** AS 部署者，I want 接口响应按资源类型缓存，so that 在 Cloudflare 免费配额内最大化命中并降低上游压力。

#### Acceptance Criteria

1. WHEN Proxy Function 返回 `types=pic` 响应，THE Proxy Function SHALL 设置 `Cache-Control: public, max-age=86400, s-maxage=604800`。
2. WHEN Proxy Function 返回 `types=url` 响应，THE Proxy Function SHALL 设置 `Cache-Control: public, max-age=600, s-maxage=600`。
3. WHEN Proxy Function 返回 `types=lyric` 响应，THE Proxy Function SHALL 设置 `Cache-Control: public, max-age=3600, s-maxage=86400`。
4. WHEN Proxy Function 返回 `types=search` 响应且来源属于稳定音乐源，THE Proxy Function SHALL 设置 `Cache-Control: public, max-age=10, s-maxage=30`；其他来源 SHALL 设置 `public, max-age=10, s-maxage=10`。
5. IF 上游自身携带 `Cache-Control`，THE Proxy Function SHALL 透传上游头覆盖默认缓存策略。

### Requirement 3: 上游错误与限流处理

**User Story:** AS 播放器用户，I want 上游临时故障或限流时得到明确提示，so that 不会反复失败且能优雅降级。

#### Acceptance Criteria

1. IF 上游返回 HTTP 429，THE Proxy Function SHALL 返回 HTTP 429 与 JSON `{ "error": "rate_limited", "retryAfter": <秒数> }`，并透传上游 `Retry-After` 头。
2. IF 上游返回 HTTP 5xx 或网络异常，THE Proxy Function SHALL 返回 HTTP 502 与 JSON `{ "error": "upstream_unavailable" }`。
3. IF 请求参数缺失 `types`，THE Proxy Function SHALL 返回 HTTP 400 与 JSON `{ "error": "missing_types" }`。
4. WHEN 上游返回成功 JSON，THE Proxy Function SHALL 直接以流式方式透传响应体，不在 Worker 中完整缓冲。

### Requirement 4: 音频直链代理安全策略

**User Story:** AS 部署者，I want 仅允许代理白名单内的音频直链，so that 防止代理被滥用为开放转发器。

#### Acceptance Criteria

1. WHEN `target` 参数指向 Kuwo 域名（匹配 `kuwo.cn`），THE Proxy Function SHALL 使用固定 `Referer: https://www.kuwo.cn/` 与浏览器 User-Agent 转发请求，并强制协议为 HTTP。
2. IF `target` 参数的主机名不在白名单内，THE Proxy Function SHALL 返回 HTTP 400 与 JSON `{ "error": "invalid_target" }`。
3. WHEN 转发音频请求携带 `Range` 头，THE Proxy Function SHALL 将 `Range` 头原样转发给上游以支持 seek。
4. WHEN 音频响应成功，THE Proxy Function SHALL 设置 `Cache-Control: public, max-age=3600, s-maxage=86400` 且保留 `accept-ranges`、`content-range`、`content-length` 头。

### Requirement 5: 前端 API 客户端规范化

**User Story:** AS 维护者，I want 前端 API 客户端逻辑清晰、无副作用，so that 减少不必要的重新生成与调试噪音。

#### Acceptance Criteria

1. WHEN 前端调用任意 API，THE 前端 SHALL 直接使用上游要求的 `types`、`source`、`id`、`br`、`size`、`count`、`pages` 参数构造请求 URL，不再附加伪造 `s` 签名参数。
2. WHEN 调用 `types=playlist` 接口，THE 前端 SHALL 使用 `id` 与 `count`/`pages` 而非 `limit/offset`，与上游文档对齐。
3. WHEN 调用 `types=pic` 接口，THE 前端 SHALL 在需要大图时使用 `size=500`，默认 `size=300`。
4. IF 上游返回 429 或 5xx，THE 前端 SHALL 通过 `debugLog` 打印响应状态并提示用户稍后重试，不进入死循环重试。

### Requirement 6: Cloudflare Pages Functions 兼容性

**User Story:** AS 部署者，I want Functions 全部使用 Workers 兼容写法，so that 部署后无运行时警告且在 10ms CPU 预算内完成。

#### Acceptance Criteria

1. THE Proxy Function SHALL 通过 `export async function onRequest(context)` 单一入口导出，与 `_middleware.ts` 风格一致。
2. WHEN Proxy Function 调用上游，THE Proxy Function SHALL 使用 `fetch` 原生 API 并直接传递上游 `Response.body` 流，避免 `await response.text()` 中间缓冲。
3. THE Proxy Function SHALL 不引入 Node.js 内置模块（如 `crypto`、`buffer`）而仅依赖 Web 标准 API。
4. WHEN Proxy Function 出现未捕获异常，THE Proxy Function SHALL 返回 HTTP 500 与 JSON `{ "error": "internal_error" }`，且不泄露堆栈信息。

### Requirement 7: README 与缓存头校验脚本

**User Story:** AS 部署者，I want 在 README 中说明本次优化点与缓存生效验证方法，so that 上线后可快速核对。

#### Acceptance Criteria

1. THE README SHALL 新增「优化变更」一节，列出本需求文档的六大优化点。
2. THE README SHALL 给出 `curl -I <部署域名>/proxy?types=pic&id=test` 的示例，用于人工核对 `Cache-Control` 头。
3. THE README SHALL 提示 `_middleware.ts` 的鉴权逻辑未改动，仅新增/修改 `proxy.ts` 与 `js/index.js` 中的 API 调用层。

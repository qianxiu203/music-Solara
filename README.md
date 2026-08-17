# 🎶 Solara（光域）

> 🌐 由轻量后端服务支撑的现代化网页音乐播放器，整合多种音乐聚合接口，覆盖搜索、播放与音频下载全流程。

![Review-ezgif com-optimize](https://github.com/user-attachments/assets/487157de-bf71-4bc9-9e49-16a4f0a14472)
| | | |
|:--:|:--:|:--:|
| <img src="https://github.com/user-attachments/assets/7fcfd485-bcd4-46f9-887a-0a972dce3be3" height="700"/> | <img src="https://github.com/user-attachments/assets/bb092569-0a7f-47f6-b7e9-c07ea56949cf" height="700"/> | <img src="https://github.com/user-attachments/assets/02b830e3-292f-4880-91f2-86ec818b877a" height="700"/> |


## 🤝 参与贡献
感谢 GD音乐台(music.gdstudio.xyz)提供的免费API

感谢 来自Linux.do 牛就是牛@ufoo 大佬 https://linux.do/t/topic/942415 提供的灵感


## 🌟 主要特性

- 🎨 主题美学：内置亮/暗模式与玻璃拟态界面，根据当前曲目封面自动取色渲染沉浸式背景，具备沉浸体验。
- 📱  竖屏移动端：全新竖屏布局匹配移动端手势与屏幕比例，按钮、列表与歌词均针对单手操作优化。
- 🔍 跨站曲库检索：一键切换数据源，支持分页浏览并批量导入播放队列。
- 📻 队列管理灵活：新增、删除、清空操作即时生效，并自动持久化到浏览器 localStorage。
- ❤️ 收藏列表：搜索结果与播放列表均可一键收藏，收藏列表拥有独立的播放进度、播放模式与批量操作面板。
- 🔁 丰富的播放模式：列表循环、单曲循环与随机播放随手切换，记忆上次偏好。
- 📝 动态歌词视图：逐行滚动高亮，当前行自动聚焦，手动滚动后短暂锁定视图。
- 🔄 列表导入导出：支持播放队列与收藏列表统一导入/导出，可一键迁移或恢复收藏歌曲并同步到播放队列。
- 📥 多码率下载：可挑选 128K / 192K / 320K / FLAC 等品质并直接获取音频文件。
- ☁️ 轻量后端代理：通过 Cloudflare Pages Functions 统一聚合各数据源并处理音频跨域。
- 🔒 锁屏播放控制：锁屏界面自动显示专辑封面与播放控件，无需解锁即可进行播放控制。
- 🛠️ 调试控制台：按下 Ctrl + D 呼出实时日志面板，便于排查接口或交互异常。

## 🚀 快速上手
根据使用的托管平台，推荐使用 Cloudflare Pages 进行部署：

### ✅ Cloudflare Pages
1. Fork 或克隆本仓库。
2. 按照 Cloudflare Pages 文档创建站点，并将本仓库作为构建来源或直接上传静态资源。
3. 部署完成后，通过 Cloudflare Pages 分配的域名访问站点即可体验播放器。

## ⚙️ 配置提示
- 后端代理位于 `functions/proxy.ts`，默认请求 GD音乐台接口。项目已针对 Cloudflare Pages 做了响应缓存、错误处理与 CORS 优化，可直接部署使用。
- 默认主题、播放模式等偏好可在 `state` 初始化逻辑中按需调整。

### 🆕 后端代理优化变更（GD Studio API 对齐）

围绕 GD Studio 公开 API 文档（`https://music-api.gdstudio.xyz/api.php`）重新对齐 `functions/proxy.ts` 与前端 API 客户端：

1. **参数语义对齐**：搜索/歌单接口使用上游 `count` / `pages` 翻页参数；封面接口支持 `size=300|500`。
2. **缓存分档**：`pic` 缓存 7 天，`lyric` 缓存 1 天，`url` 缓存 10 分钟，`search/playlist` 缓存 10 秒（稳定源 30 秒）。上游若自带 `Cache-Control` 则透传覆盖。
3. **限流与错误处理**：上游 429 透传 `Retry-After` 并返回 `{"error":"rate_limited"}`；上游 5xx 返回 `502 {"error":"upstream_unavailable"}`；缺失 `types` 返回 `400 {"error":"missing_types"}`。
4. **音频白名单**：仅代理 `kuwo.cn` 主机的 `target` 直链，并强制 `Referer: https://www.kuwo.cn/`，避免代理被滥用。
5. **前端简化**：移除伪造签名 `s`，改用标准 `URLSearchParams` 构造请求，`getPicUrl(song, size)` 支持自定义封面尺寸。
6. **Cloudflare 兼容**：全部使用 Web 标准 `fetch` / `Headers` / `Response.body` 流式透传，不依赖 Node.js 内置模块，确保 Workers 免费套餐下运行。

部署后可通过以下命令验证缓存头生效（替换为你的域名）：

```bash
curl -I "https://your-domain.pages.dev/proxy?types=pic&id=xxx&source=netease&size=300"
curl -I "https://your-domain.pages.dev/proxy?types=lyric&id=xxx&source=netease"
curl -I "https://your-domain.pages.dev/proxy?types=url&id=xxx&source=netease&br=320"
curl -I "https://your-domain.pages.dev/proxy?types=search&source=netease&name=test&count=10&pages=1"
```

若配置了自定义 API 白名单，可通过以下命令验证 `api` 参数白名单生效（替换为你在 `MUSIC_API_BASES` 中配置的地址）：

```bash
# 合法地址 → 正常 200
curl -s "https://your-domain.pages.dev/proxy?types=search&api=https%3A%2F%2Fmy-api.example.com%2Fapi.php&source=netease&name=test&count=1&pages=1"

# 不在白名单内 → 400 api_not_allowed
curl -s "https://your-domain.pages.dev/proxy?types=search&api=https%3A%2F%2Fevil.example.com%2Fapi.php&source=netease&name=test&count=1&pages=1"
```

期望看到：
- `types=pic`：`Cache-Control: public, max-age=86400, s-maxage=604800`
- `types=lyric`：`Cache-Control: public, max-age=3600, s-maxage=86400`
- `types=url`：`Cache-Control: public, max-age=600, s-maxage=600`
- `types=search`：`Cache-Control: public, max-age=10, s-maxage=30`

### ☁️ Cloudflare D1 绑定与建表
1. 在 Cloudflare Dashboard 的 **Workers & Pages → D1 → Create** 中新建数据库，建议命名为 `solara-db`（名称可自定）。
2. 打开 Pages 项目设置，依次进入 **Settings → Functions → Bindings → Add binding → D1 Database**：
   - **Binding name** 填写 `DB`（必须与 `functions/api/storage.ts` 中的环境变量一致）。
   - **D1 Database** 选择上一步创建的数据库并保存。
3. 在数据库详情页切换到 **Query** 标签页，执行下方建表语句初始化两个独立的键值存储表（播放数据与收藏数据分离）：
   ```sql
   CREATE TABLE IF NOT EXISTS playback_store (
     key TEXT PRIMARY KEY,
     value TEXT,
     updated_at TEXT DEFAULT CURRENT_TIMESTAMP
   );

   CREATE TABLE IF NOT EXISTS favorites_store (
     key TEXT PRIMARY KEY,
     value TEXT,
     updated_at TEXT DEFAULT CURRENT_TIMESTAMP
   );
   ```
4. 重新部署或预览站点。前端会优先检测 D1 绑定：播放状态、播放列表等写入 `playback_store`，收藏相关写入 `favorites_store`；未绑定时自动退回浏览器 localStorage。

### 🔧 新增环境变量

| 变量 | 作用 | 默认值 |
|---|---|---|
| `MUSIC_API_BASES` | 上游 API 白名单（逗号分隔多地址，首项为默认） | 仅 GD Studio |
| `AUTH_MAX_AGE_HOURS` | 登录会话时长（小时） | `48` |
| `AUDIO_HOST_RULES_JSON` | 追加音频代理域名规则（JSON 数组） | 无 |

#### `MUSIC_API_BASES`

将默认的 GD Studio API（`https://music-api.gdstudio.xyz/api.php`）替换为你自己部署的兼容 API，或追加更多后端供前端在网页上切换：

```bash
# Cloudflare Pages 环境变量
MUSIC_API_BASES = https://my-api.example.com/api.php,https://backup.example.com/api.php
```

> 只有白名单内的地址可被 `/proxy` 代理转发，防止被滥用。前端添加自定义源时也只能选择白名单中列出的服务。

#### `AUTH_MAX_AGE_HOURS`

控制登录 Cookie 有效期，示例：

```bash
AUTH_MAX_AGE_HOURS = 168   # 7 天
```

#### `AUDIO_HOST_RULES_JSON`

如需代理额外音频 CDN 域名，添加 JSON 数组：

```json
[{"pattern": "(^|\\.)mycdn\\.com$", "referer": "https://www.example.com/"}]
```

## 🎵 网页端添加自定义音源

内置音源为：网易云、酷我、JOOX、哔哩哔哩（均通过默认 GD Studio API 代理）。

如需接入自己部署的 GD 兼容 API：

1. 先在服务端将自定义 API 地址加入 `MUSIC_API_BASES` 环境变量并重新部署；
2. 打开播放器 → 点击搜索栏左侧音源按钮 → 点「管理音源」；
3. 填写音源名称（如"我的源"）、源 ID（如 `mydb`）、选择 API 服务（或留空 = 默认 GD）；
4. 新源立即可用，可搜索、播放、下载，也可随时删除。

> 自定义源数据持久化在浏览器 localStorage；若绑定了 Cloudflare D1，也会通过 `/api/storage` 同步到云端。

## 🧭 探索雷达
- 探索雷达会在「流行、摇滚、古典音乐、民谣、电子、爵士、说唱、乡村、蓝调、R&B、金属、嘻哈、轻音乐」等分类中随机挑选关键词，自动为播放列表补充新歌。
- 如果想排除某些不喜欢的分类，可在 `js/index.js` 中的 `EXPLORE_RADAR_GENRES` 数组里删除对应条目或新增自己喜欢的分类，保存后重新部署即可生效。

## 🔐 访问控制设置
- **Cloudflare Pages：** 在项目的 **Settings → Functions → Environment variables** 中新增名为 `PASSWORD` 的环境变量，值为希望设置的访问口令。
- 部署完成后，未登录的访问者会被自动重定向到 `/login` 页面并需输入该口令；若想关闭访问口令，删除该环境变量并重新部署即可。
- 登录失败同 IP 连续 10 次会触发 5 分钟冷却保护；口令以 SHA-256 哈希存储，支持中文等任意 Unicode 字符。
- **升级注意：** 由于 cookie 哈希方案变更，已登录用户在部署新版本后需重新登录一次。

## 🌐 多语言设置 (English Version)
- **Cloudflare Pages：** 在项目的 **Settings → Functions → Environment variables** 中新增名为 `LANGUAGE` 的环境变量，值为 `ENG`。
- 部署完成后，站点将会自动切换为全英文界面。若想恢复中文界面，删除该环境变量或修改为其他值后重新部署即可。

## 🎵 使用流程
1. 输入关键词并选择想要的曲库后发起搜索。
2. 在结果列表中可试听、播放、下载或加入播放队列。
3. 点击列表中的心形图标即可收藏歌曲，收藏列表支持快捷下载、添加至播放列表或批量清空。
4. 右侧播放/收藏列表展示当前曲目，可拖动播放、移除或一键清空。
5. 底部控制栏提供播放控制、播放模式切换、进度条与音量滑块。
6. 打开歌词面板即可查看实时滚动的高亮歌词。

## 📱 移动端体验提示
- 将网页添加到手机主屏或通过移动浏览器访问，即可自动切换至竖屏布局；
- 底栏控件重新排布，保证竖向滑动不遮挡核心信息；
- 点击封面可以切换到歌词面板，可通过点击展开/收起。

## ❓ 常见问题解答
- **搜索没有结果怎么办？** 检查浏览器控制台日志，如接口被阻挡可尝试切换数据源或更新 `API.baseUrl` 至可用服务，很有可能是免费API炸了。
- **如何重置本地数据？** 在浏览器开发者工具的 Application / Storage 面板清理 `localStorage`，即可恢复默认播放列表和配置。
- **收藏或播放列表如何备份？** 使用播放队列或收藏列表顶部的「导出」按钮生成 JSON 文件，日后可通过对应列表的「导入」按钮恢复，同时可一键将收藏歌曲添加回播放列表。

## 🗂️ 项目结构
```
Music-Player/
├── css/
│   ├── desktop.css   # 桌面端布局与组件样式
│   ├── mobile.css    # 移动端适配样式
│   └── style.css     # 公共主题与变量定义
├── functions/
│   ├── _middleware.ts # Cloudflare Pages Functions 中间件
│   ├── api/           # 各曲库代理函数入口
│   ├── lib/           # 请求封装与工具模块
│   ├── palette.ts     # 封面取色算法
│   └── proxy.ts       # 音频直链代理
├── js/
│   ├── index.js       # 播放器核心逻辑、状态管理与探索雷达分类
│   └── mobile.js      # 移动端交互与事件处理
├── favicon.png
├── favicon.svg
├── index.html         # 主界面结构、资源引入与配置项
├── login.html         # 访问控制登录页
└── README.md          # 项目说明
```

## 📄 许可证
本项目采用 CC BY-NC-SA 协议，禁止任何商业化行为，任何衍生项目必须保留本项目地址并以相同协议开源。

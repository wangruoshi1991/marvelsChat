# Build 24 验收清单

## 验收范围

Build 24 只验收“创建并分享个人主页”的核心闭环：

1. 登录或注册，并记录当前隐私政策与用户协议版本。
2. 输入一句主页要求，明确选择 3 至 9 张照片。
3. 创建可恢复的异步任务，20 秒后仍未完成时显示可理解状态。
4. 模型失败或超时时返回可编辑基础版，不暴露供应商和环境变量。
5. 编辑结构化模块，使用与网页分享页相同的精确预览。
6. 发布为私密或链接分享，撤销旧链接，恢复历史版本。
7. 永久删除账号时重新验证密码并进行二次确认。

3D、视频、漫画、公开搜索主页和任意 HTML/CSS 编辑不属于 Build 24。

## 发布标识

- Version：`1.0`
- Build：`24`
- 临时 API Base：`http://8.153.167.11/api`
- 正式目标域名：`https://miaoxun.pizelife.com/api`
- TestFlight 公开链接：`https://testflight.apple.com/join/jKSqUnYU`
- 验收提交：发布时填写最终 commit SHA。

## 上线前置条件

- [ ] 数据库已执行 `013_homepage_v1.sql`。
- [ ] 后端和 `station-web/dist` 来自同一提交。
- [ ] `NODE_ENV=production`。
- [ ] `HOMEPAGE_V1_ENABLED=true`。
- [ ] `HOMEPAGE_V1_ALLOWLIST` 仅包含验收账号。
- [ ] `HOMEPAGE_WEB_BASE_URL` 指向当前可访问的 Web 根地址。
- [ ] `PRIVACY_POLICY_VERSION=2026-07-15`。
- [ ] `TERMS_VERSION=2026-07-15`。
- [ ] OSS 私有读写配置可用。
- [ ] 模型配置可用；不可用时基础版路径仍可验收。
- [ ] 服务器健康检查返回数据库 connected。

## 自动检查

### Backend

```sh
cd backend
npm ci
npm run check
npm test
npm audit --omit=dev
```

### Agents

```sh
cd agents
npm ci
npm run check
npm test
```

### Admin

```sh
cd admin
npm ci
npm run check
npm run build
```

### Station Web

```sh
cd station-web
npm ci
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

### React Native

```sh
cd MiaoxunRN
npm ci
npx tsc --noEmit
npm run lint -- --max-warnings=0
npm test -- --runInBand
```

## API 验收

每个失败响应都应含 `X-Request-ID`，客户端只显示安全诊断 ID。

- [ ] `GET /api/health` 返回 200，数据库 connected。
- [ ] `GET /api/legal/policies` 返回当前两个版本和可打开 URL。
- [ ] 登录返回 200，错误密码不会被误报成接口 404。
- [ ] `GET /api/app/bootstrap` 返回 `features.homepageV1.enabled=true`。
- [ ] 非 allowlist 账号看不到 Build 24 主页能力。
- [ ] 创建任务返回 202，重复 idempotency key 不产生重复任务。
- [ ] 任务完成后返回 draft ID 和 revision。
- [ ] 预览令牌可打开，过期或草稿修改后不可继续访问。
- [ ] revision 冲突返回 409，不覆盖新版本。
- [ ] 链接发布后匿名可访问，停止分享后旧链接返回不可用。
- [ ] 私密页面、预览和法律页面不出现 404。
- [ ] 错误密码删除账号返回 401，但 App 保持登录和本地草稿。
- [ ] 非破坏性验收仅验证删除前置校验，不删除主验收账号。

## iPhone 真机验收

### 启动和登录

- [ ] TestFlight 显示 `1.0 (24)`。
- [ ] 冷启动后不会反复请求 bootstrap 或重建 WebSocket。
- [ ] 现有账号登录后第一屏为“我的主页”，第二栏为“消息”。
- [ ] 普通用户界面不展示 Agent 注册表、provider、环境变量或原始错误。

### 创建主页

- [ ] 少于 3 张照片时生成按钮不可用，并显示差几张。
- [ ] 3 至 9 张照片可以生成；第 10 张不能被加入。
- [ ] 上传失败可单张重试，不丢失其他已选照片。
- [ ] 切后台再回来可继续未完成任务。
- [ ] 任务超过 20 秒时有明确状态，界面不无限转圈。
- [ ] 模型失败时得到可编辑基础版。
- [ ] 编辑页明确显示“AI 生成内容”。

### 编辑、预览和分享

- [ ] 两个主题均可切换。
- [ ] 标题、摘要、封面、照片、隐藏和排序可编辑。
- [ ] 保存后 revision 增加；冲突时要求重新加载。
- [ ] WebView 预览与浏览器分享页使用同一渲染结果。
- [ ] WebView 禁用缓存、Cookie、文件访问和跨域导航。
- [ ] 发布前有确认；默认不公开，仅支持私密或链接。
- [ ] 分享页首屏显示“AI 生成内容”。
- [ ] 撤销后旧链接立即不可访问。
- [ ] 历史版本恢复会创建新草稿，不篡改旧 release。

### 隐私和账号

- [ ] 未勾选隐私政策和用户协议时不能注册。
- [ ] 两个法律链接均可打开。
- [ ] 删除账号要求当前密码、确认文字和最终系统确认。
- [ ] 错误密码不会退出登录。
- [ ] 普通网络日志不包含密码、token、提示词、照片 ID、签名 URL 或 API Key。

## 两分钟网络验收

登录后静置两分钟，并观察安全网络日志：

- [ ] `/api/app/bootstrap` 只在启动或明确刷新时出现，不循环请求。
- [ ] WebSocket 不因游标或在线状态变化反复重建。
- [ ] 增量同步按预期发生，没有持续 401、404 或 5xx。
- [ ] 每个请求有 request ID、最终 URL 和状态码。
- [ ] 日志中无 Authorization 明文和用户正文。

## 视口验收

- [ ] iPhone SE 宽度 320px 无横向溢出或文字遮挡。
- [ ] iPhone Pro Max 宽度 430px 无空白首屏或控件重叠。
- [ ] Desktop 宽度 1440px 内容不被过度拉伸。
- [ ] `gallery` 和 `clean` 均有非空图片像素和下一屏内容提示。

## 已知非阻断项

- MapLibre、React、ReactNativeDependencies、hermesvm dSYM warning 不阻止 TestFlight 安装，但影响第三方 framework 崩溃符号化。
- `MESHY_API_KEY` 不属于 Build 24；3D 真实生成继续保持关闭。
- RN CLI/Jest 开发依赖目前有中等级别 audit 报告，不能用强制升级破坏 RN 版本，需要单独升级验证。

## 禁止公开发布的阻断项

- [ ] 域名、备案、HTTPS 和证书尚未完成。
- [ ] 隐私政策和用户协议仍是法务未审草案。
- [ ] 运营主体、客服和投诉举报渠道未填写。
- [ ] 模型名称、备案/登记、公示和第三方处理清单未确认。
- [ ] App Store 隐私标签和账号删除说明未由 App 负责人确认。
- [ ] 未成年人和拟人化 AI 合规流程未完成。

## 回滚

出现严重问题时先设置：

```text
HOMEPAGE_V1_ENABLED=false
```

重启后端后，Build 23 API 和消息功能继续保留。数据库迁移是增量迁移，不执行破坏性回滚。必要时恢复部署前代码备份，但保留新增表和用户数据用于调查。


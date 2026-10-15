# 项目地图

**更新日期**：2026-10-15  
**当前分支**：`codex/testflight-44`  
**原型来源**：[PDF 设计稿](../妙-App-原型状态设计参考.pdf) + [HTML 原型](../妙-App-可分享原型.html)

---

## 一、架构概览

### 1.1 技术栈

- **移动端（正式）**：React Native 0.76 + TypeScript，位于 `MiaoxunRN/`
- **后端**：Node.js + Express + PostgreSQL，位于 `backend/`
- **AI 基础设施**：
  - 模型服务：配置在 `backend/.env`（`NEW_API_BASE_URL/KEY/MODEL`）
  - Agent 注册：`agents/registry.js` 加载 `agents/*.agent.js`
  - 运行器：`backend/src/agent-runtime.js` + AI Worker
- **原生模块**（iOS/Android）：语音、扫码、配置读取

### 1.2 目录结构（关键路径）

```
MiaoxunRN/src/
├── App.tsx                    # 根入口，配置 RN 导航
├── features/
│   ├── assist/                # 二楼入口（AIAssistGestureSurface）+ AI 辅助交互
│   ├── messages/              # 讯（对话列表 + 聊天详情）
│   ├── miao/                  # 妙（任务信箱 + 管家语音菜单）
│   ├── station/               # 我（小站 5 Tab + 编辑器 + 3D 形象）
│   ├── session/               # 会话管理（账号、登录、权限）
│   └── second-floor/          # 二楼 6 个面板（相册/文件/关系/资产/信息海/权限）
├── services/api/              # API 客户端与数据契约
├── models/api.ts              # 后端 DTO 类型定义
└── shared/                    # UI 组件、主题、国际化

backend/src/
├── agent-runtime.js           # Agent 调用执行器
├── routes/
│   ├── agents.js              # Agent 授权管理
│   ├── agent-workspaces.js    # 协作工作空间（合同 3）
│   └── threads.js             # 普通会话消息
└── ai-worker/                 # 后台 AI 任务处理器

agents/
├── registry.js                # Agent 加载与验证
├── miaoxun-butler.agent.js    # 妙讯管家（协调器）
├── album-manager.agent.js     # 相册管理
├── site-builder.agent.js      # 建站助手
├── comic-diary.agent.js       # 漫画日记
├── video-production.agent.js  # 视频制作
├── file-preprocessor.agent.js # 文件处理
├── virtual-character.agent.js # 形象顾问
└── model-3d.agent.js          # 3D 模型顾问
```

---

## 二、设计结构 vs 代码实现

### 2.1 三栏主导航（一致）

| 设计（PDF/HTML） | 代码路径 | 状态 |
|---|---|---|
| **妙**（任务/协作） | `features/miao/MiaoScreen.tsx` | ✅ 已有且一致 |
| **讯**（对话） | `features/messages/ThreadListScreen.tsx` | ✅ 已有且一致 |
| **我**（小站） | `features/station/StationScreen.tsx` | ✅ 已有且一致 |

---

### 2.2 妙（任务页）

#### 2.2.1 任务信箱（page-miao 主界面）

| 设计元素 | 代码实现 | 状态 |
|---|---|---|
| 标题「妙」 | `MiaoScreen.tsx` 顶部文字 | ✅ 已有且一致 |
| 任务列表（分类、状态、多选） | `features/miao/MiaoTaskInbox.tsx` | ✅ 已有且一致 |
| 搜索框 | `MiaoTaskInbox.tsx` 顶部 `TextInput` | ✅ 已有且一致 |
| 筛选器（进行中/待办/已完成） | `MiaoTaskInbox.tsx` 三段 Chip | ✅ 已有且一致 |
| 任务卡（标题/描述/时间/进度） | `MiaoTaskCard.tsx` | ✅ 已有且一致 |
| 空状态提示 | `MiaoTaskInbox.tsx` 空数组时显示文字 | 🟡 存在但视觉不符（无插图） |
| 底部「+ 创建任务」浮动按钮 | `MiaoScreen.tsx` 底部 FAB | ✅ 已有且一致 |

#### 2.2.2 三向语音菜单（page-miao-voice）

| 设计元素 | 代码实现 | 状态 |
|---|---|---|
| 长按打开三向菜单 | `features/miao/MiaoVoiceMenu.tsx` | ✅ 已有 |
| 左「键盘」 | `MiaoVoiceMenu.tsx` 左侧选项 | ✅ 已有且一致 |
| 中「妙管家」 | `MiaoVoiceMenu.tsx` 中央主选项 | ✅ 已有且一致 |
| 右「瀑布」 | `MiaoVoiceMenu.tsx` 右侧选项 | ✅ 已有且一致 |
| 松手后执行对应动作 | `MiaoVoiceMenu.tsx` 手势响应逻辑 | ✅ 已有且一致 |
| 瀑布模式（任务信息流） | `features/miao/MiaoTaskFeed.tsx` | ✅ 已有且一致 |

**注**：设计中「瀑布」仅展示状态文字，无深入行为定义。代码中 `MiaoTaskFeed` 实现为纵向任务卡流。

---

### 2.3 讯（对话页）

#### 2.3.1 对话列表（page-xun 主界面）

| 设计元素 | 代码实现 | 状态 |
|---|---|---|
| 标题「讯」 | `ThreadListScreen.tsx` 顶部 | ✅ 已有且一致 |
| 对话列表（头像/名称/最后消息/时间） | `ThreadListScreen.tsx` | ✅ 已有且一致 |
| 搜索框 | `ThreadListScreen.tsx` 顶部 | ✅ 已有且一致 |
| 右上角「+ 新建对话」 | `ThreadListScreen.tsx` 右上角按钮 | ✅ 已有且一致 |
| 二楼入口（上滑手势） | `features/assist/AIAssistGestureSurface.tsx` | ✅ 已有且一致 |

#### 2.3.2 聊天详情（page-xun-chat）

| 设计元素 | 代码实现 | 状态 |
|---|---|---|
| 返回按钮 + 对话名称/头像 | `MessagesScreen.tsx` 顶部导航栏 | ✅ 已有且一致 |
| 消息列表（文字/图片/状态/重试） | `ChatMessageItem.tsx` + `ChatMessageMenu.tsx` | ✅ 已有且一致 |
| 底部输入框 + 附件按钮 | `ChatComposer.tsx` | ✅ 已有且一致 |
| 语音菜单（键盘/妙管家/任务瀑布） | 设计原型显示三选项，但文字为「直接说/总结未读/替我规划」 | 🔴 代码未实现此变体 |

**注**：原型中讯页语音菜单与妙页不同，但代码中 `MessagesScreen` 未接入语音菜单。设计需要澄清。

#### 2.3.3 二楼（上滑面板，page-xun-second-floor）

| 设计元素 | 代码实现 | 状态 |
|---|---|---|
| 相册（查看/选择图片视频） | `SecondFloorAlbum.tsx` | ✅ 已有且一致 |
| 文件（查看/选择文件） | `SecondFloorFiles.tsx` | ✅ 已有且一致 |
| 关系（好友列表，非亲密度） | `SecondFloorRelationships.tsx` | ✅ 已有且一致（显示好友列表） |
| 资产（积分/会员/钱包） | `SecondFloorAssets.tsx` | ✅ 已有且一致 |
| 信息海（知识库/笔记） | `SecondFloorOcean.tsx` | ✅ 已有且一致 |
| 权限（隐私/授权管理） | `SecondFloorPermissions.tsx` | ✅ 已有且一致 |
| 横向滑动切换 | `SecondFloorPanelHost.tsx` | ✅ 已有且一致 |
| 下拉关闭二楼 | `AIAssistGestureSurface.tsx` 手势 | ✅ 已有且一致 |

---

### 2.4 我（小站页）

#### 2.4.1 小站整体结构（page-me）

| 设计元素 | 代码实现 | 状态 |
|---|---|---|
| 顶部个人信息卡（头像/昵称/简介/关注数/粉丝数/获赞数） | `StationAvatarSpace.tsx` + `StationPageHeading.tsx` | ✅ 已有且一致 |
| 两个 Tab：「动态 / 我的 Agent」 | 设计原型为两个 Tab | 🔴 代码实现为 **5 个 Tab** |
| 动态 Tab 内容：图文/视频/投票帖子 | 设计原型明确包含三种帖子类型 | 🟡 代码支持图文/视频，**不支持投票** |
| Agent Tab 内容：卡片含原创标记、添加时间、等级、星标数 | 设计原型明确字段 | 🔴 代码 `OwnedAgentDTO` **缺失 level/star/original/addedAt** |

#### 2.4.2 小站当前 5 Tab 实现（`StationPanels.tsx`）

| Tab 名称（代码） | 内容 | 设计对应 |
|---|---|---|
| **第一面**（station） | `StationHome.tsx`：形象卡 + 个人日记 + 个人相册 + AI 伙伴模块 | 🔴 设计中无此 Tab |
| **生活**（posts） | `StationPostsPanel.tsx`：动态帖子列表（图文/视频） | ✅ 对应设计「动态 Tab」 |
| **成果**（outcomes） | `StationOutcomesPanel.tsx`：页面/文字/漫画/视频草稿 | 🔴 设计中无此 Tab |
| **生态**（agents） | `StationAgentsPanel.tsx`：我的 Agent 列表 | ✅ 对应设计「我的 Agent Tab」 |
| **其他**（social） | `StationSocialPanel.tsx`：关注/粉丝/获赞列表 | 🔴 设计中此为信息卡，非独立 Tab |

**结论**：代码比设计多 3 个 Tab（第一面/成果/其他），需要按设计合并为「动态 / 我的 Agent」两 Tab 结构。

#### 2.4.3 小站子功能

| 功能 | 代码路径 | 状态 |
|---|---|---|
| 3D 形象编辑器 | `StationAvatarEditor.tsx` + `avatar3dWorkflow.ts` | ✅ 已有且一致 |
| 动态发布编辑器 | `StationPostComposer.tsx` | ✅ 已有且一致（支持图文/视频） |
| 结构页面编辑器 | `StationSiteEditor.tsx` + `useStationSiteEditor.ts` | ✅ 已有且一致 |
| 漫画日记详情 | `StationComicDiaryPanel.tsx` | ✅ 已有且一致 |
| 相册管理 | `StationAlbumAgentPanel.tsx` | ✅ 已有且一致 |

---

## 三、Agent 能力现状

| Agent | 注册状态 | 会话可用 | 协作能力 | 业务完整性 | 依据 |
|---|---|---|---|---|---|
| **妙讯管家** | ✅ | ✅ | `dispatch` + `text.summarize` | ✅ 完整 | 代码阅读 + `AGENTS.md` |
| **建站助手** | ✅ | ✅ | `site.draft` | ✅ 完整（私有草稿） | 代码阅读 |
| **相册管理** | ✅ | ✅ | `media.select` | ✅ 完整（云端同意） | 代码阅读 |
| **漫画日记** | ✅ | ✅ | `comic.storyboard` | 🟡 半成品（无成图） | `AGENTS.md` 明确说明 |
| **视频制作** | ✅ | ✅ | `video.script` | 🟡 半成品（无成片） | `AGENTS.md` 明确说明 |
| **文件处理** | ✅ | ✅ | `text.summarize` | 🟡 半成品（无上传） | `AGENTS.md` 明确说明 |
| **形象顾问** | ✅ | ✅ | 无 | 🔵 仅咨询 | `AGENTS.md` |
| **3D 模型顾问** | ✅ | ✅ | 无 | 🔵 仅咨询 | `AGENTS.md` |

**说明**：
- ✅ 完整 = 可运行且业务闭环
- 🟡 半成品 = 可运行但缺关键环节
- 🔵 仅咨询 = 不产生业务产物

**协作架构**：合同 3（`agent-workspaces`），管家通过 `dispatch` 动态选人，各 Agent 声明 `workspaceCapabilities` 并实现 `contribute` 方法。详见 `docs/ai-interaction-system.md`。

---

## 四、视觉设计对照

### 4.1 配色系统（Design vs Code）

| 设计规范 | 代码实现 | 状态 |
|---|---|---|
| 统一深色表面阶梯（5-7 级） | `shared/theme.ts` 定义 `surface*` | 🟡 部分实现，但分散在各模块 |
| 单一主色调（根据域定义） | 各功能独立 `*Palette.ts` | 🔴 缺失统一主题，各模块独立配色 |
| 流体字阶（`clamp()`） | RN 不支持 CSS `clamp()`，使用固定 `fontSize` | 🟡 不一致（平台限制） |
| 统一圆角 token | 各组件内联 `borderRadius` 值 | 🔴 缺失，需提取为 token |

### 4.2 空状态与占位（Design vs Code）

| 功能 | 设计要求 | 代码实现 | 状态 |
|---|---|---|---|
| 任务信箱空状态 | 插图 + 引导文字 | 仅文字 | 🔴 缺失插图 |
| 对话列表空状态 | 插图 + 引导文字 | 仅文字 | 🔴 缺失插图 |
| 小站动态空状态 | 插图 + 引导文字 | 仅文字 | 🔴 缺失插图 |

### 4.3 交互组件（Design vs Code）

| 组件 | 设计要求 | 代码实现 | 状态 |
|---|---|---|---|
| 按钮圆角 | 999px 胶囊 | 各组件独立设置 | 🟡 不统一 |
| 头像圆角 | 50% 圆形 | 各处独立实现 | ✅ 一致 |
| 卡片阴影 | Token 化 | 内联 `shadowOpacity` | 🔴 缺失 token |

---

## 五、按设计实现的改动范围

### 5.1 必须改动（结构不符）

#### A. 小站 Tab 重构
**当前**：5 Tab（第一面/生活/成果/生态/其他）  
**目标**：2 Tab（动态/我的 Agent）

**工作量**：
- 合并「第一面」模块（日记/相册/形象）至个人信息卡下方或独立入口
- 删除「成果」Tab，成果入口移至其他位置（如妙页任务详情）
- 合并「其他」Tab 内容（关注/粉丝/获赞）至信息卡
- 调整 `StationPanels.tsx` 逻辑与导航结构
- 更新相关测试（`stationTabLifecycle.test.tsx` 等）

**影响文件**：10-15 个（`StationPanels.tsx`、`StationHome.tsx`、`StationHeader.tsx`、测试文件）

#### B. 小站 Agent 卡片字段补全
**当前**：`OwnedAgentDTO` 缺失 `level`、`star`、`original`、`addedAt`  
**目标**：补全字段并在 UI 显示

**工作量**：
- 后端：数据库迁移（`user_agents` 表增列）
- 后端：`OwnedAgentDTO` 类型补充
- 前端：`models/api.ts` 同步
- 前端：`StationAgentsPanel.tsx` 显示新字段
- 测试：集成测试验证

**影响文件**：8-10 个（后端模型、迁移、前端类型、UI 组件、测试）

#### C. 小站投票功能补全
**当前**：不支持投票帖子  
**目标**：支持创建/显示/投票

**工作量**：
- 后端：数据库迁移（`station_posts` 增 `poll` 字段）
- 后端：投票接口（`POST /api/stations/:id/posts/:postId/vote`）
- 前端：`StationPostComposer` 增投票编辑
- 前端：`StationPostItem` 显示投票选项与结果
- 测试：集成测试

**影响文件**：12-15 个（后端路由/模型、前端编辑器/卡片、测试）

#### D. 讯页语音菜单变体
**当前**：讯页无语音菜单  
**目标**：实现「直接说/总结未读/替我规划」三选项（待设计确认）

**工作量**：
- 前端：在 `MessagesScreen.tsx` 接入变体语音菜单
- 前端：实现三个选项的对应逻辑
- 测试：手势交互测试

**影响文件**：5-8 个（`MessagesScreen.tsx`、手势逻辑、测试）

---

### 5.2 视觉统一（样式不符）

#### E. 建立统一配色 Token 系统
**工作量**：
- 定义全局 `theme.ts`（surface 阶梯、主色调、圆角、阴影）
- 重构各模块 `*Palette.ts`，引用全局 token
- 清理内联样式中的硬编码颜色/圆角/阴影

**影响文件**：30-50 个（所有 `.tsx` 组件文件）

#### F. 补充空状态插图
**工作量**：
- 设计提供 SVG 插图资源
- 在空状态组件中集成插图
- 更新相关测试快照

**影响文件**：10-15 个（任务/对话/小站空状态组件、测试）

---

### 5.3 缺失功能（设计有，代码无）

**当前无待补全功能**：二楼、三向菜单、小站 2 Tab 结构均已在设计中明确，上述改动已覆盖。

---

### 5.4 冗余功能（代码有，设计无）

**结论**：经核对，以下功能虽不在设计原型中明确展示，但属于后台管理或开发调试功能，不属于冗余：
- 后台管理路由（`backend/src/routes/admin.js`）
- 测试工具（`scripts/`, `__tests__/`）
- 迁移脚本（`backend/migrations/`）

**无需删除**。

---

## 六、文件清单（关键模块）

### 6.1 妙（任务）

```
features/miao/
├── MiaoScreen.tsx              # 妙页主入口
├── MiaoTaskInbox.tsx           # 任务信箱列表
├── MiaoTaskCard.tsx            # 单个任务卡片
├── MiaoTaskFeed.tsx            # 瀑布模式
├── MiaoVoiceMenu.tsx           # 三向语音菜单（键盘/管家/瀑布）
└── miaoPalette.ts              # 妙页配色
```

### 6.2 讯（对话）

```
features/messages/
├── ThreadListScreen.tsx        # 对话列表
├── MessagesScreen.tsx          # 聊天详情
├── ChatComposer.tsx            # 输入框
├── ChatMessageItem.tsx         # 消息卡片
├── ChatMessageMenu.tsx         # 消息菜单（重试/删除）
├── AlbumAssistantStatus.tsx    # 相册 Agent 状态
└── messagePalette.ts           # 讯页配色
```

### 6.3 二楼（上滑面板）

```
features/second-floor/
├── SecondFloorPanelHost.tsx    # 面板容器（横向滑动）
├── SecondFloorAlbum.tsx        # 相册面板
├── SecondFloorFiles.tsx        # 文件面板
├── SecondFloorRelationships.tsx# 关系面板（好友列表）
├── SecondFloorAssets.tsx       # 资产面板
├── SecondFloorOcean.tsx        # 信息海面板
└── SecondFloorPermissions.tsx  # 权限面板
```

### 6.4 我（小站）

```
features/station/
├── StationScreen.tsx           # 小站主入口
├── StationPanels.tsx           # Tab 切换容器
├── StationHeader.tsx           # 顶部导航（5 Tab）
├── StationHome.tsx             # 第一面（形象 + 模块）
├── StationPostsPanel.tsx       # 生活 Tab（动态列表）
├── StationOutcomesPanel.tsx    # 成果 Tab
├── StationAgentsPanel.tsx      # 生态 Tab（我的 Agent）
├── StationSocialPanel.tsx      # 其他 Tab（关注/粉丝）
├── StationAvatarSpace.tsx      # 个人信息卡（头像/昵称/简介）
├── StationPageHeading.tsx      # 关注/粉丝/获赞数统计
├── StationPostComposer.tsx     # 动态发布编辑器
├── StationSiteEditor.tsx       # 结构页面编辑器
├── StationAvatarEditor.tsx     # 3D 形象编辑器
├── StationComicDiaryPanel.tsx  # 漫画日记详情
├── StationAlbumAgentPanel.tsx  # 相册管理
└── stationPalette.ts           # 小站配色
```

### 6.5 AI 辅助

```
features/assist/
├── AIAssistGestureSurface.tsx  # 二楼上滑手势入口
├── AIAssistProvider.tsx        # AI 辅助上下文
└── aiAssistTypes.ts            # 类型定义
```

---

## 七、核心数据契约

### 7.1 Agent 相关

```typescript
// models/api.ts
export type AgentDTO = {
  id: string;
  key: string;
  name: string;
  description: string;
  permissions: string[];
  // ...
};

export type OwnedAgentDTO = {
  id: string;
  name: string;
  enabled: boolean;
  createdAt?: string | null;
  // 🔴 缺失字段：level, star, original, addedAt
};
```

### 7.2 小站内容

```typescript
// models/api.ts
export type StationPostDTO = {
  id: string;
  userId: string;
  title: string;
  body: string;
  mediaAssets: StationMediaAssetDTO[];
  createdAt: string;
  // 🔴 缺失：poll 字段（投票）
};

export type StationMediaAssetDTO = {
  id: string;
  kind: 'image' | 'video'; // ✅ 支持图片/视频
  url: string;
  mimeType: string;
};
```

---

## 八、测试覆盖

### 8.1 已有测试（部分列举）

```
MiaoxunRN/__tests__/
├── aiAssistGesture.test.tsx          # 二楼手势
├── albumAssistant.test.tsx           # 相册 Agent
├── chatContentActions.test.tsx       # 聊天操作
├── messageRetry.test.tsx             # 消息重试
├── sessionSync.test.tsx              # 会话同步
├── stationAvatarLayout.test.tsx      # 小站形象布局
├── stationContentContract.test.ts    # 小站内容契约
├── stationHomeContentActions.test.tsx# 小站首页操作
├── stationModuleManagement.test.tsx  # 小站模块管理
├── stationPostExperience.test.tsx    # 动态发布体验
└── stationTabLifecycle.test.tsx      # 小站 Tab 生命周期
```

### 8.2 测试缺口（需补充）

- 小站 2 Tab 重构后的导航测试
- 投票功能的完整流程测试
- 讯页语音菜单变体测试
- 统一配色 Token 的视觉回归测试

---

## 九、后续步骤（优先级）

### P0：结构必改（违背设计）
1. **小站 Tab 重构**（5 Tab → 2 Tab）
2. **小站 Agent 卡片字段补全**（level/star/original/addedAt）
3. **小站投票功能补全**

### P1：视觉统一（样式不符）
4. **建立统一配色 Token 系统**
5. **补充空状态插图**

### P2：交互优化（设计待确认）
6. **讯页语音菜单变体**（直接说/总结未读/替我规划）

---

## 十、注意事项

1. **改动前必读**：
   - `README.md`
   - `docs/README.md`
   - `docs/handoffs/CURRENT.md`
   - `git status --short --branch`

2. **提交前检查**：
   - 运行 `./scripts/check-repository.sh`
   - 补充 PostgreSQL 集成测试
   - iOS Simulator/真机验证
   - 生产只读预检

3. **部署分离**：
   - 推送代码 ≠ 生产部署
   - 付费供应商调用需明确授权
   - TestFlight 上传需独立验证

4. **数据真实性**：
   - 不以示例数据替代真实错误
   - 不以前端开关替代后端权限
   - 跨层变更同步 API/迁移/测试/文档

5. **文档更新**：
   - 完成阶段性工作后更新 `CURRENT.md`
   - 记录状态、证据、下一步
   - 不写入密钥/令牌/生产账号/私人聊天

---

**文档结束**

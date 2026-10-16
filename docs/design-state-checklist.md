# 设计状态清单（33 项）

**更新日期**：2026-10-15
**分支**：`feature/redesign-by-prototype`
**设计来源**：[PDF 设计稿](../妙-App-原型状态设计参考.pdf)（共 35 页，第 2 页为状态目录）+ [HTML 原型](../妙-App-可分享原型.html)

**用途**：后续逐项验收的依据。页码与状态的对应关系为 **页 N = STATE N-2**（已逐页核对页眉，33 项全部吻合）。

**状态口径**：
- ✅ **一致**：结构、字段与交互都对得上，只差视觉 Token
- 🟡 **不一致**：功能存在，但结构、字段或位置与设计不同
- 🔴 **缺失**：设计有、代码无

**依据说明**：PDF 35 页已全部读图核对；代码侧结论来自本次对 `MiaoxunRN/src` 的逐项查找。「一致」仅指结构与字段对得上，**不代表已在真机验收**。

---

## 二、妙（2 项）

| # | 状态（页码） | 现有实现 | 现状 | 差距 |
|---|---|---|---|---|
| 01 | 任务动态首页（P.03） | `features/miao/MiaoTaskFeed.tsx`、`MiaoTaskCard.tsx`、`MiaoTaskAgent.tsx` | 🟡 不一致 | **骨架已改**：顶部大字「妙」删除（原型 `page-miao` 无标题）；卡片改为独立圆角卡（`border-radius: 7` / `border-width: 1` / `padding: 18`），卡片间距按原型 `.task-card + .task-card { margin-top: 3px }`。**仍缺**：每张卡只显示 1 个 Agent——`ai_tasks` 表只有 `agent_id`，没有参与者关联表或 JSON 列，属**后端缺口**；状态胶囊原型卡片内没有（待用户确认去留） |
| 02 | 长按语音与快捷菜单（P.04） | `features/agents/VoiceShortcutDock.tsx`（`shortcutOptions`） | ✅ 一致 | 三向入口对得上：`keyboard`(0,-56) / `butler`(-56,0) / `feed`(0,56)，长按隐藏底部导航由 `App.tsx` 的 `miaoVoiceExpanded` 实现。输入条「正在听…」「松开取消」文案一致。待视觉 Token 统一 |

---

## 三、讯（20 项）

| # | 状态（页码） | 现有实现 | 现状 | 差距 |
|---|---|---|---|---|
| 03 | 对话列表首页（P.05） | `features/messages/ThreadListScreen.tsx`、`VoiceShortcutDock`（`tone="xun"`） | 🟡 不一致 | 主体一致（对话/任务双 Tab、未读徽标、搜索、+ 菜单、右下角 AI 悬浮按钮）。缺：置顶标记（`models/api.ts:146` 有 `pinned` 字段，UI 不渲染） |
| 04 | 新建菜单（P.06） | `features/messages/MessageActionSheet.tsx` | 🟡 不一致 | 设计 3 项：**发起聊天 / 创建群聊 / 扫描名片**；代码只有「扫码」1 项 |
| 05 | 搜索状态（P.07） | `features/search/SearchScreen.tsx`、`app/AppModals.tsx` | 🟡 不一致 | 设计搜「对话、任务或 Agent」；代码搜对话与 Agent，**不含任务** |
| 06 | 任务列表（P.08） | `features/ai/AITaskInbox.tsx` | 🟡 不一致 | 设计：顶部 **两个 Agent 头像 + 名称**、标题、描述、右上状态标签（待确认/已跟进）；代码：单 Agent 头像 + 名称 + 时间，状态在底部 |
| 07 | AI 悬浮菜单展开（P.09） | `VoiceShortcutDock`（`tone="xun"` 三向） | 🟡 不一致 | 设计选项文字：**直接说 / 总结未读 / 替我规划**；代码：键盘 / 妙管家 / 任务。三项功能也要重做 |
| 08 | 直接说 - 语音识别中（P.10） | `services/speechToText.ts`、`VoiceShortcutDock` | 🟡 不一致 | 语音识别能力存在，但设计的「直接说」弹窗形态（青色头部卡 + 正在听 + AI 意图占位 + 重新说/确认执行）未实现 |
| 09 | 直接说 - 意图确认（P.11） | — | 🔴 缺失 | 需 AI 提取发送对象/内容/时间，执行前确认 |
| 10 | 总结未读 - 总览（P.12） | — | 🔴 缺失 | 深色汇总卡 + 立即回复/今天处理/仅了解分组 + 阶段评估 |
| 11 | 总结未读 - 后续内容（P.13） | — | 🔴 缺失 | 长页后半段：内容评估卡 + 仅了解折叠 |
| 12 | 替我规划 - 第一步（P.14） | — | 🔴 缺失 | 逐条引导回复，进度 1/4 + 三条建议 + 输入框 |
| 13 | 替我规划 - 引用建议（P.15） | — | 🔴 缺失 | 点建议写入输入框（选中态描边） |
| 14 | 替我规划 - 下一条（P.16） | — | 🔴 缺失 | 采用后进入下一条，进度 2/4 |
| 15 | 对话详情 - 妙讯管家（P.17） | `features/messages/MessagesScreen.tsx`、`ChatMessageItem.tsx`、`ChatComposer.tsx` | 🟡 不一致 | 气泡与输入区已有；缺输入框上方的**快捷指令胶囊**（生成今日待办 / 今晚只提醒紧急事项 / 同步相关 Agent） |
| 16 | 对话详情 - 妙猜猜（P.18） | — | 🔴 缺失 | 底部弹层，基于当前聊天识别意图并给出 4 条建议服务 |
| 17 | 妙讯管家沉浸模式（P.19） | — | 🔴 缺失 | 优先级总览型：深色 hero + 3 条任务卡（右侧高亮值） |
| 18 | 附近趣事沉浸模式（P.20） | — | 🔴 缺失 | 内容流型：动态流 + 图片 + 话题标签 + 行动按钮 |
| 19 | 全球星探沉浸模式（P.21） | — | 🔴 缺失 | 发现匹配型：hero + 3 张创作者卡（匹配度百分比） |
| 20 | 交友雷达沉浸模式（P.22） | — | 🔴 缺失 | 人物关系型：hero + **2×2 网格**人物卡 |
| 21 | 邻里互助沉浸模式（P.23） | — | 🔴 缺失 | 社区行动型：hero + 3 条互助卡（右侧步行/耗时） |
| 22 | 接单助理沉浸模式（P.24） | — | 🔴 缺失 | 报价交付型：hero + 3 档报价卡（左侧强调线） |

---

## 四、二楼（8 项）

| # | 状态（页码） | 现有实现 | 现状 | 差距 |
|---|---|---|---|---|
| 23 | 二楼功能入口（P.25） | `features/second-floor/SecondFloorScreen.tsx`、`assist/AIAssistGestureSurface.tsx` | ✅ 一致 | **批次 3 已改**：第 6 个工具标签由「隐私」统一为「权限」（与 P.25 标签、P.31 标题、`assistRequest.ts` 的「讯 · 二楼 · 权限」一致）。6 个工具、拖拽手柄与「返回对话」齐全 |
| 24 | 相册（P.26） | `SecondFloorAlbums.tsx`、`SecondFloorAlbumList.tsx` | 🟡 不一致 | 虚线空状态框已有（`borderStyle: 'dashed'`）。**缺顶部两段控件**（同步手机相册 / 上传照片）——当前只上传所选照片、明确不自动同步，两段会指向同一动作。**需你定**：补说明性两段，还是保留单入口 |
| 25 | 文件（P.27） | `SecondFloorFiles.tsx` | ✅ 一致 | **批次 3 已改**：新增 `formatFileSize()`，字节数按设计显示为「2.4 MB / 18 KB」；文件类型方块改为显示扩展名（PDF / MD），无扩展名时回落到通用图标；「App 生成文件」区块已有 |
| 26 | 关系（P.28） | `SecondFloorRelationships.tsx` | 🟡 不一致 | 设计为 4 张量化指标卡（交易信誉 96 / 朋友质量 82 / 互动可信度 88 / 关系稳定度 79）；**全仓无评分数据源**，当前如实提示「关系评估尚未开放」并列出真实好友/关注/粉丝。**受后端阻塞，不用假数据** |
| 27 | 资产（P.29） | `SecondFloorAssets.tsx`、`station/MiaoPointsScreen.tsx` | 🟡 不一致 | 余额与流水为真实数据；**缺「累计赚取 / 累计消耗」**——`listMiaoPointLedger` 只返回最近 80 条且无合计接口，求和等于把「最近 80 条」冒充「累计」，故未做。**受后端阻塞** |
| 28 | 信息海（P.30） | `SecondFloorInformation.tsx` | 🟡 不一致 | 设计为多来源清单（短信/邮件/微信/通知/通话 + AI 状态标签）；代码只有 App 通知，且明确提示第三方来源尚未接入 |
| 29 | 权限（P.31） | `SecondFloorPermissions.tsx` | 🟡 不一致 | 设计为第三方平台登录授权列表 + 支付权限限额（单笔/每日 + 三档选择器）；代码是跳转账号与隐私设置 |
| 30 | 信息海 - AI 处理展开（P.32） | — | 🔴 缺失 | 展开单条来源信息，显示 AI 处理判断行。**依赖 28 的多来源接入，受其后端阻塞** |

---

## 五、我（3 项）

| # | 状态（页码） | 现有实现 | 现状 | 差距 |
|---|---|---|---|---|
| 31 | 个人主页 - 动态（P.33） | `station/StationScreen.tsx`、`StationHeader.tsx`、`StationPostsPanel.tsx` | 🟡 不一致 | **骨架已改**：切换栏从固定页头移入滚动流并吸顶（原型 `.me-switch { position: sticky; top: 72px }`），改为两段等宽胶囊（`repeat(2,1fr)`、`gap 3`、`padding 4`、`border-radius 10`、选中白底），去掉图标与下划线；动态卡已改为 `me-post-card` 结构（作者行 + kind 胶囊 + 正文 + 16/10 媒体 + 互动行）。**第三轮再改**：切换栏选中段阴影按原型修为 `shadowColor #1C1C24 / shadowOpacity .08`（原为纯黑 `opacity 1`，重约 12 倍），并补 `:active scale(.97)`；折叠由布尔硬切改为 `Animated` 插值（340ms / `Easing.bezier(.2,.8,.2,1)`，原型 `.34s cubic-bezier(.2,.8,.2,1)`）；滚动判据由 2px 改为双向滞后（累计上滑 ≥24px 折叠，`y ≤ 8` 展开）；卡片与切换栏合并为一个 sticky 块并补 `contentInsetAdjustmentBehavior="never"`；kicker / 简介 / 位置改用原型色 `#15938e` / `#4f4f56` / `#8d8d94`；「正在发生」发布行删除，发布归二楼。

**第四轮再改**：
- **我页个人卡**：简介与位置从卡片全宽兄弟节点移回右列内（原型 `.me-identity` 依次装 kicker → 名字 → ID → 简介 → 位置五项），折叠时随右列一起淡出。
- **动态卡互动行**：按原型补 `paddingHorizontal: 8`、`gap: 5`、图标 17px、文字 11.5px（`.72rem`）；按下态 `#fff0f2` 加 0.94 缩放——**原型无点赞动画**（仅 7 个 keyframe），此为设计未定义处的自行取舍。
- **3D 取景**：viewer 原按包围球取 `min(竖直, 水平)半角`（`contain` 语义），窄框里相机被推远、模型偏小。改为 `max`（`cover` 语义，对应原型 `object-fit: cover`），`Qu` 1.08 → 1.02，取景目标上移 `y*0.15`（对应 `object-position: 50% 36%`）。
- **设置承载**：`SettingsScreen` 增加 `embedded`，由二楼面板按 `.xun-floor-panel-body`（14/12/12）承载；二楼第 8 项「设置」由动作改为面板，不再跳全屏 modal。逻辑与字段未动。
- **用户头像**：`UserAvatar` 原**丢弃 `text`**、用 `avatarConfig` 程序化生成卡通小人。改为原型做法——`.xun-avatar` 是同形圆片，取 `avatarText` 首字（服务端已存 `left(display_name,1)`）+ 默认底色；`imageUrl` 存在时优先。`config` 仅保留以兼容调用点。
- **讯页长按三向**：文案对齐原型 `#xunVoiceCluster`「直接说 / 总结未读 / 替我规划」（原为「键盘 / 妙管家 / 任务」三处全错）。妙页三项「键盘 / 妙管家 / 瀑布」经核对**与原型一致，未改**。

**骨架轮再改**：个人卡按 `.me-profile` 收敛为五行（kicker / 名字 / ID 胶囊 / 简介 / 位置），二维码、编辑铅笔、标签行移出卡片进页面级 `···` 菜单；在线状态从独立文字行改为 3D 块右下角 23px 对勾徽章（`.me-avatar-badge`）；位置只显示地区（新增 `stationDisplayRegionLabel`，优先 `publicLocation`，不再输出完整地址）；`.me-switch` 严格两段等宽，`···` 移出凹槽。**仍差**：视频时长（DTO 无字段，后端）；「互动」kind 需投票；互动行为点赞/收藏/评论 3 项（原型 2 项，待确认） |
| 32 | 个人信息收缩状态（P.34） | `station/StationScreen.tsx`（`profileCollapsed`） | 🟡 不一致 | **批次 2 已改 + 骨架轮修正**：收缩后卡片 64px 高、46px 圆形头像、名称 1rem，隐藏 kicker/ID/简介/位置/徽章；展开态卡片按 `.me-profile` 加 `min-height: 35dvh`、12px 圆角、18px 内距。**仍差**：代码用状态切换，设计是 `.34s` 过渡动画；未做吸顶（归入交互与动画批次） |
| 33 | 我的 Agent（P.35） | `station/StationAgentsPanel.tsx`、`StationAgentCards.tsx` | 🟡 不一致 | **骨架已改**：删除「能力接入率」整块（63% / 进度条 / 我的助理·我的能力·可添加），Agent 列表直接跟在切换栏后；`me-agent-meta` 三格改为**只渲染有真实数据的格**（「添加时间」用 `OwnedAgentDTO.createdAt`），无数据时不渲染空格、不放占位文字。**仍缺**：数量等级、被添加星标、原创标记、底部等级进度条、`me-agent-card` 的 14px 内距与 8px 圆角——后端无字段 |

---

## 六、汇总

| 现状 | 数量 | 状态编号 |
|---|---|---|
| ✅ 一致 | 4 | 01、02、23、25 |
| 🟡 不一致 | 15 | 03、04、05、06、07、08、15、24、26、27、28、29、31、32、33 |
| 🔴 缺失 | 14 | 09、10、11、12、13、14、16、17、18、19、20、21、22、30 |
| **合计** | **33** | |

**骨架轮（用户验收「跟改之前没区别」后的修订）**：妙页删标题 + 卡片圆角化 + 3px 间距；我页切换栏移入滚动流并吸顶、改两段胶囊；删「能力接入率」；Agent 卡三格改为只显示真实值。四件套全绿（67 套件 / 769 测试）。

**3D 生成入口**：原型个人卡内无任何生成/管理按钮，只有 23px 对勾徽章。已移除 `StationAvatarSpace` 的两处「管理形象 / 生成形象」按钮，生成动作走既有 `onOpenAgentThread('model-3d')` 通道（`StationScreen.tsx` 的 `onOpenCoreAgent`）；长按菜单的「3D Agent」入口保留。

**批次进度**：
- 批次 1（妙页 01–02）：完成。
- 批次 2（我页 31–33）：完成 31 的卡片重构、32 的收缩态、33 的三列数据块；33 的等级/星标/原创受后端阻塞。
- 批次 3（二楼 23–30）：完成 23 的工具名与 25 的文件展示；24 待你定分段控件；26/27/28/29/30 受后端数据阻塞，已按约定标「未接入」，未用假数据。
- 批次 4（交互与动画）：未开始。
- **设计未定义 / 待后端**：头像上传无接口（`users` 表只有 `avatar_text` / `avatar_config`，无图片列），`UserAvatar` 已按「上传图优先」写好分支但无数据源；讯页三项的真实行为（意图确认 / 未读汇总 / 四步规划）后端未提供，本轮只对齐文案。互动行点赞动画、收藏第三项均为设计未定义处，保持现状待用户确认。
- **用户决策的设计外新增（便于日后回溯）**：二楼工具行第 7 项「发布」（含发布动态 + 写日记）、第 8 项「设置」。原型二楼只有 6 个工具，且我页个人卡内无设置入口；两处均按用户明确要求新增。原「正在发生 / 分享此刻的生活 / 写日记 / 发布动态」composer 整块删除。
- 骨架轮（用户验收「跟改之前没区别」后）：妙页删标题 + 卡片圆角化 + 3px 间距；我页切换栏移入滚动流并吸顶、改两段胶囊；删「能力接入率」；Agent 卡三格改为只显示真实值；我页个人卡按 `.me-profile` 收敛五行 + 对勾徽章 + 地区精简；3D 生成按钮移除、改走 Agent。

**后端依赖清单**（需另行排期，不在本轮范围）：
1. `OwnedAgentDTO` 补 `level` / `starCount` / `isOriginal` / `addedAt`（33 的等级、星标、原创标记与进度条）
2. 关系量化评分接口（26 的四项指标）
3. 妙点累计赚取/消耗聚合，或流水接口返回合计（27）
4. 信息海多来源接入（28、30）
5. 第三方授权与支付限额（29）
6. `StationMediaAssetDTO` 补视频时长（31 的时长角标）
7. 投票功能（31 的「互动」kind 与投票卡）

**成组缺失**（一次要做的整条链）：
- 09–14：直接说 / 总结未读 / 替我规划（6 项）
- 17–22：六种沉浸模式（6 项）
- 16：妙猜猜；30：信息海 AI 处理展开（各 1 项）

**已核对的细节**（HTML 原型，可查证）：
- `task-card` 的真实结构确认为 `<div class="agents-strip">`（多个 `agent-person`：头像 + `agent-name`）在前，`<p class="task-description">` 在后，数字包在 `<span class="task-number">` 里（例：`获得了 <span class="task-number">300</span> 张你喜欢的照片`）。状态**不在卡片内**——原型卡片只有 Agent 横条 + 描述两层。
- `me-post-kind` 有三个取值：`图文`、`视频`、`互动`（PDF 的 33/34 两页只显示了前两个）。
- 「我」页原型里**没有**「正在发生 / 分享此刻的生活」这类发布区块：`me-switch` 切换栏之后直接就是 `me-content` 动态列表，全篇查无「正在发生」「分享此刻」字样。

**待你确认的两处**：
1. **状态 23 第 6 个工具名**：设计该处文字为「权限」，代码标签为「隐私」，P.31 页标题也是「权限」——统一用哪个？
2. **动态 Tab 顶部「正在发生 / 分享此刻的生活」区块**（`StationPostsPanel.tsx` 的 `composer`）：原型 STATE 31 的切换栏下方直接就是动态卡片，没有这一行。它对应的是**发布动态**（`onOpenPostComposer`）与**写日记**（`onCreateDiary`）两个入口，右侧两个图标按钮就是它们。设计里找不到位置，暂不删，等你定入口归属。

---

## 七、交互与动画规格

**来源**：`妙-App-可分享原型.html` 的 CSS 原文（逐条 grep 提取）。参数一律照抄原型，**原型未写的标注「原型未定义」，未做任何补值**。

### 7.1 keyframes（原型共 7 个，与清单核对一致）

| keyframes | 关键帧（原型原文） | 声明处（选择器 → animation） | 对应状态 |
|---|---|---|---|
| `voice-pulse` | `from { opacity: .8; transform: scale(.82); }`<br>`to { opacity: 0; transform: scale(1.38); }` | `.xun-command-listening::after` → `1.4s ease-out infinite`<br>`.voice-cluster.listening .voice-trigger::before` → `1.45s ease-out infinite`<br>`.voice-cluster.listening .voice-trigger::after` → `1.45s ease-out infinite`，且 `animation-delay: .55s`<br>`.voice-input-icon::after` → `1.45s ease-out infinite` | 02、08 |
| `xun-command-backdrop-in` | `from { opacity: 0; }`（**to 帧原型未声明**，回到元素自身样式） | `.xun-command-sheet` → `xun-command-backdrop-in .2s ease` | 08–14、16 |
| `xun-command-card-in` | `from { opacity: .4; transform: translateY(-16px) scale(.97); }`（**to 帧原型未声明**） | `.xun-command-card` → `xun-command-card-in .28s cubic-bezier(.2,.8,.2,1)` | 08–14、16 |
| `xun-floor-panel-in` | `from { opacity: 0; transform: translateY(12px); }`<br>`to { opacity: 1; transform: translateY(0); }` | `.xun-floor-panel` → `xun-floor-panel-in .24s cubic-bezier(.2,.8,.2,1)` | 23–30 |
| `xun-immersive-in` | `from { opacity: .45; transform: translateX(-28px); }`<br>`to { opacity: 1; transform: translateX(0); }` | `.xun-thread.immersive-enter .xun-thread-body` → `xun-immersive-in .28s cubic-bezier(.2,.8,.2,1)` | 17–22 |
| `xun-thread-in` | `from { opacity: .5; transform: translateX(-43%); }`<br>`to { opacity: 1; transform: translateX(-50%); }` | `.xun-thread` → `xun-thread-in .28s cubic-bezier(.2,.8,.2,1)` | 03、15 |
| `xun-workspace-in` | `from { opacity: .5; transform: translate(-46%, 18px); }`<br>`to { opacity: 1; transform: translate(-50%, 0); }` | `.xun-ai-workspace` → `xun-workspace-in .3s cubic-bezier(.2,.8,.2,1)` | 07、16 |

### 7.2 径向选项错峰（voice-cluster）

| 选择器 | 参数 | 说明 |
|---|---|---|
| `.radial-option` | `transition: opacity .18s ease, transform .38s cubic-bezier(.18,.88,.28,1.18), background .18s ease` | 三向/三入口选项的基础过渡；缓动含回弹（1.18） |
| `.radial-option:active` | `transition-duration: .08s` | 按下时收紧 |
| `.voice-cluster.expanded .radial-option:nth-of-type(3)` | `transition-delay: .035s` | 展开错峰第 1 档 |
| `.voice-cluster.expanded .radial-option:nth-of-type(4)` | `transition-delay: .07s` | 展开错峰第 2 档 |

> 第 1、2 个选项无 `transition-delay` 声明（即 0）。原型只对第 3、4 项声明了错峰，**未定义更长的阶梯**。

### 7.3 其他 transition（原型原文）

| 选择器 | 参数 | 对应状态 |
|---|---|---|
| `.tabbar` | `opacity .28s ease, transform .34s cubic-bezier(.2,.8,.2,1)` | 主导航显隐（02 长按后隐藏） |
| `.tab` | `color .18s ease, transform .18s ease, background .18s ease` | 01、03 |
| `.xun-shell` | `transform .34s cubic-bezier(.22,.82,.22,1)` | 二楼下拉 |
| `.xun-shell.xun-pulling` | `transition: none` | 拖拽跟手时禁用过渡 |
| `.xun-floor-pull-cue` | `opacity .18s ease` | 二楼下拉提示 |
| `.xun-plan-progress-bar i` | `width .28s ease` | 12–14 进度条 |
| `.voice-trigger` | `transform .24s ease, box-shadow .24s ease, background .24s ease` | 02、07 |
| `.voice-input-panel` | `opacity .22s ease, transform .28s cubic-bezier(.2,.8,.2,1)` | 02、08 |
| `.voice-hint` | `opacity .2s ease` | 02 |
| `.me-profile` | `min-height .34s cubic-bezier(.2,.8,.2,1), padding .34s cubic-bezier(.2,.8,.2,1), margin-top .25s ease, border-radius .25s ease, box-shadow .25s ease` | **32 收缩态** |
| `.me-profile-main` | `grid-template-columns .34s cubic-bezier(.2,.8,.2,1), gap .34s cubic-bezier(.2,.8,.2,1)` | **32 收缩态** |
| `.me-avatar-wrap` | `width .34s cubic-bezier(.2,.8,.2,1), height .34s cubic-bezier(.2,.8,.2,1), border-radius .3s ease` | **32 收缩态** |
| `.me-switch-button` | `color .18s ease, background .18s ease, transform .18s ease` | 31、33 切换栏 |
| `.me-poll-option::before` | `width .36s ease` | 31 投票（功能未实现） |

### 7.4 无障碍：减少动态效果

原型：`@media (prefers-reduced-motion: reduce) { * { transition-duration: .001ms !important; } }` —— 全站过渡压到 0.001ms。

### 7.5 RN 侧现状与差距

| 项 | 现有实现 | 差距 |
|---|---|---|
| 长按菜单出现 | `assist/AIAssistProvider.tsx`：`Animated.timing(scale, duration: 90, Easing.out(Easing.cubic))`；遮罩 `reveal` `duration: 120` | 原型无对应 keyframe（菜单出现参数**原型未定义**），现有值不是从原型抄的，属既定实现。**保持不动** |
| 语音按钮脉动 | `agents/VoiceShortcutDock.tsx`：**已改为**双环 `pulse` / `pulseLate`，1.45s `cubic-bezier(0,0,.58,1)` infinite，第二环 `delay 550ms`；关键帧 `opacity .8→0 / scale(.82)→(1.38)` | ✅ 与原型 `voice-pulse` 一致（原型 `::before` + `::after` 同动画、`::after` 延迟 .55s） |
| 语音面板出现 | `VoiceShortcutDock.tsx`：**已拆为** `statusFade` `.22s` + `statusSlide` `.28s entranceCurve`，起点 `translateY(-12) scale(.98)` | ✅ 与原型 `.voice-input-panel` 一致 |
| 径向选项 | `VoiceShortcutDock.tsx`：**已拆为** 每项各自的 `optionFade` `.18s ease` + `optionSlide` `.38s radialCurve`，收起态 `scale(.42)` | ✅ 与原型 `.radial-option` 一致 |
| 径向错峰 | **已实现**：第 3 项 `transition-delay: .035s` | ✅ 按原型。原型 `.radial-option:nth-of-type(4)` 的 `.07s` **匹配不到元素**（第 4 个 button 是 `voice-trigger`，无 `radial-option` 类），故不实现 |
| 侧滑（03 对话、15 详情、二楼） | `ThreadListScreen` / `MessagesScreen` / `StationContentListScreen`：`Animated.spring` + `Animated.timing(duration: 160–180)` | 原型 `.xun-thread` 是固定 `xun-thread-in .28s cubic-bezier(.2,.8,.2,1)` 单次入场；RN 用 spring，参数不相同。**未改**：这三处是跟手手势的收尾弹簧，改固定时长会破坏跟手感，属设计未定义处的取舍 |
| 二楼面板 | `second-floor/SecondFloorScreen.tsx`：**已加** `panelEntrance`，`.24s entranceCurve`，起点 `translateY(12)`；与既有 `toolScroll` 滚动联动并存 | ✅ 与原型 `xun-floor-panel-in` 一致 |
| 我页收缩（32） | `station/StationScreen.tsx`：**已在第三轮改为** `collapseProgress` `Animated` 插值，340ms `Easing.bezier(.2,.8,.2,1)` | ✅ 过渡已与原型 `.me-profile` 一致（吸顶见 31） |
| 底导显隐 | `App.tsx`：**已改为** `navigationHideProgress`，340ms `entranceCurve`，隐藏态 `translateY(34)` + `opacity 0` | ✅ 与原型 `.tabbar.floor-hidden` 的 `translate(-50%,34px)` 一致 |
| 沉浸模式 / 命令卡 / 工作区入场 | — | **仍缺** `xun-immersive-in` / `xun-command-*-in` / `xun-workspace-in`（依赖对应状态先实现，见八节 C 组） |
| 减少动态效果 | **新增** `shared/useReduceMotion.ts`，`App` / `AIAssistProvider` / `VoiceShortcutDock` / `SecondFloorScreen` 四处共用；`shared/useReduceMotion.ts` 同时导出三条原型缓动曲线 | 已覆盖本轮新增的全部动画。原型是**全站** `*` 生效；尚未接入的只剩侧滑 spring 与 `<Modal>` 系统过渡（无法用 `Animated` 覆盖） |

**第四批（交互与动画）已完成**。原型参数一律取自 `妙-App-可分享原型.html` 的 CSS 原文，新增 `shared/useReduceMotion.ts` 集中三条曲线（`easeOutCss` / `entranceCurve` / `radialCurve`）与系统偏好读取，四处动画共用同一份，不再各写各的。

## 八、后续批次（按本清单顺序）

1. **第一批**：妙页 01–02 ✅ 已完成
2. **第二批**：我页 31–33 ✅ 31/32 完成，33 部分受后端阻塞
3. **第三批**：二楼 23–30 ✅ 23/25 完成，其余受后端阻塞
4. **第四批**：交互与动画 ✅ 已完成（规格见第七节 7.5 的逐项结果）

每批改完跑 `tsc` / `lint` / Jest，构建到固定 iPhone 17 模拟器核验截图。

### 8.1 讯页批次（03–22，20 个状态）建议拆分

> **本节只是建议，未实施。** 依据来自本次对 `MiaoxunRN/src` 与 `backend/src` 的实际查找。

**A 组 · 纯前端，有真实数据可做（建议一个批次）**

| # | 状态 | 说明 | 依据 |
|---|---|---|---|
| 03 | 对话列表首页 | 只差**置顶标记**的展示。`ChatThreadDTO.pinned` 字段存在，后端已按 `ORDER BY t.pinned DESC` 排序 | `models/api.ts:146`、`backend/src/message-repository.js:302`。**注意**：置顶的**写**接口不存在，本组只做标记显示，不做置顶操作 |
| 05 | 搜索状态 | 补上**任务**这一维度。任务已在 `useAITasks` 可取，搜索面板已同时支持对话与 Agent | `SearchScreen.tsx` 现只收 `threads/agents/friends`；`useAITasks` 可直接复用 |
| 06 | 任务列表 | 状态标签**位置与样式**按设计调整（右上胶囊）。多 Agent 头像行受后端阻塞，见 B 组 | `AITaskInbox.tsx` 已有 `TaskStatus`；`AITaskDTO` 只有单个 `agentId` |
| 15 | 对话详情 - 妙讯管家 | **快捷指令胶囊**的 UI 与预填。输入框已支持 `initialDraft` / `setDraft` | `MessagesScreen.tsx` 的 draft 机制已存在。胶囊背后的三件事属 B 组 |

**B 组 · 依赖后端或需先补数据（建议单独排期）**

| # | 状态 | 阻塞点 |
|---|---|---|
| 03 | 置顶的**操作**（长按置顶/取消） | 无写接口，仅有读与排序 |
| 04 | 新建菜单「发起聊天 / 创建群聊」 | 现只有「扫码」1 项；**建群后端不存在**（`chat_threads.kind` 无 group 写入路径），发起聊天需确认是否复用好友会话 |
| 06 | 多 Agent 头像行 | `AITaskDTO` 只有单 `agentId`，多参与者只存在于 `agent_workspaces`（`steps[].agentId`），需契约扩展 |
| 07 | AI 悬浮菜单三选项文案与功能 | 需把现有「键盘/妙管家/任务」改为「直接说/总结未读/替我规划」，功能属 C 组 |
| 15 | 三条快捷指令的**实际动作** | 需后端提供对应能力 |
| 31 | 互动行（收藏项去留） | 见待确认事项 |

**C 组 · 整条新链路（每个都建议独立批次）**

| # | 状态 | 链路 |
|---|---|---|
| 08–09 | 直接说（语音识别中 / 意图确认） | 语音已具备（`services/speechToText.ts`），缺**意图解析 + 执行前确认**链路 |
| 10–11 | 总结未读（总览 / 后续内容） | 需 AI 汇总未读并分组排序 |
| 12–14 | 替我规划（三步） | 需逐条生成回复建议 + 进度 |
| 16 | 妙猜猜（底部弹层） | 需基于当前会话的意图推荐 |
| 17–22 | 六种沉浸模式（6 项） | 每个都是独立的展示形态 + 数据来源，建议**一模式一批** |

**建议执行顺序**：A 组 → 31/33 的后端字段补齐 → C 组（按 08–14 连成一条链优先，再逐个沉浸模式）。

每批改完跑 `tsc` / `lint` / Jest，构建到固定 iPhone 17 模拟器核验截图。

---

**文档结束**

# Build61聊天、漫画制作与历史贡献提示修复

本轮在指定`admin-lifecycle-release/marvelsChat`工作树继续，保留所有既有二楼/UI-Agent修复。用户报告UI-Agent仍无法添加、漫画专聊出现历史协作贡献不可读提示、图片请求仅收到文字分镜，以及长文本尾部不可见、笑脸直接插入表情。以下是源码修复及隔离证据，不是Build61或真机通过结论。

## 现状与根因

| 项目 | 当前证据 | 状态 |
| --- | --- | --- |
| 手机版本/漫画目录 | 用户确认1.0(61)已安装，漫画可见、显示已绑定 | 已确认到用户反馈；完整scope未独立读取 |
| UI-Agent添加 | Build61缺`ui-preferences:write`展示标签，未知权限保护拒绝；上一阶段已补准确标签 | 本地修复，未进入Build61，不要求解绑重绑 |
| 漫画聊天 | 专业消息实际走dispatch，能力仅`comic.storyboard`，没有连接独立图片制作入口 | 本轮补真实制作入口与准确说明 |
| 历史贡献提示 | 专聊读取该Agent历史贡献；旧轮次、direct及失败/取消节点会逐个重验，403/404/409曾折叠为同一提示 | 本轮补安全原因；用户具体旧节点原因仍未知 |
| 输入区 | 长连续文本自动折行前被44pt高度和JS滚动门槛限制；单行按钮挤压；笑脸硬编码追加😊 | 本轮改全宽编辑/工具两行与显式表情选择 |
| 二楼退出 | 用户说回讯页瞬间卡顿/跳动/空白 | 上一阶段源码已修，尚待新包真机复验 |

2026-11-11约06:10–06:13 UTC公开只读复核：health/ready均200、数据库已连接且迁移current；`GET /api/agents`的`data`实际9项，含`comic-diary 0.1.4`、`ui-agent 0.1.0`。只证明公开目录与服务健康，不证明用户scope、Worker、实际模型或所有Agent可用；未调用受保护接口伪造后台操作。

## 实现

- `ChatComposer.tsx`和`chatLayoutStyles.ts`：编辑区独立全宽、44–132pt增高，原生内部滚动不等待JS高度门槛。工具独立一行，点击区域至少44pt；笑脸先打开12个Unicode表情选择，点击后替换选区/插入并恢复光标，不自动发送、启动录音或覆盖新输入。使用现有token，无新依赖。
- `MessagesScreen.tsx`和`App.tsx`：仅漫画非群聊显示“制作漫画”，只传当前用户草稿，不自动读聊天记录；独立全屏Modal保留聊天实例/草稿，每次打开使用独立key，owner/thread/route校验拒绝跨账号或旧回调。缺图片scope时提供现有授权管理入口，保留草稿；不自动同意或解绑。
- 新`ComicCreationScreen.tsx`及既有`StationComicDiaryPanel.tsx`：复用既有可选`diaryEntryId`合同，允许纯故事输入，默认4格；超1200字保留全文并明确禁提交。独立草稿完整显示scene、旁白、对白、mood和camera；只有用户确认才调用原`StationComicRenderPanel`图片队列。加载/真实403失败/重试/重复点击/换号迟回均有明确状态。制作页单独避让键盘，返回触点至少44pt。
- `comic-diary.agent.js`源码升`0.1.5`：在实际dispatch路径明确已有独立图片流程，图片目标引导“制作漫画”；普通聊天和workspace仍只交付文字。没有新增workspace执行器、scope或自动付费调用。
- Backend的`agent-workspace-service.js`、合同及路由：贡献合同4仅新增不可读原因枚举`authorization/source/version/unavailable`，不含私人正文；原精确读取403/404/409及授权决策不变。仅真实用户grant/scope失效归授权，产品发布/账本等歧义归不可用，不能误导重授权。合同2/3显式保持原形状，4严格要求原因，新RN不降级旧合同。
- RN模型、API、hook和新`WorkspaceContributionNotice.tsx`：聚合四类原因，区分历史成果与当前消息，保留手动重试；仅明确授权类显示管理入口，加载/换号/后台/超时清理计数。不隐藏真实失败。

没有新增迁移、原生桥、依赖/lock、Provider或配置变量，仍使用现有058、comicRenders:1、私有存储和独立`media:image:generate`。配置样例无需增加新开关；没有用mock代替线上能力。

## 验证

- Composer核心7项先RED后修，第8项覆盖光标默认和晚回调；与聊天/语音/键盘4套52项通过。日志`/tmp/miaoxun-chat-composer-20261111/`。
- 漫画组件18项、Agents完整58项、Backend漫画合同17项通过；覆盖无日记、完整分镜、保存不生图、明确确认、重复点击、真实403及跨账号迟回。日志`/tmp/miaoxun-comic-entry-{green-rn,green-agent,backend-contract}.log`。
- 新App接线及漫画入口各先确认缺入口失败，再通过；导航/内容动作/原因提示3套46项通过。独立review继续补键盘与手动重试反馈问题后再跑最终门禁。
- 一次性本机空库`miaoxun_comic_acceptance_20261111_migration_test`：58迁移全应用；`RUN_COMIC_RENDER_INTEGRATION=1`14/14零跳过，含无日记草稿的队列、幂等、owner/撤权/来源、私有输出、部分/未知失败、取消并发与清理。库已删除，核对同名库计数0；没有用生产库。日志`/tmp/miaoxun-build61-comic-pg-20261111.log`。内部fixture不代表真实模型成图。
- 历史原因合同：Backend16项通过，覆盖漫画direct/coordinated、排队/完成节点的原grant禁用、版本变化、产品合同不可用12种分支；原精确错误码不变。RN API/轮询/分页/卡片4套100项通过，含手动重试立即加载、完成恢复、busy复用与定时轮询不闪。
- 新制作页键盘与44pt返回先RED后修，含App/漫画/原因提示5套66项通过，日志`/tmp/miaoxun-comic-keyboard-20261111/`。Composer、App接线及原因合同均经独立交叉审查；审查提出的产品不可用误归授权、键盘避让、返回点击区、手动重试无加载反馈均已修复并回归，未放宽权限或检查门槛。
- 最终`MIAOXUN_DOTENV_ENABLED=false ./scripts/check-repository.sh`退出0：RN103套1328项、Backend1140通过/376环境门控跳过、Agents58、Admin52、Avatar29、检索Web4；RN类型、ESLint零warning、格式及Web构建全部通过。PG跳过不算通过，数据库证据仅为上一条独立14项。首次整仓被新制作页的inline-style警告拦截，已改局部StyleSheet后完整重跑通过；最终日志`/tmp/miaoxun-build61-chat-comic-repository-final-20261111.log`。
- `node scripts/miaoxun-development.mjs ios --build-only`退出1：固定iPhone17仍Shutdown，脚本在构建前无法只读取得现有正式App容器而中止（CoreSimulator405）。未boot、install、launch或绕过保护，故本轮不具备Simulator编译/视觉或真机验收证据。日志`/tmp/miaoxun-build61-chat-comic-simulator-20261111.log`。最终`git diff --check`通过。
- 最终独立复核确认产品误分类P2关闭、未发现剩余可行动代码问题；真实原生表现仍待验。日志、结构化结果及49项工作树文件SHA另存仓库外`/Users/gary/Library/Application Support/MiaoxunReleasePreparations/agent-lifecycle-20261111/chat-comic-followup-20261111T062309Z/summary.json`，记录全部既有dirty而不将其都计作本轮新增。

## 本阶段文件清单

客户端业务：`MiaoxunRN/src/App.tsx`、`features/messages/{MessagesScreen,ChatComposer,WorkspaceContributionNotice}.tsx`、`features/messages/{chatLayoutStyles,useWorkspaceContributions}.ts`、`features/station/{ComicCreationScreen,StationComicDiaryPanel}.tsx`、`models/agentWorkspace.ts`、`services/api/agentWorkspaceApi.ts`（除首项外相对`MiaoxunRN/src/`）。上一阶段UI-Agent/二楼/列表修复仍保留，不重复计作本轮新增。

RN回归：`MiaoxunRN/__tests__/{chatComposerEditing,comicCreationKeyboard,workspaceContributionNotice,appWorkspaceNavigation,chatContentActions,comicRenderPanel,workspaceContributionPagination,workspaceContributionsPolling}.test.tsx`、`agentWorkspaceApi.test.ts`。Agent：`agents/comic-diary.agent.js`、`agents/test/{registry,specialist-dispatch}.test.js`。Backend：`backend/src/{agent-workspace-service,ai-client-contract}.js`、`backend/src/routes/agent-workspace-routes.js`、`backend/test/{agent-workspace-contributions,agent-workspace-routes,ai-client-contract,comic-diary-agent,workspace-contribution-discussion-integration}.test.js`。

文档：本记录、`docs/{README,agents,agent-workspace-architecture,ai-interaction-system,station-feature-closure}.md`、`docs/handoffs/CURRENT.md`。其他既有dirty文档原样保留。

## 发布与验收边界

本轮未提交、推送、生产部署、后台发布、TestFlight上传、付费调用、代用户授权或写生产生成任务。线上仍0.1.4，用户手机仍Build61，不能把本地修复说成已在手机解决。

后续发布必须先具备支持贡献合同4的Backend，再分发新客户端；旧2/3请求仍有显式合同支持。若部署含漫画0.1.5的runtime，必须通过正常后台发布匹配源码/版本/hash的新Release及Product，再核对公开目录与用户精确授权；不能同号改0.1.4或直接扩旧scope。发布顺序、版本/hash门禁及新的用户授权按各自范围核实，不能因“源已改”就认定发布成功。

新包真机需复验UI-Agent添加（取消不写、明确同意才写）、历史贡献具体原因和重试、长文/光标/键盘/表情/窄屏与大字体、二楼退出及妙页卡片。漫画真实生成还需独立核实图片scope并明确模型调用环境、次数/格数/费用范围；仅由用户本人同意授权。其他Agent逐能力验收，顾问、视频文字脚本、群聊未接合同等边界不能扩大为最终产物可用。

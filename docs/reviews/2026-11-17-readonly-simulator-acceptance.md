# 2026-11-17 只读与本地模拟器续验

本阶段按用户最新选择“只继续只读/本地验收”执行。没有生产部署、迁移061、后台发布、TestFlight操作、新消息发送、素材上传、付费生成、应用UI偏好或新增Agent授权。

## 源码与设备基线

- 使用发布工作树 `/Users/gary/.codex/worktrees/admin-lifecycle-release/marvelsChat`，开始时HEAD为`d04221f7f07c05c1ae24789c087eb9d03e7ed193`，Git干净且与远端一致。Desktop检出是另一条有既有修改的分支，本阶段未修改它。
- 固定iPhone17 / iOS26.5 Simulator由用户手动登录测试账号。实际安装回执来源为clean commit `b66a442802ead00cbc40058f18d67b99b852ecb3`；该提交到本轮HEAD只有CURRENT文档变化，没有运行代码差异。
- 设备内为本地Debug `1.0(63)`，Bundle为`com.wangruoshi.miaoxun`，连接正式HTTPS API；不能将其视作TestFlight Build66或实体iPhone。回执：`/Users/gary/Library/Application Support/MiaoxunDevelopment/1139656e744d/builds/2026-11-17T07-37-37-955Z/build.json`。本阶段未重新安装或清除账号。

## 实屏结果

| 项目 | 本轮实际结果 | 边界 |
| --- | --- | --- |
| 登录后的页面 | 讯页、我的Agent目录、漫画历史聊天可打开 | 不据此判定所有Agent执行能力 |
| UI Agent目录与权限 | 添加确认显示v0.1.0，以及读取个人资料、读取获准对话、修改界面偏好三项；已点取消 | 未新增授权、未发消息、未应用预览 |
| 漫画目录与权限 | 添加确认显示v0.1.6和完整七项权限，包含“生成图片”；已点取消 | 当前测试账号显示“添加”，不是已授权；不能代用此前其他设备/账号的授权 |
| 我的漫画 | 作品集、历史作品详情及返回聊天路径可用；四格详情保持2×2网格 | 本次打开的是仅有分镜的历史作品，没有成图可用于图片查看/保存验收 |
| 二楼页面与返回 | 从讯页“新建”的无障碍操作“打开二楼”进入；落地页、六个首屏工具与底部返回控件可见；底部返回后讯页列表与导航完整恢复 | 只证明明确入口和返回链路；未形成有效手势或动画帧率验收 |

自动化在讯页拖动时未确认到连续位移或进入二楼；底部拖动又落在同时支持点击的返回控件中，无法排除被识别为点击。因此，不记录“下拉进入/上滑退出已通过”，也不记录“无卡顿/无闪烁”。本轮未取得动画过程的连续帧证据。

二楼只读代码复核定位了两处需要真实触摸重点复验的路径：

- `SecondFloorScreen.tsx`固定返回区同时存在`onPress={closeFloor}`与滑动responder；滑动超过10pt才接管。轻微移动后若仍被Pressability识别为点击，会直接退出，不能只用默认88pt手势阈值说明不会误退。尚未实屏复现，不能认定为已确认缺陷。
- 内容ScrollView的`onTouchMove`仅处理多指取消，松手后才执行退出动画；固定返回区会更新`exitProgress`跟手移动。这是当前两条路径的实现差异，不能把固定返回区测试作为整个内容区跟手效果的证明。

## 新鲜检查

- `npm --prefix MiaoxunRN test -- --runInBand __tests__/secondFloor.test.tsx __tests__/chatContentActions.test.tsx __tests__/messageRetry.test.tsx`：3套、146项通过。
- 独立二楼/偏好/讯页保留回归：`secondFloorGestureContinuity`、`secondFloorPreferences`、`secondFloor`、`threadListRetention`、`threadUIPreferences`，5套、72项通过。与上一条有重叠，不累计为独立测试总数。
- `npm --prefix MiaoxunRN run typecheck -- --pretty false`与`git diff --check`通过。
- `MIAOXUN_DOTENV_ENABLED=false ./scripts/check-repository.sh`退出0：RN122套/1508项；Backend1153项通过、410项专用PostgreSQL门控跳过；Agents59、Admin52、avatar-web29、media-retrieval-web4。脚本语法、lint、类型、格式和Web构建通过。完整日志：`/tmp/miaoxun-readonly-local-acceptance-20261117-check.log`。门控跳过不计作本轮PostgreSQL集成通过。
- 08:21 UTC公开只读复核：`/api/health`、`/api/ready`、`/api/agents`均200；数据库connected与migrationsCurrent为true；目录9项，漫画0.1.6、UI Agent0.1.0均为`published=true/catalogStatus=published`，权限与模拟器弹窗一致。脱敏回执：`/tmp/miaoxun-readonly-public-20261117.json`。ready不返回账本编号，不能由其推断061已部署。

## 判定与下一步

本轮已执行的静态、单元和整仓门禁通过；发布判定仍为 **BLOCKED（验收证据未闭合）**。本轮没有修改运行代码。

下一步仍按本地优先：在现有隔离QA流程里复验二楼轻微移动、内容底部滚动与退出反馈，以及普通附件保存后的系统相册落盘；需要真实手指或连续帧的项目单独保留。当前正式API测试账号的漫画/UI Agent授权未执行，生产生成、UI修改不在本轮范围。061生产迁移、Build66上传与实体iPhone验收也分别未执行，不由公开目录或本地测试替代。

# 妙讯接续：长按、检索与上线授权边界

日期：2026-09-18。此文是当前代码与验证检查点，不授权新的生产部署、付费调用或 TestFlight 上传。用户当前对话优先；所有敏感账号、密钥、令牌及私人聊天内容均不写入交接。

## 可给下一对话的提示词

请继续 `/Users/gary/Desktop/myproject/marvelsChat`，先读本交接、`2026-09-16-retrieval-online-candidate.md`、`docs/reviews/2026-09-16-app-interaction-design.md`、`docs/reviews/2026-09-16-cooperation-lifecycle.md`，再查 `git status --short --branch`。保留全部未提交协作成果，不回退、不把本地模拟器通过当作真机或线上部署。正式 App 是 `MiaoxunRN`。当前优先把合作/评价完整流程、第一面真实统计、私有媒体性能与设计验收连成闭环；检索须先完成真实供应商受控验证和预算/开关决策，不能绕过生产限制。新增发布前还要补 Nginx 安全头、确认动态媒体授权及后台权限在生产生效、真机长按拖动/触感验证。沿用显式配置和失败状态，不做假数据或静默兼容。跨层改动要同步后台、迁移、测试和文档；不输出秘密。

## 本轮实际完成

- 修正检索并发幂等测试夹具的 `ROLLBACK TO SAVEPOINT` 判断顺序；后端检索运行的同键请求哈希、并发冲突回滚、搜索响应持久化及重放、无任务终态和 Provider 有界响应检查均通过门禁。生产数据库仍是 Provider/队列关闭、sandbox、0 ready；**真实检索没有启用或验收**，旧 TestFlight 43 不包含本轮变更。
- RN 统一长按菜单修复快速抬手无中间 move 时的最终命中，以及不可用动作错误确认。用户指出的旧版 3D 右边缘菜单确有两类偏差：把“今日穿搭”错误放进四个主动作，并将所有标签固定在动作圆下方，造成文字压住触点、整体扇出失衡。现已逐页复核蓝湖并按场景显式配置：聊天卡片为“分享 / 妙管家 / 复制 / 更多”，输入框为“换行 / 妙管家 / 粘贴 / 更多”，3D / OOTD 为“分享 / 妙管家 / 编辑 / 更多”；既有“今日穿搭”入口移入 3D 的“更多”菜单。四个动作均显示文字；动作圆与标签分别定位，中央及上下左右边缘各自采用设计中的标签方位和扇出比例。正式图标尚待设计交付，未宣称像素一致。
- 公开媒体按 ID 读取现在仍检查站主 active、show_posts/show_album、内容 public/friends、好友关系和 uploaded 状态。文件响应改为 `private, no-store`，不再让撤销权限后的新响应缓存一年。动态点赞/收藏在事务中检查站主状态与 show_posts，已知 ID 不再绕过主页开关。
- 后台 `users:write` 不再能创建/晋升管理员、改管理员权限或重置管理员密码；管理员目标的资料、状态、会话、Agent 授权等变更也要求 `*`。管理台相应禁用/隐藏无权动作；服务端校验是权威边界。旧的 Nginx 模板已有安全头，但现网并未启用。
- 新增 opt-in 隔离 PostgreSQL 授权测试。临时库 `miaoxun_qa_20260918_station_access_test` 由本轮创建，迁移后验收关闭展示、停用账号、撤销好友、删除内容及所有者例外；数据回滚后已删除测试库，没有碰生产或现有开发库。

## 验证与环境

- `./scripts/check-repository.sh` 此前全部通过：后端、Agents、Admin、avatar-web、媒体检索 Web 和 RN 格式/lint/类型/测试/构建。长按动作修正后再次通过 RN format、ESLint、TypeScript 和 Jest 全量门禁，当前为 28 suites、177 tests；新增覆盖三类四向动作契约、真实换行/粘贴/复制/分享行为，以及 320/393/768 宽度下中央、四边、四角的动作圆、完整标签和设计方位。后端 opt-in PostgreSQL 用例另行通过 1/1。backend、RN、admin 的生产依赖 `npm audit --omit=dev --audit-level=high` 均报告 0 vulnerabilities；不等于渗透测试。
- Xcode 26.6 在 iPhone 17 / iOS 26.5 模拟器构建 Release 成功。最新长按菜单包为 `/tmp/miaoxun-20260918-menu-qa/Build/Products/Release-iphonesimulator/MiaoxunRN.app`，内嵌 JS，API `https://8.153.167.11`，版本 `1.0`，CFBundleVersion 仍是 43；已覆盖安装并启动模拟器，保留原有登录数据。模拟器真实页面截图为 `/tmp/miaoxun-review-20260918-3d-center.png`、`/tmp/miaoxun-review-20260918-composer.png`、`/tmp/miaoxun-review-20260918-message-labels.png`：分别确认 3D 中央四项、靠底部输入框四项和聊天卡片“分享 / 妙管家 / 复制 / 更多”四项完整显示，没有旧版“今日穿搭”遮挡，动作文字与触点未重叠；`/tmp/miaoxun-review-20260918-3d-more.png` 另行确认“今日穿搭、3D Agent、AI伙伴、漫画日记、可被调用”仍保留在 3D 的“更多”菜单。没有上传 TestFlight 或改变线上 App。模拟器触感不能替代真实设备测试，Android 本轮未编译。
- 现网只读 `GET /api/ready` 为 200，数据库已迁移；`HEAD /admin/` 为 200，但响应未带仓库 Nginx 模板要求的安全头。生产仍是此前的 `app-integration-20260916-04` / TestFlight 43（据 9/16 发布记录，**本轮未重新 SSH 核实活动 symlink**）。本轮后端/管理台授权改动只在本地。
- 工作区分支 `codex/offsite-database-backups`，HEAD `e70270f`，大量未提交文件；发布脚本要求干净且已提交的来源，不能把当前工作区直接推到生产。没有 push、部署或 Archive。

## 未闭环与发布阻塞

1. 第一面仍显示关注/粉丝/获赞收藏，和蓝湖“粉丝/合作伙伴/综合评分”不一致。合作必须按已完成且有效的合作及评价计算，详细状态机、隐私、后台审核与验收在 `docs/reviews/2026-09-16-cooperation-lifecycle.md`；目前没有合作表/API/UI，不能用旧统计冒充。
2. 3D 初次进入模拟器先见浅色占位与加载标记，随后出现模型、无黑屏；当前模型在舞台中偏小，第一面整体排版仍未逐页还原。图片加载性能需连同服务端可撤销授权设计版本化缩略图，不能恢复长达一年的无验证缓存。旧客户端已缓存的字节无法靠新响应头远程抹除。
3. 生产 `/admin/` 安全头缺失、最新授权代码未部署，须复核实际 Nginx 配置、备份/回滚、源 revision 和完整发布顺序，不能以模板测试代替线上证据。后台权限的目标角色检查发生在更新前，极端并发角色变化的原子授权仍可进一步加固；发布前应审查此竞争边界。
4. 生产检索仍未可用：Provider/queue/lifecycle/ready、预算及真实素材同意是独立门槛；不得为了让 UI 看似可用自动打开付费开关、调高预算或批量索引。历史 unknown 预留也不能当已付款。
5. 真机长按/拖动/震感、Android 原生桥、四个边缘菜单的真实手指物理命中、管理台真实浏览器小屏、实际媒体撤销后的 HTTP 与 CDN/客户端缓存、完整设计稿差异都未签收。当前模拟器自动化可触发无障碍长按并验证中央和靠底部布局，但不能给无障碍动作传入任意触点坐标；左、右边缘均已与蓝湖逐项对照，并由组件手势测试从实际 `pageX/pageY` 走完 `onLongPress -> move -> release -> onSelect`，不能冒充真实手指边缘截图验收。下一版 TestFlight 必须有新构建号、明确提交源、后端兼容版本与发布证据；当前模拟器 43 并非线上新 43。

## 重要入口

- 当前交互/触觉：`MiaoxunRN/src/features/assist/AIAssistProvider.tsx`、`assistHaptics.ts`、`docs/reviews/2026-09-16-app-interaction-design.md`。
- 安全边界：`backend/src/station-library-repository.js`、`station-interaction-repository.js`、`routes/station-media-routes.js`、`routes/admin-routes.js`、`auth.js`；隔离 PG 测试 `backend/test/station-access-postgres.test.js`。
- 检索：`backend/src/media-retrieval-user-service.js`、`media-retrieval-run-event-repository.js`、`docs/reviews/2026-09-16-online-retrieval-readiness.md`。
- 发布事实：`docs/reviews/2026-09-16-production-and-testflight-43.md`、`docs/deployment.md`、`scripts/prepare-runtime-release.mjs`。

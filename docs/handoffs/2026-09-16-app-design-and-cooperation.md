# 妙讯接续：设计还原、合作评价与媒体闭环

日期：2026-09-16。本文件总结当前有效需求、已完成代码、验证证据和下一步入口。它不是生产发布证明，用户的新指令优先于本文。

后续状态已变更：以[检索与线上候选接续](2026-09-16-retrieval-online-candidate.md)为最新进度。
用户已将检索、正式线上联调、资料简化/定位恢复置于合作业务之前；QA 包/账号/服务已清理。
下文原验收和原计划保留为历史证据，不再代表当前运行状态或优先级。

## 接手状态

- 仓库 `/Users/gary/Desktop/myproject/marvelsChat`；分支 `codex/offsite-database-backups`；HEAD `e70270f`。大量未提交/未跟踪成果必须保留，没有提交、推送或生产部署。
- 正式 App 为 `MiaoxunRN`；后端 `backend`；管理后台 `admin`；伙伴工具 `avatar-web`、`media-retrieval-web`；公共合同 `shared`。
- 旧交接 [2026-09-15](2026-09-15-app-next-iteration.md) 保留仓库审查、备份和历史上下文；后续设计/交互决定以本文件和下列新报告为准，不恢复旧音乐模块或旧长按映射。
- 无适用 `AGENTS.md`。遵循 `docs/development-standards.md`。不清理 dirty tree，不创建缺失这些成果的旧 checkout。

## 用户持续要求与已确认决定

1. 面向真实上线，规范、可维护、可验收；不使用假统计、假成功、静默兼容或供应商回退掩盖缺失。正常空状态、明确失败及发布前后端顺序仍需要正确处理。
2. 蓝湖是当前视觉依据，逐项核对结构、文字、字号、颜色、资产和交互；不能把构建通过当视觉验收。
3. 新设计没有音乐。本轮只移除了第一面音乐入口，未无依据删除其他历史数据/权限字段。
4. 全局长按的“妙管家”统一进入已有管家会话并带入可编辑草稿，由用户确认发送；不是直接打开 3D 顾问，也不自动发送或自动启动付费任务。
5. 合作伙伴/综合评分已明确选择“按完成的合作与评价计算”。不得再问相同方向问题，也不能拿关注、AI 伙伴、点赞收藏数替代。
6. 用户要求后台随产品能力同步闭环；要主动指出业务缺口并补合适流程。使用必要技能和并行子任务节约时间/token，不反复全仓审计。
7. 原始图标资源可等设计后续交付；不要把截图裁图当正式生产图标。
8. 需要换新任务时写交接文档并提示；不要声称能测量自己的算力或保证上下文永不衰减。

## 本次完成：身份资料的完整切片

详情：[身份资料闭环](../reviews/2026-09-16-profile-identity.md)。

- 新迁移 `031_station_profile_identity.sql`：`headline`、`public_location`、`experience_years`、`languages`。年限 0–80 或 null；语言允许 zh/en/ja/ko/fr/de/es/pt/ru/ar，去重并有数据库约束。公开城市主动填写，与 GPS 社区/活动区域分开。
- 个人/管理员 schema strict；新字段省略保留，空文本/空数组/null 清除。现有位置编辑流程不传新字段，因此不会清除它们。后台编辑不再覆盖用户头像文字。
- 本人/公开主页/公开小站/社交列表/后台返回字段一致，新身份字段和简介一起遵守 `showBio`。设置文案已改为“展示职业资料与简介”。未自动加入模型提示词。
- App 编辑页支持签名、职业、城市、年限、语言，保存锁避免重复提交，失败保留输入；卡片展示真实标签，妙点与定位管理移到“其他”。
- PATCH 返回为保存成功边界；不用后续 bootstrap 成败决定保存结果。资料版本保护较早的 bootstrap 不覆盖新资料和昵称，设置同步只合并 stationConfig，保留会话隔离。
- 管理后台账号详情支持新字段编辑、清空、错误显示和保存期间禁用字段。
- 新客户端依赖完整新字段，必须 **迁移 → 新后端 → 验合同/ready → RN 与后台分发**。没有为旧生产接口填空的兼容处理，不能先发新 App 连旧后端。

主要入口：

- `MiaoxunRN/src/features/station/StationProfileEditScreen.tsx`、`StationProfileField.tsx`、`StationProfileIdentityFields.tsx`、`stationProfileIdentity.ts`
- `StationHeader.tsx`、`StationScreen.tsx`、`StationPanels.tsx`、`StationSocialPanel.tsx`
- `src/models/api.ts`、`services/api/profileApi.ts`、`features/session/useProfileActions.ts`、`useMiaoxunSession.ts`
- `backend/src/station-profile-repository.js`、`repository-mappers.js`、`social-repository.js`、`admin-repository.js`、`schemas.js`
- `admin/admin.js`、`admin-core.js`、`admin.css`

## 已有验证，不无故重复

- RN 全量 23 suites / 115 tests、TypeScript、ESLint、Prettier 检查通过；本轮末尾只格式化了已有 `App.tsx`/`stationContentApi.ts`，没有改逻辑。
- 后端 25 相关单测；真实隔离 PostgreSQL 18 重放 001–031 成功，第二次 0 applied / 31 unchanged。
- `backend/scripts/check-api-integration.js` 永久增加资料读写、清空/省略、非法值、DB CHECK、普通/只读/可写管理员权限、showBio/公开/社交隐私和账号删除验证，真实 API 测试通过。
- 后台 10 项测试、语法/lint、Vite build 通过。功能测试调用真实页面处理器，另外 Safari 实际操作也已验收。
- iOS Debug 独立 QA 包构建、安装成功，日志 `/tmp/miaoxun-profile-qa-final-build-20260916.log`。
- 实际 UI 闭环：App 增选日语保存 → 第一面立即显示三种语言 → SQL 确认 → Safari 后台读取相同字段 → 后台取消日语保存 → QA App 重启读取回中文/英语。其他页妙点明细可打开。
- App 编辑页上半部已视觉检查，底部选项/保存用辅助功能动作操作；模拟器滚动/拖动自动化不可靠，底部布局、小屏键盘和物理长按仍需真机。Debug 通用 “Open debugger to view warnings.” 尚未定位。

## 当前运行与测试隔离

- 正式包 `com.wangruoshi.miaoxun` 保持之前连接 `https://8.153.167.11` 的版本；本轮身份资料没有替换正式包。
- QA 包 `com.wangruoshi.miaoxun.identityqa`，同样显示名“妙讯”，连接 `http://127.0.0.1:4391`，仅包含隔离测试账号/数据。不能把 QA 的“3D 服务未启用”视为线上故障。它是本次验收时模拟器打开的包。
- iPhone 17 / iOS 26.5，UDID `7E81531F-02AE-40FC-98DA-A575CEC9930F`；接手时重新核对。
- QA PostgreSQL 数据目录 `/tmp/miaoxun-profile-pg.skpe2C/data`，本机 55436，数据库 `miaoxun_identity_migration_test`，本地测试角色 `miaoxun_test`（仅本机 trust）。测试服务使用专用 DATABASE_URL，不读取生产库作为测试库。
- QA API 4391、Vite admin `http://127.0.0.1:5176/admin/`，Vite 代理到 4391。末次对应 Node PID/工具 session 会变化，接手时核对端口，不依赖旧 PID。过程中一次工具环境中断停止了 Node 服务，已重启；不是数据库丢失。
- 本地开发 API 4390 的 `.env` 曾有迁移未齐；不要随手迁移未知数据库。QA 专用库已经有 31 个迁移。
- App Debug 和 Release 都读取包内 main.jsbundle，改 JS 需重新 build/install，Metro reload 不够。QA 构建命令使用独立 derivedData `/tmp/miaoxun-profile-qa-build`、`MIAOXUN_API_BASE_URL=http://127.0.0.1:4391` 和 `PRODUCT_BUNDLE_IDENTIFIER=com.wangruoshi.miaoxun.identityqa`。
- 没有生产迁移、后端部署、TestFlight 上传、付费模型/检索/建模调用。

## 伙伴代码和管家模型的事实

详细证据：[伙伴集成审计](../reviews/2026-09-16-partner-integration.md)。这些问题已核实，不必重新全面考古。

- 线上进程配置为 `deepseek-v4-flash` / `https://api.deepseek.com/chat/completions`，Key 已配；没有操作者审计，不能判断是谁切换，尤其不能断言伙伴配置。
- 按用户要求，本地旧 `glm-4.5-air` endpoint/model/key 已清掉；本地和 env 模板对齐 DeepSeek 名称/地址，开发 Key 留空。未把旧 Key 发给新提供商，也未复制生产 Key。生产没有改动。
- 管家经 RN API → 后端鉴权/Agent授权/上下文 → agent-runtime → 模型 → 消息与审计。无工具执行循环，长按草稿只是文字/引用，不能宣称模型已解析原图/视频/3D。
- Git 分支是开发版本线，不是运行服务。伙伴本来交付同仓 backend/迁移/Web，通过 Git 提交引入、保留作者来源，再做 RN API 适配符合结构；不能维护两份漂移核心或每次目录覆盖。伙伴分支后续不自动更新上线版本。
- 3D 本地引用 `origin/feat/avatar-3d-web-v1@5040e12`，引入提交 `ae387bc`，核心与 Web 引入时 diff 为空；当前 Wan/Tripo/照片质量/provider registry 四核心仍一致。主要生成流程、四视图确认、恢复、私有存储、移动 GLB 已接入，不等于整分支逐行原样使用/所有上线场景验收。完整后台任务成本失败治理仍待补齐。
- 媒体检索本地引用 `origin/feat/media-retrieval-product-integration@1365e69`，冻结产品合同 `9b89699`，已有 [RN handoff](../media-retrieval-product-handoff.md)、manifest、shared 合同。正式 RN UI 明确不在伙伴交付范围。
- 检索仅当前用户已上传私有图片/视频：同意→启用索引→状态事件→搜索→鉴权预览/视频时间点→重建/撤回。现 RN 无语义检索调用，相册建议是规则，不是模型检索。
- 生产只读核对：worker 正常但 DB provider/queue 为 false，lifecycle sandbox，0 ready segment、2 历史索引失败、无搜索记录；尚未诊断失败，未启用开关。
- 建议先在已有相册/素材场景做“找素材”工作区并接后台，不新增无设计依据顶层 Tab。管家自动 tool calling 不是已定义能力，要另加受控执行/权限/审计契约。

## 原有未提交成果与新版范围

- 根部 `AIAssistProvider` 通用长按动作，原内容保留一份；覆盖 3D/聊天/动态/日记/相册；“妙管家”草稿已统一。
- 可横向滑动 StationTabBar；第一面/生活访问后保留树；3D bridge ready 与首帧加载、暂停/恢复和背景改进。
- `030_station_post_interactions.sql` 及 API 完成真实动态点赞/收藏第一阶段，尚未生产迁移；后台概览有相关计数。
- 管家聊天头像已恢复 `messages/avatar-butler.png` 人物图；小站机器人素材保留待按入口核对，不能以名称相同就合并资源。
- 部分图片/缩略图、媒体加载工作有既有改动，接手先检查实际差异与报告，不宣称所有性能问题完成。
- [交互复核](../reviews/2026-09-16-app-interaction-design.md)、[资产清单](../app-design-assets.md)保留局部证据。页面仍有旧模块，不能据此宣布新版完成。

## 下一步按依赖推进

1. **合作与评价完整业务**：优先阅读[已确认的契约](../reviews/2026-09-16-cooperation-lifecycle.md)。双方接受/确认完成、完成后互评、私有条款、无评价 null、去重伙伴数、5 分制（设计显示 4.9）、申诉和后台审核。首版不引入支付。新迁移取下一空号，不早于032。实现数据库/API/通知/App/后台后再替换旧统计。不要再次问已确认的统计来源。
2. **第一面完整形象档案**：设计是 3D、日常自拍、视频形象，需要素材选择、封面/排序/可见性、预览与后台治理；现页面仍有旧日记/相册/AI伙伴排列。不能随意选某张相册图当自拍或复制设计样图作为用户数据。
3. **生活发布和媒体加载**：逐项验证发布→上传→失败保留→预览→展示/删除/后台审核；检查真实体积、缩略图、鉴权缓存和切换生命周期，依据瓶颈优化。
4. **语义检索工作区**：遵循伙伴合同完整接入同意/索引/搜索/结果/重建/撤回和管理开关，质量/延迟/成本验收后再申请具体发布/预算授权。
5. 逐页设计核对、图标替换、真机长按与 TestFlight，再按发布门禁部署。当前不是整项目上线就绪。

仍保留旧审查待办：小站历史分页；聊天历史分页/搜索边界；完整 Docker 镜像曾因外部 Debian 包源失败未完成运行验证；最终漫画只有分镜没有最终媒体；账号导出 API 未实现；社交列表旧 community/activityArea/aiId 的隐私口径不一致另待修复；后台无某权限时不能把未授权读到的空数据标成“无 Agent”。

## 蓝湖与工具

蓝湖项目 `906737d2-3f7b-4cbc-98ca-c725c4cca7f6`。第一面 `064bd189-53ad-4627-a8e9-05e953e3e2b3`；聊天 `ba1911df-7692-4bcf-92f5-5c117c46d4e3`；生活 `6bdef75b-bdc8-442d-9e5d-686838e191b9`。Chrome 有第一面标注页；分组称设计稿2.0但具体页面3.0，以画面内容为准。

浏览器连接器报 `unsupported Codex auth method: apikey`，原生 Chrome/Safari CUA 可用。必须每步取新 AX，用户切窗口时重新读取。模拟器原生输入快速连续时曾丢字，短输入/逐步核对后可完成；不能把工具输入丢字算 App 登录缺陷。Safari 资料表单滚动可靠，模拟器滚动不可靠。不要用其他脚本绕过 CUA 做界面交互。

已用 solution-architecture、ui-quality-check、database-delivery、application-security-delivery、fullstack-integration；子任务 backend/profile/admin/cooperation 审核已结束，没有需要继续等待的工作。

## 可直接交给下一任务的提示词

```text
继续妙讯项目，目录 /Users/gary/Desktop/myproject/marvelsChat。
先读 docs/handoffs/2026-09-16-app-design-and-cooperation.md，再核对当前 git status。
保留所有未提交成果，不切回缺失本地修改的版本，不重新审计已验证的伙伴来源。

本次优先实现第一面的合作与评分业务，按 docs/reviews/2026-09-16-cooperation-lifecycle.md 建立完整闭环。用户已确认以完成合作及评价计算，不要再次询问统计来源。必须包含双方确认、真实聚合、无评价状态、权限/并发/幂等、通知、App操作及后台审核，不能把旧计数字段改名。

先确认本地身份资料迁移031与新API的改动，新的客户端不能直接接旧生产后端。独立QA包与测试数据库详情见交接文档。生产迁移、部署、付费供应商启用和TestFlight是具体可审查版本完成后的独立发布动作；不要为测试写生产数据。

继续结合蓝湖逐页纠正设计与布局，并补齐数据编辑、选择、发布、异常和后台管理。音乐不属于本次新版，长按妙管家进入可编辑草稿且不自动发送。使用必要skills与有边界的并行子任务，运行有意义的验证，结果区分代码完成、UI已验、生产已发。
```

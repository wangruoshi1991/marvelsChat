# Agent授权与交互修复发布前预检

> **历史检查点。** 下文保留本日较早预检及当时BLOCKED结论。后续已在明确范围内完成精确本地提交、生产无迁移切换、既有漫画产品0.1.4发布和Build61正常Organizer上传；实际结果见[生产发布记录](2026-11-11-agent-lifecycle-production-release.md)与[当前交接](../handoffs/CURRENT.md)。Build61已由Apple接收，合规已由用户完成，代理随后执行外部测试审核提交动作，最终结果待核，后续TestFlight由用户自行处理，最终审核状态/测试组、安装及真机验收未核验，不改写本记录的原始状态或失败证据。

2026-11-11。用户在上一阶段明确的“部署修复、正确上架漫画产品、分发新客户端”之后要求继续下一步，本轮据此推进配套发布准备；不把该指示扩大为付费模型调用、替用户授权或任意生产数据修改。用户最初要求“未经要求不要提交、推送或部署”，本轮没有自行创建本地提交或推送。下面区分完成的预检、尚未执行的发布与需要明确确认的本地提交。

## 当前结论

发布状态为 **BLOCKED**。业务代码及测试已完成，正式runtime仍受clean committed源码门禁约束；正常后台/Apple页面当前无法稳定读取，尚未核对Apple最高已接收build。未生成正式新runtime、未变更服务、未发布漫画新产品、未归档或上传新客户端。

| 检查项 | 实际证据 | 状态 |
| --- | --- | --- |
| 候选范围 | 独立审查48个原有变更全部属于本次修复；本轮仅再加此预检记录并更新索引/交接，总49文件 | PASS，逐文件最终SHA另存 |
| API/数据库/权限合同 | 没有新迁移、配置项、依赖锁、Agent版本/scope或原生工程变更；使用既有精确产品授权合同 | PASS |
| 测试 | 本轮再次整仓退出0：RN99套1289项、Backend1136通过/376环境门控跳过、Agents57、Admin52、Avatar29、检索Web4；前阶段独立PG新增4项与生命周期10项零跳过 | PASS；PG门控跳过不算PG验收 |
| 来源 | 分支`codex/ui-agent-candidate-20261105`、base HEAD `b0860449c9e46edc1d647d32154cb4c86b41b89b`，保留全部未提交变更，index空 | BLOCKED：需明确允许精确范围本地提交 |
| 生产基线 | 正常SSH只读验证当前runtime、三服务、迁移ledger与checksum，见下节 | PASS，只读 |
| 漫画上架 | 上一阶段正常后台确认0.1.4 Release已发布但未绑定产品；本轮公开目录仍8项、无漫画 | 未执行新产品发布 |
| 新客户端 | Release设置实读1.0(58)，历史Build60归档存在；不可据此猜Apple最高build | BLOCKED：Apple页面与新归档未核验 |
| 真机/供应商 | 本轮无安装、触摸验收、用户consent或付费调用 | 未执行，不能当作通过 |

## 生产只读基线

11:06北京时间公开`health/ready`均200，`ready`为connected/migrationsCurrent；公开Agent目录仍8项，含UI-Agent0.1.0而无comic-diary。回执及响应SHA位于仓库外`/Users/gary/Library/Application Support/MiaoxunReleasePreparations/agent-lifecycle-20261111/public-readonly.json`。

11:08北京时间正常SSH检查实际`app`指向`comic-image-20261110-510df0d/runtime`，manifest `sourceHead=510df0de6946fc63d196be95a31ec64b4655f514`，298/298个运行文件哈希相符。API、AI Worker、检索Worker的真实cwd相同，均active、NRestarts=0；备份timer为active/waiting。PostgreSQL只读事务实际查到58项迁移，末项`058_comic_image_generation.sql`，全部checksum与当前runtime SQL匹配。回执`MiaoxunReleasePreparations/agent-lifecycle-20261111/production-readonly.json`，SHA256 `3a5d9a325e322f989fd3ca633755a06325b6531165330df3be9091f9dff52a65`。本轮没有读取env、供应商凭据、用户会话或私人内容，没有停写/重启/备份/改数据。

本地11月10日真实runtime与当前Backend比较为10个既有源码变更及1个新诊断模块；Admin为2个源码变更。迁移、Agent定义、shared、部署模板及锁文件均无增量。此次新包仍必须包含同一套完整API/双Worker和新Admin，不能只在线覆盖几个JS文件。

## 精确源码与正式制品门禁

独立范围审查的48文件记录位于`/tmp/miaoxun-candidate-scope-20261111-54t2qhdn/`；原业务源码摘要为`3292ba143ba6ee240e2b76e2d7ba06c1954a5e5807adcbce1891f11507a8e31e`。本轮只新增此预检文档及已有索引/交接更新，不改变业务源码。最终49文件逐项SHA与范围保存在`/Users/gary/Library/Application Support/MiaoxunReleasePreparations/agent-lifecycle-20261111/candidate-scope.md`、同名JSON与`candidate-SHA256SUMS`；这是待确认的提交范围，不是正式发布包。

`scripts/prepare-runtime-release.mjs:15`检查所有已跟踪和未跟踪变更，并明确拒绝：`Runtime releases require a clean, committed Git worktree.` 它只从HEAD的Git blob重建源码并重新锁文件安装/构建Admin与avatar-web；不会打包当前dirty内容。不能复制dirty文件至生产、建立临时提交绕过用户限制，或削弱门禁。

需要明确允许的动作是：只把最终49文件清单中的本次修复、测试和证据文档创建一个本地提交；不推送，不纳入迁移/配置/原生/锁文件。确认后先逐项核对SHA与base HEAD、重验工作区和index，再按精确路径暂存/提交。任何额外文件或业务内容漂移都先停止核对。

## 配套发布顺序

1. **源码与制品。** 精确范围本地提交并达到clean后，使用现有打包工具生成新唯一release id；验证manifest的sourceHead/sourceTree、完整文件集合、每项SHA、归档SHA、058迁移与新诊断模块、Admin新bundle。保存上一运行制品和受限配置，不改任何供应商或数据库连接配置。
2. **生产切换。** 当前无新迁移，但仍在执行前重新核对非终态任务、服务/备份和实际runtime。使用仅覆盖妙讯location的维护方案，保留共享站点，排空并停API/双Worker；保留新停写恢复点并验证可恢复，再切换同源runtime。无新SQL则不重放迁移；检查58账本一致、权限/已存在数据和Worker心跳后开放。不得直接复用带056→058迁移及媒体凭据合并逻辑的11月10日旧执行器。具体维护候选在正式包生成后绑定其路径和哈希，不执行旧日期脚本。
3. **回滚边界。** 此次schema不变，问题发生且尚未开放写入时可按真实停写快照和旧制品恢复；开放用户新consent或产品发布后必须先评估新数据/权限语义，优先前向修复，不能仅恢复旧数据库或切旧授权代码。暂停新漫画产品会影响已同意该版本的执行，不是删除记录或替用户撤权。
4. **漫画产品。** 经正常后台选择既有`comic-diary`产品的“创建新版本”，版本拟为`0.1.4`（执行时确认无同号版本），精确选择已发布/ready的comic-diary0.1.4 Release，保持原平台和已审身份，核对完整七项scope：`messages:read`、`diary:read`、`diary:write`、`album:read`、`station:read`、`station:write`、`media:image:generate`。正常保存draft→详情复核→审核→发布，逐步记录真实状态与versionId/hash。刷新新目录诊断及公开`/api/agents`确认可见，不能只信toast。不新建重复产品key，不改旧consent，不触发模型。
5. **发行客户端。** 从同一明确提交冻结RN输入；先通过正常App Store Connect核对最高已接收build，再选择其加1。用`xcodebuild -workspace MiaoxunRN/ios/MiaoxunRN.xcworkspace -scheme MiaoxunRN -configuration Release -destination 'generic/platform=iOS' -derivedDataPath <新目录> -archivePath <新路径> CURRENT_PROJECT_VERSION=<已核实编号> MIAOXUN_API_BASE_URL=https://8.153.167.11 archive`，可通过参数递增而不改磁盘工程58。验证输入前后SHA、实际Bundle/API/build、签名与App/三框架dSYM后，沿正常Xcode Organizer上传并核验Apple处理和测试组。Debug Simulator产物不能上传为TestFlight。
6. **用户与验收。** 用户本人在新客户端明确同意图片scope；已安装版本、Apple分发、授权和功能验收分别留证。先核对UI-Agent添加错误及原位同意，再检查二楼/妙页真实触控。漫画真实模型调用另行明确次数/格数与环境，本轮不含付费验收。

## 客户端发行环境及来源纠偏

本轮`showBuildSettings`实读Release为1.0(58)、正式Bundle/API、Automatic、Apple Development、Team R8K5DUTWB6、iOS15.1与dwarf-with-dsym；Xcode26.6。Pods lock与Manifest一致，相关三个锁文件无差异。`bundle check`缺8个锁定gems，本轮没有安装依赖；目前只有Development身份，不能据此否定既有Organizer账号上传路径，也不能宣称CLI分发签名就绪。

历史Build60严格签名通过，App及React/ReactNativeDependencies/Hermes dSYM UUID全部匹配。旧`archive-verification.json`的sourceHead标签是205218e，但484项冻结输入实际全部精确匹配后续510df0d，不能以旧标签推断来源。新归档必须记录本次明确提交和逐输入SHA。历史CLI export-only两次退出70（No Accounts/缺Distribution），Build60实际成功路径是Xcode Organizer；沿用正常账号流程，不提取token。

本轮Chrome原生首次能读现有标签库存，但后续两次绑定都30秒超时；重新绑定现有TestFlight标签仍报`Cannot read properties of undefined (reading 'timeoutMs')`。尚未读取本轮后台新状态、Apple最高build或分组。不绕过后台登录、不调用受保护接口伪造操作；此限制是发布的独立操作阻塞，不能以只读SSH或历史Build60代替。

## 本轮最终检查

`MIAOXUN_DOTENV_ENABLED=false ./scripts/check-repository.sh`退出0，日志为`/Users/gary/Library/Application Support/MiaoxunReleasePreparations/agent-lifecycle-20261111/repository-check.log`：类型/lint/格式、源码和打包器检查、全部工作区测试及Web构建通过。Backend1136通过/376环境门控跳过；Agents57、Admin52、Avatar Web29、检索Web4、RN99套1289项通过。没有将打包器测试称为生成正式候选制品，没有将门控跳过称为数据库验收。本轮只有文档增量，不重跑已完成的隔离PG和Simulator build，也不将旧QA画面或构建成功称为本次真机验收。保留既有`act`和Web大chunk提示，未放宽门禁。

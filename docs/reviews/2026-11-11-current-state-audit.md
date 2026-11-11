# 2026-11-11 当前状态复核：漫画客户端、设备与隔离 PostgreSQL

本轮读取指定工作树的 AGENTS、README、文档索引和 CURRENT，再检查当前代码与运行条件。起始工作树干净，分支 `codex/ui-agent-candidate-20261105`。历史部署、上传、付费调用或后台发布记录不作为本轮操作授权。本文只记录本轮实际完成的客户端、制品、设备与隔离数据库核查；线上目录和后台诊断由同轮其他记录补充。

## 漫画 RN 链路

- `StationComicDiaryPanel` 已通过现有 API 保存文字分镜，`StationComicRenderPanel` 独立确认已保存分镜的格数后才提交图片任务；保存/重新整理文字分镜不会自动调用图片生成。
- `useAgentAccessConfirmation` 从当前目录取权限和 `productVersionId`，展示全部范围并等待用户明确确认；`agentPresentation` 已识别独立 `media:image:generate`。产品上架、App 安装和已拥有旧版本都不能代替用户同意。
- `comicRenderApi` 要求 bootstrap 声明 `comicRenders:1`，校验任务/日记身份、返回结构及取消 revision。客户端保留同一次未知提交的幂等键，不自动重试图片模型请求；排队取消、逐格状态、部分成功、未知结果、真实错误均已有实现。
- 已保存图片使用 `/api/station/media-assets/:id/file` 和当前 Bearer 读取。后台/账号变化会清空面板并拒绝迟到响应；活动任务的授权读取失败会清空图片并停止自动读取。终态任务停止进度轮询，本轮没有因猜测扩大轮询或改写已实现行为。
- 本轮没有修改漫画 RN 业务代码、替用户授权、创建生产任务或调用真实图片/文字供应商。API/组件测试使用显式 fixture，只证明合同与交互回归，不是 App 真实生图验收。

实际执行：

```sh
cd MiaoxunRN
npm test -- --runInBand comicRenderPanel.test.tsx comicRenderContract.test.ts agentAccessConfirmation.test.tsx agentProductAccess.test.ts
```

退出 0，4 套、89 项通过，0 失败。

## Build60 与设备只读证据

本机归档仍存在：`/Users/gary/Library/Developer/Xcode/Archives/2026-11-10/MiaoxunRN-build60-symbols.xcarchive`。通过 Python `plistlib` 读取 App 内 `Info.plist`，通过 `hashlib.sha256` 读取内嵌 `main.jsbundle`：

| 字段 | 本轮实读 |
| --- | --- |
| Bundle | `com.wangruoshi.miaoxun` |
| 版本 | `1.0 (60)` |
| API | `https://8.153.167.11` |
| JS SHA-256 | `b0a1234942a1c2c02f0927c9a8095a2787ea04020aa687a5cd31dccf12814672` |

工作树 `project.pbxproj` 的磁盘构建号仍为 58；既有发布记录明确 Build60 使用归档构建参数覆盖。不能因此声称归档为 58，也不应自动修改工程构建号。

本轮执行 `xcrun simctl list devices available -j`：iPhone 17 / iOS 26.5 为 Booted。执行 `xcrun devicectl list devices` 后，仅针对可用已配对 iPhone 14 Pro 查询：

```sh
xcrun devicectl device info apps --device <本轮已配对设备标识> \
  --bundle-id com.wangruoshi.miaoxun --include-default-apps --columns '*' --timeout 20
```

退出 0，返回“妙讯”、版本 `1.0`、Bundle Version `60`、`Developer App=true`。这证明该设备已安装构建号 60，不证明安装来源为 TestFlight、不证明 Apple 处理/测试组分发状态，也不证明漫画、手势或语音已真机验收。本轮没有启动、安装、覆盖或读取设备用户数据。

脱敏汇总回执：`/private/var/folders/k2/bnl6hg557j761ylt5szlbbjm0000gn/T/miaoxun-audit-pg-20261111-uhearlm1/rn-device-archive-receipt.json`。回执不包含设备名称、标识、安装容器路径、账号或凭据。

## 全新 PostgreSQL 验证

采用本机 Homebrew PostgreSQL **18.4**，新建 data 目录和独立实例，仅监听 `127.0.0.1:55461`。每套测试使用不同空数据库并分别执行 001–058；严格按文件顺序运行，没有与其他测试共用队列或数据库。启动器只传入最小显式环境，`MIAOXUN_DOTENV_ENABLED=false`，不读取仓库 `.env`，所有真实供应商调用关闭、无供应商凭据。

运行前检查了测试门控和 fixture：漫画两套及发布生命周期只接受 loopback / `*_migration_test`；`agent-publishing-fixture` 的清理还在数据库查询中复核实际地址和库名。本轮没有连接共享开发库或生产库。

| 独立数据库 | 测试门控与文件 | 本轮结果 |
| --- | --- | --- |
| `audit_comic_render_migration_test` | `RUN_COMIC_RENDER_INTEGRATION=1`，`comic-render-repository.integration.test.js` | 14/14，0 跳过 |
| `audit_comic_access_migration_test` | `RUN_COMIC_DIARY_ACCESS_INTEGRATION=1`，`comic-diary-access.integration.test.js` | 17/17，0 跳过 |
| `audit_publishing_lifecycle_migration_test` | `RUN_PUBLISHING_LIFECYCLE_POSTGRES=1`，`publishing-lifecycle-postgres.test.js` | 10/10，0 跳过 |

共 **41 项通过，0 失败、0 跳过**。每库迁移均为 `58 applied, 0 unchanged`。覆盖真实 PostgreSQL 的 release/product 生命周期、精确 consent、读取/派发/交付撤权、显式素材隔离、失败回滚、私有产物归属、队列恢复、未知结果和并发取消。模型及对象存储适配器在这些测试中为显式内存 fixture，因此没有将其称为真实供应商或 OSS 成图通过。

执行模式如下，`DATABASE_URL` 只指向本轮新建端口和对应数据库：

```sh
MIAOXUN_DOTENV_ENABLED=false NODE_ENV=test DEFAULT_ADMIN_ENABLED=false \
  DATABASE_URL=postgresql://miaoxun_audit@127.0.0.1:55461/<本套数据库> \
  node scripts/db-migrate.js

# 三套依次运行；各套只设置自己的 RUN_* 门控
RUN_COMIC_RENDER_INTEGRATION=1 node --test test/comic-render-repository.integration.test.js
RUN_COMIC_DIARY_ACCESS_INTEGRATION=1 node --test test/comic-diary-access.integration.test.js
RUN_PUBLISHING_LIFECYCLE_POSTGRES=1 node --test test/publishing-lifecycle-postgres.test.js
```

证据目录：`/private/var/folders/k2/bnl6hg557j761ylt5szlbbjm0000gn/T/miaoxun-audit-pg-20261111-uhearlm1/`，保留 `run.py`、`receipt.json`、各套 `*_migrate.log`、`*_test.log`、`*_state.log` 与 `stop.log`。漫画两库测试结束均为 users/entitlements/tasks = 0/0/0；生命周期套件原设计保留其合成记录（users=1、entitlements=3、tasks=0），只存在已停止的本轮 data 中，没有写入业务环境。

首次启动因 macOS 临时目录过长导致 Unix socket 超过 103 字节，在任何测试/业务写入前退出；日志证明该进程已关闭。改用本轮独立短 socket 目录 `/tmp/mxpg-uhearlm1` 后重启成功。最终 `pg_ctl -D <本轮data> -m fast -w stop` 退出 0、`server stopped`，没有停止其他 PostgreSQL 实例。

## 新增目录诊断的真实 SQL 验证

新增 `backend/test/agent-catalog-diagnostics-postgres.test.js`，门控 `RUN_AGENT_CATALOG_DIAGNOSTICS_POSTGRES=1`，测试同时核对 URL 和数据库实际地址/库名，只接受 loopback 与 `*_migration_test`。仅注入合成源码注册列表；诊断使用真实 `listRegisteredAgentsWithCatalogue(..., {sync:false})`、公开产品投影、精确版本 `getProduct` 和 PostgreSQL 查询，不用模拟 SQL 结果证明可见性。

本轮精确重启上述独立 PG，在第四个全新数据库 `audit_catalog_diagnostics_migration_test` 迁移 58/58 后执行，**5/5 通过，0 失败、0 跳过**：

- release 已发布但无产品，`visible=false` 并返回 `AGENT_PRODUCT_UNAVAILABLE`。
- 精确绑定当前 release 的产品发布后，`visible=true`、所选 release 可见，仍没有自动创建用户授权。
- 用户显式测试授权后，诊断保留其授权与审计历史。
- 源码和数据库 registry 升级至 0.1.5 后，0.1.4 旧 release/product 不可见，分别返回 `SOURCE_VERSION_STALE` 与 `REGISTRY_VERSION_STALE`，不升级或重写原 consent。

每次诊断前后对 registry/catalog、release/product/依赖及状态历史、用户/授权/会话和 usage 审计共 14 张表进行完整 JSON 行快照比较，逐次相同。另提供一个尚无数据库记录的源码 Agent，确保只读诊断不会因 registry/catalog 同步而插入它。测试清理后 users/entitlements/tasks 为 0/0/0。

```sh
MIAOXUN_DOTENV_ENABLED=false NODE_ENV=test DEFAULT_ADMIN_ENABLED=false \
  DATABASE_URL=postgresql://miaoxun_audit@127.0.0.1:55461/audit_catalog_diagnostics_migration_test \
  RUN_AGENT_CATALOG_DIAGNOSTICS_POSTGRES=1 \
  node --test test/agent-catalog-diagnostics-postgres.test.js
```

证据同目录 `diagnostics-receipt.json`、`run-diagnostics.py`、`catalog_diagnostics_{migrate,test,state}.log` 和 `diagnostics_stop.log`。最终再次停止本轮 PG，退出 0；新文件 ESLint 和 `git diff --check` 通过。无门控的普通仓库测试会明确跳过该套，跳过不计作数据库通过。结合上一节，本轮四个新库共 **46 项 PostgreSQL 测试通过，0 跳过**。

## 漫画版本升级后的明确同意与精确撤销

继续核对真实发布链路后，本轮补齐客户端的原位重新同意入口：当前产品可用但既有 Agent 授权范围与声明不一致时，展示“重新同意”，不再要求先移除、重新添加。确认仍展示当前产品名称、版本和完整权限，仅点按确认后调用既有授权 API；产品暂停、身份/合同失配和无法识别的权限继续明确拒绝。

另补齐运行版本变化但权限集不变的情况：共享 `resolveAgentProductAccess` 在核验当前产品合同后，若同产品旧授权已不可用/需重新同意且没有任何有效 enabled 授权，则返回 `reconsent_required`，Panel 与确认 hook 同时提供当前版本明确同意入口。只改身份且旧版本授权仍有效时继续可用，即便账本还有更早失效记录也不要求再次同意；已 disabled 的旧授权不强迫重新同意。该判断不会自行写入或扩大权限。

`agentAccess.ts` 提供共享 `selectAgentProduct`，目录状态、添加/重新同意弹窗和 session 提交使用相同选择：只有一个依赖产品时取该产品；多产品时仅在恰有一个精确版本的有效 entitlement 时选取，否则不猜测。session 的确认快照现包含 entitlement，防止查看期间授权变化后提交旧选择。撤销使用独立 `resolveAgentRemovalProduct`，hook 与 session 都从既有授权选择待撤版本：优先唯一 enabled，之后只接受唯一非 disabled 的历史授权；弹窗显示真实授权的版本及范围，传递其 `productVersionId`。因此公开产品已升 v2、用户仅同意 v1 时会撤 v1，不误发尚未同意的 v2；新 enabled 与旧 unavailable 并存时选择新有效授权。多个实际候选或目录无法映射既有授权均明确拒绝，不猜 key、不批量撤销；空授权账本沿用原有无版本 legacy 服务端唯一映射校验。

后端原问题是投影合并所有数据库中 stored-enabled 的历史授权；旧产品已因源码升级失效，但旧身份仍参与合并，导致当前版本明确同意触发 `AGENT_PRODUCT_IDENTITY_CONFLICT`。现仅将当前可执行且 contract/scope 精确匹配的产品授权投影到 `user_agents`；旧授权账本保留，不自动扩权、不复活历史身份。精确版本撤销复用既有 API 字段和 entitlement 历史，跨多产品且未指定版本时仍拒绝歧义。实现细节另见当日发布/重新授权记录。

验证证据：

- RN 重新同意/多产品/目录/session/小站管理四套最终 **114/114** 通过，0 跳过；日志 `/tmp/miaoxun-agent-same-scope-reconsent-20261111-green.log`。精确撤销和历史版本两轮回归均先 RED：前者证明确认和提交原先丢失版本，后者真实复现公开 v2/授权 v1 误选及多授权未拒绝；修复后 GREEN。最后新增同权限版本升级回归先 RED（3失败、58通过），最小修复共享 resolver 后 GREEN；同时覆盖有效旧授权和 disabled 历史不强迫再次同意。没有模型或真实后台数据替代测试。
- RN 修改文件 Prettier、ESLint（0 warning）和 TypeScript 均通过；最后增量日志 `/tmp/miaoxun-agent-same-scope-reconsent-20261111-{typecheck,lint}.log`，此前广泛目标文件日志 `/tmp/miaoxun-agent-consent-20261111-{typecheck,lint}-final.log`。整仓最终结果由当前交接统一记录。
- 在本轮独立 PG 的另外两个**全新**数据库分别迁移 **58/58**，顺序运行 `RUN_AGENT_PRODUCT_RECONSENT_POSTGRES=1` 新用例 **4/4** 和 `RUN_PUBLISHING_LIFECYCLE_POSTGRES=1` 回归 **10/10**，均0失败、0跳过。覆盖发布不改旧 consent、明确同意新产品保留原会话、旧身份不阻塞授权、精确撤销不复活旧范围，以及既有产品生命周期/竞争保护。新增用例最初真实复现身份冲突；一次修复后尝试仅因测试对归一化 scope 数组顺序作了错误假设失败，改为比较权限集合后重新在全新库运行通过，不将失败尝试算作验收。
- 证据同前述本轮PG目录：`reconsent-final-receipt.json`、`run-reconsent-final.py`、`product_reconsent_final_*`、`publishing_lifecycle_final_*`。数据库分别为 `audit_product_reconsent_final_migration_test` 与 `audit_publishing_lifecycle_final_migration_test`；测试合成用户/授权留在本轮停止的隔离data中，任务均0，未连接生产或共享开发库；`reconsent_final_stop.log` 确认本轮PG已停止。

本节14项包含10项既有生命周期回归，不将重复运行当作新增独立能力。以上证明本地代码与隔离数据库链路，尚未部署到线上或包含在已上传 Build60，也不替代用户本人对图片生成权限的同意。

## 仍待完成的验收

- 漫画是否在线上目录可见，要以公开 `/api/agents`、当前产品目录和正常认证后台诊断为准；客户端代码和上述 fixture 不证明生产已上架。
- 用户本人需在 App 中同意当前漫画产品及独立图片生成权限；本轮没有替代授权。
- App 内真实分镜→明确生成→队列进度→两张私图→前后台恢复，仍需在已核验可用的产品/用户授权和另行允许的供应商调用范围下验收。
- TestFlight 分发状态、实体设备手势/语音/相册附件和多卡连续滚动仍须分别取得实际证据。Build60 已安装这一事实不能扩展成上述验收结论。

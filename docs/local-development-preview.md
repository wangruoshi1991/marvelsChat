# 固定 iPhone 17 与正式环境联调

本文只描述日常构建和联调方法；客户端合同、服务器版本、TestFlight 和设备验收以[当前交接](handoffs/CURRENT.md)为准。旧 Build/迁移数字只属于历史证据，不构成当前配套。

日常界面开发统一使用现有 iPhone 17 Simulator 上的 **妙讯**，Bundle ID 为 `com.wangruoshi.miaoxun`，连接 `https://8.153.167.11`；固定设备 UDID 为 `7E81531F-02AE-40FC-98DA-A575CEC9930F`。不另建 QA 设备或日常开发服务。工作区构建配置、实际安装、TestFlight及后端运行状态分别核对，统一以[当前交接](handoffs/CURRENT.md)为准，不能凭同一Build号认定来源一致。

主工作区是日常编辑和构建入口，缓存按仓库绝对路径隔离。已归档工作树的制品与构建记录保留为证据，不作为另一套日常源码入口；实际安装来源、缓存保留与设备验收边界见当前交接。

## 仅构建

需要先核对客户端制品、暂不安装时，在仓库根目录执行官方入口：

```sh
node scripts/miaoxun-development.mjs ios --build-only
```

仅构建模式沿用同一固定iPhone17、正式Bundle、正式HTTPS、Debug配置与 `DerivedData`，完成xcodebuild、来源一致性检查、产品身份校验、严格签名验证及逐文件摘要。它不会调用Simulator的boot、bootstatus、install、launch或打开Simulator窗口，也不创建另一台设备或另一份App。无需复制构建脚本或临时删除安装步骤。

构建前必须能只读取得现有正式App的容器路径及 `Info.plist`、`main.jsbundle` 摘要；不能读取时明确失败，不通过启动模拟器或把失败当“未安装”继续。构建后再次记录 `officialBefore/officialAfter` 并比较上述元数据与app/data路径，一旦改变则构建验证失败。编译、来源、签名或元数据检查失败会保留构建日志与失败证据；脚本不读取账号数据或Keychain，也不尝试恢复或修改已安装App。

仅构建模式记录 `mode: build-only`、`installed: false`、`launched: false` 与 `officialUnchanged`。构建产品仍在共享DerivedData中，后续构建可能覆盖；需要长期恢复制品时另按已授权的发布准备流程保存归档。`--build-only` 只支持跟在 `ios` 后；未知、重复或用于其他命令的参数均在操作前明确拒绝。

## 日常构建与更新

确认客户端与正式API合同、Agent版本配套后，在仓库根目录执行：

```sh
node scripts/miaoxun-development.mjs ios
```

该命令检查正式 API readiness，使用固定 iPhone 17 构建、签名并原位更新正式 Bundle，核对名称、API origin、签名和安装后的 JS 摘要。原位安装保留已有 App 数据；Simulator可能重定位容器路径，路径变化不等于数据丢失。凭据继续由原 App Keychain 管理，脚本不读取或搬运登录 token。无需先启动本机 API、数据库或 Worker，也不安装第二个日常 App。

两种模式都需要本机Node、Xcode和已安装的项目依赖。App使用构建时内嵌的 `main.jsbundle`，修改移动端代码后必须重新构建并在配套后安装；重启Simulator或Metro不会更新已安装代码。源码在构建期间变化会判定失败，应待源码修改完成后重跑。

构建证据位于 `~/Library/Application Support/MiaoxunDevelopment/<仓库绝对路径摘要>/builds/<时间>/`。成功构建包含 `build.json`、逐文件产品摘要、签名entitlement与日志；失败时保留已产生证据。记录模式/状态、构建前后源码摘要、提交/分支、设备、Bundle、Build、API origin、JS/Info/执行文件/产品摘要及正式App前后身份。单凭Build号不能证明合同或来源配套。历史 `build.json` 不随文档变化改写；Simulator结果不代替真机、Android或TestFlight验收。

## 真实账号与 AI 合同

正式环境复用既有正式账号，管理操作与一般页面查看可使用既有管理员；普通权限、授权和跨账号边界必须复用相应普通身份。管理员通过不等于普通用户通过。不为每轮 UI 检查新建账号，不把本地账号、token或数据库内容迁入正式环境。凭据和私人内容不写入仓库、日志或交接文档。

客户端在当前登录会话的 bootstrap 中确认 `aiTasks:1/siteDocuments:2/agentWorkspaces:6` 后才发送对应 AI 请求；服务端独立核对请求合同、账号、Agent 权限、云端同意和内容版本。协议缺失或不匹配明确报错，不按页面切换后端，也不调用旧接口兜底。提交结果账本区分已接受、明确拒绝与结果未知；相册任务异步执行，建站私有草稿完整预览后由用户确认保存。完整约定见[统一 AI 交互](ai-interaction-system.md)。

`/api/ready` 200只说明服务器自身数据库与迁移检查通过，不证明它支持当前客户端合同、Worker在线或模型质量达标。联调还需核对实际release、合同、Worker心跳与任务状态。不支持当前合同的旧客户端应更新到已核实配套的版本；本机原位安装与TestFlight分发是独立操作。

正式连接中的写入会影响真实数据，云端调用使用服务器配置。生产部署、付费供应商验收和TestFlight上传按各自已确认范围执行，构建命令不隐含这些操作。历史038停写恢复证据见[Build46发布记录](reviews/2026-10-13-testflight-46.md)，当前配套与恢复证据见[当前交接](handoffs/CURRENT.md)。

## 显式后端隔离验证

迁移、权限、失败恢复或自动化测试需要本地后端时，才使用以下命令；它们不属于日常 App 启动步骤：

```sh
node scripts/miaoxun-development.mjs verify-local-start
node scripts/miaoxun-development.mjs status
node scripts/miaoxun-development.mjs verify-local-restart
node scripts/miaoxun-development.mjs stop
```

`verify-local-start` 创建或复用已有专用 PostgreSQL 集群与 `miaoxun_development` 数据库，执行真实迁移，再启动 API和AI Task Worker。只监听本机 API4391、PostgreSQL55441；端口已被占用时明确失败，不替换其他服务。数据库使用本机 trust认证，不适用于共享主机或网络部署。后端验证结束后执行 `stop`，保留已有固定账号、数据库和媒体。

`status` 返回的是这套隔离验证进程的状态，不是正式服务器状态。其 `sourceMatchesCheckout` 使用全仓文件摘要，包含文档和配置样例；仅文档变化也会不匹配。需要验证当前后端代码时执行 `verify-local-restart`；该状态不会阻止日常正式环境的 `ios` 构建。

已有本地状态仍位于同一受限 `MiaoxunDevelopment` 目录，包含 `postgres/`、`media/`、`logs/`、`runtime.env` 和进程归属记录。停止脚本核对 PID启动时间、命令及 PostgreSQL `data_directory`，归属不符则保留进程并报错。若异常退出遗留 `operation.lock`，先核对其中进程已退出，再清除陈旧锁；不删除数据库目录。

隔离启动器只继承操作系统基础变量，跳过 `backend/.env`，不继承 Node preload、供应商密钥或其他数据库 URL。云供应商配置为空，检索与3D供应商关闭，不启动媒体检索Worker；本地API/AI Worker的outbound fetch以 `DEVELOPMENT_PROVIDER_CALLS_DISABLED` 明确失败。不要复制生产env来开启本机调用，也不要把此环境的ready200当作云能力验收。

自动创建身份的测试仅在一次性隔离测试库运行，并在 `finally` 清理账号、关联内容和临时凭据；中断后核对补清理。已有持久库固定身份不因测试结束被删除。跨设备业务联调应始终核对双方App、源码与API origin一致，不能混用本地和正式数据。

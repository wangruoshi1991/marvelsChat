# 2026-11-10 漫画配套发布记录

用户要求完成漫画接入后部署并更新 TestFlight；最新明确先部署和客户端发布，生产后台登录及漫画 release/product 上架稍后处理。本记录按实际证据更新，不绕过认证或扩大用户授权。

## 正式链路隔离验收

代码入口为 `backend/scripts/comic-render-live-e2e.js`，安全测试 `backend/test/comic-render-live-e2e.test.js` 9/9 通过。脚本只接收显式 0600 配置、loopback 且以 `_migration_test` 结尾的空用户数据库，输出目录必须新建；不会连接生产数据库或写入生产用户。

在独立 PG18/55460 的第二个空数据库执行 001–058 后，正常 API/正式 AI Worker 完成：Admin 初始化和登录、Agent release/product 发布、测试用户注册并明确同意权限、真实文字分镜、提交并轮询漫画任务、两次真实图片调用、私有 OSS 保存、登录用户图片读取、其他用户 404 和未登录 401。任务最终 2/2 成功、0 failed、0 unknown；清理回执 complete=true。

回执与两幅实际成图保存在仓库外 `MiaoxunReleasePreparations/comic-image-20261110/isolated-live-e2e-02/`。图像均 1024×1024 WebP；第一幅 209302 字节、SHA256 `dbfa207765571774c2f2bd591130e14e4447e7c3aa9bfc27b02e56ae4f11d81a`，第二幅 201780 字节、SHA256 `c20ac44b26c193cb093052f94517abdf6c0c1ad7fb106270de03220982ae8472`。目视同一橘猫蓝围巾从播种到向日葵开花，符合虚构验收故事。首轮 harness 在模型派发前因产品 identity 不匹配失败，清理时漏 DELETE 确认，修正并新增脱敏诊断后独立数据库重跑通过；不将首轮失败算成成功。

## 仓库与制品门禁

`MIAOXUN_DOTENV_ENABLED=false ./scripts/check-repository.sh` 退出 0，日志 `/tmp/miaoxun-comic-release-20261110-check.log`：Backend 1124 通过/374 门控跳过，Agents 57、Admin 49、Avatar Web 29、媒体检索 Web 4、RN 99 套1261项通过；类型、lint、格式和 Web 构建通过。门控跳过不算 PostgreSQL 集成通过；漫画真实队列验收另列如上，原实现阶段隔离 PG43 项见对应实现记录。

正式 runtime 必须来自干净、已提交 Git，使用 `scripts/prepare-runtime-release.mjs` 并核验 sourceHead、sourceTree、所有 manifest 文件哈希。运行凭据始终仓库外保存，独立图片配置仅合并六项 `MEDIA_GENERATION_*`，不会替换文字、检索或 3D 凭据。

## 生产预检与维护计划

生产基线为 `cebc1e6`/56迁移。本轮已部署提交 `510df0de6946fc63d196be95a31ec64b4655f514` 的 runtime `comic-image-20261110-510df0d`，完成057/058后为58迁移。停写备份 `/opt/projects/marvels-chat/backups/comic-release-20261110-510df0d-retry1/` 的恢复验证状态为 passed，隔离PG18已停止；停写 dump 为945632字节，隔离恢复后redump为947376字节。恢复副本先成功演练057/058，再迁移生产。

维护工具只针对妙讯12个Nginx location，保留共享 `/suanming` 和 Hello Rose 站点；默认只读计划，显式 execute 才改变状态。第一次执行在暂停服务前因Nginx reload瞬时状态检查失败；当时API/Worker仍active、迁移仍56，原Nginx配置和权限按哈希恢复，公网恢复200。将HTTP检查改为容忍7秒短暂传播并增加回归后第二次执行通过。该短暂维护及恢复记录留在首个 `-execution` 目录。

正式切换期间，维护前/排空后均检查无非终态任务；停止 API、AI Worker、检索 Worker 和备份 timer，完成停写备份、隔离恢复和候选迁移演练，再应用生产057/058，逐表核对74张原业务表数据摘要及原数据库权限/对象元数据。三个服务切换到同一 runtime 并 ready 后，核实 Worker 心跳 `agent_message`、`site_draft`、`comic_render`，再恢复公网与备份 timer。现有后端、AI Worker、媒体检索 Worker、数据库备份 timer 均active；公网 API health/ready 与 Admin 为200；Hello Rose首页200、共享 `/suanming/` 仍保留其原认证响应。迁移后不自动回退到旧56代码。

部署执行状态为完成。生产业务数据只做摘要核对，未创建生产漫画任务、未调用生产图片模型，也未写入生产漫画产物。

## Build60

归档实际 `1.0 (60)`、`com.wangruoshi.miaoxun`、正式 HTTPS API；Xcode26.6。归档前后484个源码输入哈希一致；磁盘工程版本未改。App及React/Dependencies/Hermes四个dSYM匹配，JS bundle SHA256 `b0a1234942a1c2c02f0927c9a8095a2787ea04020aa687a5cd31dccf12814672`。原归档保留，符号副本仅补充三个框架dSYM。

CLI export-only（含 allowProvisioningUpdates）退出70，显示 No Accounts 和缺 iOS Distribution。随后用Xcode Organizer现有Apple账号选择 App Store Connect，界面明确显示 `MiaoxunRN 1.0 (60) uploaded`，因此上传成功。Build60没有修改源码输入或磁盘工程 Build Number，原始归档和匹配dSYM保留。

用户于本轮表示 TestFlight 后续由其处理。当前无法读取App Store Connect页面确认Apple处理、出口合规问项及Build60是否已关联原 `yunzhi` 测试组；不把Xcode上传完成等同于“正在测试”。

## 待完成边界

生产漫画0.1.4 release/product 未上架，不替用户增加 `media:image:generate`。用户指出 TestFlight 由其处理，后台登录/发布稍后进行。待正常后台登录后创建/审核/发布对应 Agent release/product，再由用户在 App 内明确同意独立媒体权限；新客户端和后端部署都不会自动给用户开通。实体设备上的漫画确认、生成进度、私有图片读取，以及妙页/二楼手势与语音仍须实际验收。

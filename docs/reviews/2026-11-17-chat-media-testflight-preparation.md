# 2026-11-17 聊天媒体与 Build66 配套准备

用户确认继续本地补验、后端配套核对与新 TestFlight 准备。本阶段使用发布工作树，HEAD `d04221f7f07c05c1ae24789c087eb9d03e7ed193`；保留已有未提交修改，不编辑 Desktop 旧分支，不新提交或推送。生产维护、061迁移、开流与上传结果分别记录，不能从本地归档或历史授权推断。

## 隔离设备补验

独立 App `com.wangruoshi.miaoxun.chatqa20261117b`（“妙讯验收B”）使用本地 API `127.0.0.1:4393`、PostgreSQL `55444`，001–061首次迁移及重放通过。523项 RN 文件构建前后摘要一致，禁用供应商 fetch、未启动 worker；两个新建合成账号、一个好友私聊和带 QA17 标识的合成图片不含生产业务数据。

- 中文提交：清空英文草稿后切简体拼音，逐键输入 `jianpan`，选择“键盘”候选，再点击系统键盘 Send。实际出现一条“键盘”气泡、输入清空、键盘收起。隔离数据库仅新增一条原始消息和一条好友镜像，使用同一请求ID；没有其他新增消息，14张 Agent/任务/生成/预览表均为0。
- 普通图片保存：聊天图片正常显示，点击进入全屏查看器，再保存并允许独立 QA 包添加照片。随后进入系统 Photos，图库13/13的最新图片为 QA17，打开大图独立确认。仅针对该新增合成资源核对640×480与解码像素；原生JPEG重编码后文件摘要不同，像素MAE0.27、PSNR46.04dB。
- 上述均为 iPhone17 / iOS26.5 Simulator 和隔离API证据，没有生产写入、付费调用或新增Agent授权，不等同于实体iPhone通过。持久回执与两张实际截图位于仓库外 `~/Library/Application Support/MiaoxunReleasePreparations/chat-media-testflight-20261117/qa-evidence/`；不复制凭据进仓库。

## 生产与制品只读核对

- SSH正常，生产实际runtime仍为 `comic-chat-feedback-20261113-15e7269`，306项文件匹配；数据库账本确为60项且checksum匹配，末项060，表情表不存在。API及双worker运行正常；备份最近成功退出于11月17日12:22:30 CST，timer等待下一轮。没有用 `/api/ready` 的current字段代替账本编号。
- 已冻结的309项后台候选 `chat-media-candidate-20261117-43bbe01` 仍存在，SHA256 `aac7fe976fb0fd7a767be76da0eac0c14069786c0a5446508cb68844fd95f740`，309项与manifest逐字节匹配，当前runtime输入与其无差异。已复制至仓库外持久准备目录；不重写其manifest或重新拼入无关客户端文件。
- 061向消息表增加触发器，旧runtime账本校验拒绝061，不能仅切回symlink回滚。配套工具需要精确绑定060→061、停写备份、隔离恢复升级演练、受限DDL超时、进程与账本核验、开流前独立审阅；失败不得自动删表、删账本或覆盖新业务数据。
- 用户重新登录后，通过正常Chrome页面实读最高上传为1.0(65)，记录“完成”；65为“正在测试”，未见更高处理中构建。本次新目标66；旧66本地归档不包含最新dirty输入栏修改，不复用。

## 门禁与原生归档

本阶段再次运行 `MIAOXUN_DOTENV_ENABLED=false ./scripts/check-repository.sh` 退出0：RN122套/1534项、Backend1153通过/410项专用PG门控跳过、Agents59、Admin52、avatar-web29、检索Web4；类型、lint、格式和构建通过。日志 `/tmp/miaoxun-testflight-preparation-repository-20261117.log`。PG门控跳过与独立隔离验收分开记录。

原生iOS归档沿用实际dirty输入冻结方式，不为了客户端出包调用后端runtime的clean HEAD门禁，也不新增提交。冻结557项RN/shared/scripts/root输入、HEAD/index/diff、依赖与本地配置摘要；源码摘要 `f5fa3651c719d4e28a5ce305d045aac429668cd1444cca626728b7ca7c8e345d`，precheck通过。使用命令行覆盖Build66和正式API，保留磁盘工程Build63。

最新归档已成功，postcheck及独立只读复核通过：557项源文件前后及当前工作区一致，依赖仅41项预期Debug→Release变更、未知变更0；归档JS与独立Hermes重编译逐字节匹配。Bundle、1.0(66)、正式API、ATS、Team、arm64与严格codesign校验正确，App dSYM UUID匹配。归档位于仓库外 `~/Library/Application Support/MiaoxunReleasePreparations/chat-composer-20261117/build66/MiaoxunRN-1.0.66.xcarchive`，未改磁盘工程Build63。

实际仍为Development签名，profile与签名entitlements均为`get-task-allow=true`；Distribution、上传、Apple处理及手机可安装尚未通过。Xcode原生窗口控制报`cgWindowNotFound`；官方CLI export-only退出70，显示`No Accounts`及缺`iOS Distribution`，未上传。已请用户打开精确归档并保持Organizer前台，不复用旧归档或填写出口合规。

锁定Ruby/CocoaPods gems仍缺失（`bundle check`退出1），已安装Pods的Manifest与Podfile.lock字节一致；本次归档成功不等于重建环境已完整。React、ReactNativeDependencies、hermesvm三份匹配dSYM缺失，框架崩溃符号化限制保留；不自动安装依赖或隐藏警告。

## 后端发布工具审查与当前边界

309项tar及8份v1冻结工具仅运输至服务器root-only独立准备目录，未创建候选runtime、进入维护、迁移或切换。v1 `plan`只读预检通过：真实账本060、精确代码差异、空活动/待确认队列、公开目录及registry/release/product/用户授权指纹、现有服务/配置和共享路由符合绑定。

独立审查发现v1两处阻塞，因此禁止执行其stage/deploy/open：降权postgres读取root0700执行证据必报EACCES；`/run`易失维护marker在主机重启后可能丢失，无法保证持久开流边界。仓库外新版本`ops-tools-v2`已修正为root预验后通过root所有匿名pipe传最小证明，降权子进程核验FIFO/UID/父PID/startTicks和精确发布绑定；维护marker移至持久`/etc/nginx/miaoxun-chat-media-20261117.maintenance`。原冻结工具及tar保持原样。旧060 API仍可能监听业务路由，仅ready和AI启动校验不兼容061；必须依靠维护和停止服务保持停写，不能把symlink切回当作回滚。

v2清单SHA256为`7c28bd48e7090e178751fedeac02fdf41726dfc197c81ccd4e893435ca080d5f`；Python30项、Node6项、真实Linux跨用户匿名IPC5项通过，独立最小差异复审通过。真实权限试验未创建远端文件或连接数据库；重启场景为丢失模拟`/run`的fixture，未实际重启服务器。

v2随后独占运输并执行只读plan和独立stage，均退出0。实际新建候选runtime并按锁文件安装Linux生产依赖；真实配置、sharp及12个新旧模块导入通过，没有启动新服务或提交任务。独立只读复核309项hash一致、代码和依赖可读且内容未变；live symlink、Nginx及生产环境字节未变，持久维护marker不存在，旧API/双Worker仍原PID/cwd且零重启、备份timer等待。独立数据库读取仍为60项账本且两个表情表不存在。证据`staging-independent-readonly.json`已保存在仓库外准备目录。

真实PG18停写备份恢复、克隆061升级、正式061迁移和开流仍未执行。已向用户展示冻结v2方案，单独请求维护503、停服务、备份/恢复演练、迁移/切换及核验后开流的具体授权；来源为用户最初第8条及AGENTS的生产授权边界，等待答复。不存在生产业务测试数据或新增模型调用。

隔离QA API4393与PG55444已按所有权约束关闭，原4391/55441运行时身份未变。数据文件和证据保留，新增停机回执持久保存，不复制凭据入仓库。

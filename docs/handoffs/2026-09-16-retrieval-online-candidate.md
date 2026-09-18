# 妙讯接续：检索、资料定位与线上候选

日期：2026-09-16。此文记录进度，不额外授予生产发布或付费调用权限；用户当前对话优先。

**后续发布已获用户明确授权并执行。** 活动 release 已更新为 `app-integration-20260916-04`，
数据库31迁移，正式模拟器已装1.0(43)，TestFlight43上传、处理和内外部yunzhi群组分发完成，
页面已确认“正在测试”。检索付费开关/预算未变，真机手势与完整设计仍需继续验收。
最新事实以[发布记录](../reviews/2026-09-16-production-and-testflight-43.md)为准；下文候选状态
保留作执行前快照，不能重复请求已获得的发布/上传授权。

## 可直接交给下一任务的提示词

请继续 `/Users/gary/Desktop/myproject/marvelsChat` 的当前改动。先读本交接和链接的最新核查，
检查 Git 状态，保留所有未提交改动，不重做已通过验证。当前优先交付 RN 私有素材检索、
精简小站资料并恢复定位、同步后台，以及用正式环境验收。合作/评分规则已确认但暂时后置。
面向上线实现真实读写和明确失败，不用假数据、静默兼容或回退掩盖缺口；对设计和业务不闭环
处主动说明。不要反复问已经确认的产品选择，不输出任何密钥/令牌/密码。

代码与线上候选已准备，但当前尚未切换生产或安装新正式模拟器包。核实用户是否在本交接之后
确认了具体发布；有确认则继续执行，不要重复申请。没有确认时完成所有准备后才请求该最后步骤。
检索供应商与预算尚未启用/调整，不能将“继续”解释为提高费用额度。分清代码实现、模拟测试、
真实 UI 验收、供应商评估和实际线上状态。需要换任务时在本目录生成更新交接并说明。

## 当前事实

- 分支 `codex/offsite-database-backups`，HEAD `e70270f`，大量工作区成果未提交；没有 push。
- 正式 RN `MiaoxunRN`；Express/PostgreSQL `backend`；管理后台 `admin`；伙伴产品核心为同仓
  后端/Agent 代码，RN 通过 API 接入。管家仍是文字对话，不具备检索自动 tool calling。
- 最新详细证据：[线上检索与候选](../reviews/2026-09-16-online-retrieval-readiness.md)、
  [资料闭环](../reviews/2026-09-16-profile-identity.md)、
  [冻结公共合同](../media-retrieval-product-handoff.md)。
- 持续决定：音乐不在新版；长按统一进入妙管家并带入可编辑草稿、用户确认发送；合作/评分
  来自真实完成合作和评价；原设计图标等待正式资产，不裁图冒充生产图标。

## 已完成代码

- RN `features/media-retrieval`：个人相册的找素材，注册/Build 26/服务状态门禁，同意与
  enable/reindex/purge、202 状态、事件轮询和断点、错误/预算状态、图片预览和视频时间点。
- 生命周期 Keychain 日志按 userId 隔离，只保存操作编号/类型/费用核对标记。手动重试复用编号；
  网络/响应合同不确定、本地删除失败不丢原编号。未知费用阻止付费操作但允许撤回。
  旧清理成功不能确认新清理。严格公共 DTO，未改变冻结合同 SHA。
- `StationMediaPreviewScreen` 使用 `react-native-video@6.19.2`，Bearer 媒体与匹配时间 seek；
  新 owner-only 元信息 API 只返回 id/kind/status，外人/删除404、未完成409。
- 资料默认昵称/签名/定位展示地区，职业年限语言折叠选填；原生定位→已有解析API→主动选择
  城市/省份→统一保存。社区/活动区域独立，允许清空；未新增原生定位模块。
- 社交列表修复 community/activityArea 独立隐私开关；aiId 与导航关联仍有独立未修复问题。
- 后台增加白名单供应商错误诊断、30天保留、拒绝客户端伪造专用事件；保留真实费用账本。
- Provider 提示词明确原 schema 的字段/长度/类型/枚举，描述版本 v2；没有声称复现历史失败。

## 验证与运行

- RN 全检查及28 suites/152 tests；后端201文件检查、362通过/1 opt-in跳过；Admin11通过/构建；
  Agents33通过；avatar-web29通过/构建；Linux候选29相关测试通过。真实隔离PG API验收通过。
- 新正式 iOS Release 模拟器构建通过，API `https://8.153.167.11`，bundle `com.wangruoshi.miaoxun`。
  产物 `/tmp/miaoxun-online-integration-build/Build/Products/Release-iphonesimulator/MiaoxunRN.app`；
  日志 `/tmp/miaoxun-online-release-build-20260916.log`。最后修正已重新构建。
- 尚未安装新包。当前模拟器正式旧包、真实账号 TGary；QA包identityqa已卸载、profileqa账号
  已删除；QA API4391/admin5176已停止。测试PG55436最后users=0并已停止，不碰其他本地库。
- 新版编辑器实际键盘/滚动/GPS、视频播放器还未UI验收；没有真机/TestFlight/Android原生编译，
  没有真实供应商质量/成本评估。CocoaPods成功但锁定Bundler gems缺失，不能称环境完全可复现。

## 可用候选与生产边界

- SSH alias `marvels-chat`；活动 `/opt/projects/marvels-chat/app` 指向 `releases/042c023/runtime`，
  后端/worker active，ready200，迁移29条，备份service最近Result=success。
- 候选ID `app-integration-20260916-03`，路径
  `/opt/projects/marvels-chat/releases/app-integration-20260916-03/runtime`。
- tar SHA256 `2a2f5b20fa3383bdc6489a5f0d686abce3f7496d256d4a95f93251a60a0bc524`，336文件清单已核对。
  本地tar路径见线上核查文档。Linux npm ci成功；env已精确复制且权限硬化，代码root所有。
- 候选storage仍空，须停写后复制旧backend/storage（20K）。不可用候选02仍在暂存目录、从未激活，
  不要用；原因macOS AppleDouble。候选03无此问题。
- 需迁移030真实互动和031身份资料。当前3条动态的点赞/收藏均0，重算不会清掉非零计数。
  新客户端依赖031，不要先装App接旧后端；迁移后只切旧代码不是完整回滚。
- 已有admin active/全权限，没读密码或重置；不是需要重建默认密码。生产profileqa=0。

## 下一步

1. 核实本次线上发布是否获确认；准备已完成。若确认，按线上核查文档停API/worker→新备份并
   验dump/checksum/OSS→复制storage→复核硬化→原子切symlink→迁移030/031→启动服务。
   关键失败则停写，恢复本次备份和042c023，不能只退旧代码。不要调整env或检索开关。
2. 验health/ready/账本/worker/admin资源/媒体与资料合同，安装正式Release模拟器包，保留TGary
   登录数据。UI验收资料键盘/折叠/定位/放弃修改；不要保存任意演示内容到真实账号。
3. 检索现在数据库provider=false、queue=false、sandbox；有8图片/0视频/0 ready段。历史2次
   unknown合计200分是待核对预留，不等于实际花费。不要清账或宣称修复了历史原因。
4. 当前预算全站5元/日、用户5元/月、3次/日，单图索引预留2元、普通查询另2元、6帧视频12元。
   用户尚未回答预算问题，维持现状。enable会索引该用户全部素材；limited_release没有用户
   白名单，不能当单用户灰度。真实供应商验证需明确素材/同意/费用范围，不批量自动调用。
5. 此后再推进合作/评分、形象档案、生活发布/图片性能与逐页设计验收。不要声称全项目已闭环。

## 工具与资源说明

蓝湖项目/页面ID见旧交接；Chrome原生应用可看设计，浏览器连接器auth=apikey不支持。
模拟器UDID `7E81531F-02AE-40FC-98DA-A575CEC9930F`。CUA继续前重载文档并重新核实AX状态。
两个独立复查子任务曾因上游403余额不足失败，主任务已自行完成最后控制器复查和回归；没有
成功的额外独立review结论，不要为同一余额问题盲目反复启动代理或谎称换任务能解决算力配额。

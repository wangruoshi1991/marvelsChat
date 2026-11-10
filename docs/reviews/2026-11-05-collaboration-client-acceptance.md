# 2026-11-05 真实协作结果的客户端验收

本记录接续当天真实模型成功样例，只验证当前代码与隔离数据。没有生产写入、后端部署、提交、推送或 TestFlight 上传；Build59 不包含本轮客户端修复。

## 环境和数据来源

- iPhone17 / iOS26.5 Simulator：`7E81531F-02AE-40FC-98DA-A575CEC9930F`。
- 独立测试 Bundle：`com.wangruoshi.miaoxun.collaborationQA20261105`，显示名“妙讯协作验收”；只连接 `http://127.0.0.1:4395`。正式 App 的 Bundle、origin 和登录没有替换。
- 数据是已有 `live_1105_dev` 本地 PostgreSQL 集群中的真实成功 workspace `c50d8297-2331-4cd3-89cb-0dece23496ea`，不是复制的演示结果。三位专业 Agent 的原始文字成果和管家汇总保留原记录。
- 测试 API 加载当前后端路由及实时连接，但没有 Worker、供应商凭据或模型调用；外部 fetch 被禁止，新增模型入口明确返回 `503 QA_MODEL_CALLS_DISABLED`。
- 仅使用原隔离虚构测试用户，临时密码与恢复用 hash 存于权限600的仓库外文件，经正常登录和产品 consent API 读取实际成果。生产账号、私人资料、日常 App 数据不参与。
- 初次复制未签名制品出现 Keychain entitlement 错误；手工补签也未形成可用候选。改用 Xcode 正常 Simulator 构建生成 simulated entitlements 后，独立 App 可正常登录。没有为正式 App 添加 Keychain 共享组。

仓库外证据根目录：

`/Users/gary/Library/Application Support/MiaoxunReleasePreparations/ui-agent-candidate-20261105-cebc1e6/collaboration-eval/client-qa-20261105/`

## 本轮确认并修复

### 普通点击偏离 PDF 的本卡详情

原协作卡 S0 点击会打开整个 workspace，默认折叠箭头只是展开头像名称。PDF 第2、4页要求标题/展开详情进入同一卡片的 S2。

- 有 `renderState` 的协作卡普通点击进入本卡 S2；默认“展开详情 / 收起详情”控件也控制 S2。
- 参与人数独立进入或收起 S1；完整 workspace 改从明确的内容菜单打开。
- 已有 UI 偏好的显隐、文案、图标、尺寸和排序继续生效。
- Legacy task 没有三态 renderer 时保留原导航，不展示会打开空白内容的三态入口或手势；不能据此宣称 legacy 任务已完成 PDF 三态。

### 卡片和参与者弹层的无障碍分组

实际模拟器最初只暴露一个整卡元素，内部参与人数、详情和菜单无法独立访问。参与者弹层也只暴露关闭遮罩，聊天入口和正文被遮罩吞并。

- `AIContextActions` 和 `AIAssistGestureSurface` 增加 `accessible` 透传，默认保持其他调用点原行为。
- 三态卡外层不分组，标题、参与者、详情、省略号各自是具名按钮；实际 Simulator AX 树已核对。
- 弹层遮罩改为内容的兄弟节点；关闭、聊天和文字分别可访问，关闭点击区44pt，中间正文有界滚动，底部聊天动作保持可见。
- 模拟器已核对弹层分别暴露“关闭 Agent 详情”“关闭”“打开 Agent 对话”及真实文字，点击关闭仍返回 S1。

### 省略号菜单点击后立即消失

实际点击发现菜单无可见结果。原因是点击入口复用长按手势的 sourceId，新菜单被父层随后的 touchEnd/cancel 立即关闭；延迟原生测量也会触发这一竞争。

- `AIContextActions.openMenu()` 使用独立菜单来源，仍通过已有 provider 展示与清理；长按和拖动保留原来源，没有加入延时规避。
- 新增即时和延迟测量的完整触摸生命周期回归，旧实现均失败。
- 重建后实际点击菜单保持展开，能看到“查看协作 / 妙管家”，点击查看协作打开真实 workspace。

### UI 偏好设置重复请求和过期预览

- preview/confirm/reset/undo 共用同步 in-flight 锁，阻止同一帧双击及不同操作竞争；忙碌期间相关输入和按钮禁用并暴露 busy 状态。
- reset/undo 成功清除旧预览；失败保留预览并显示真实错误。
- 将不合法的“详情按钮右上角”示例改为白名单支持的“参与 Agent 按钮右上角”。
- 6项新增回归先失败，修复后设置测试9/9。服务端 CAS 和重新鉴权继续负责数据一致性，本轮未改服务端。

## 实际客户端验收

| 路径 | 结果 | 限制 |
| --- | --- | --- |
| 正常登录/bootstrap | 通过，保持独立 App 会话 | 不代表正式账号或线上验收 |
| 妙页 S0 | 一条真实成功任务，4个参与者（管家+三专业） | 不把专业人数与总参与者混用 |
| S0→S2→S0 | 点击展开详情原地展示管家真实汇总，收起返回摘要 | 连续左滑和高度动画另列 |
| S0→S1→S0 | 人数入口展示4个真实参与者及贡献状态，收起返回摘要 | 不等于5位专家的设备验收 |
| S1详情 | 底部弹层、真实任务和更新时间、关闭/聊天可独立访问 | 长正文触摸滚动仍待设备复核 |
| 漫画 Agent 聊天 | 显示协作贡献及《雨天的旧伞》8格真实正文 | 没有生成图片 |
| 视频 Agent 聊天 | 显示30秒脚本、真实时间表正文 | 没有生成视频 |
| 形象顾问聊天 | 显示阿禾外观/服装/配色/工具等真实建议 | 没有生成形象图片 |
| 省略号菜单 | 修复后实际展开并打开完整 workspace | 普通点击不再代替 S2 |
| 连续拖动/动画 | 未通过验收 | CUA 拖动/滚轮没有稳定产生连续原生触摸；不能以JS回归或点按代替 |
| UI-Agent真实预览/确认 | 定向合同/状态测试通过，设备完整链路未验 | 本隔离库没有 UI-Agent product/consent，也没有模型入口；未注入假预览 |
| 实体语音/相机、二楼手势、文件正文滑动 | 仍待实体设备 | 当天前一阶段的模拟器入口证据见 simulator-acceptance，不重复宣称通过 |

PDF依据：微信提供的《妙板块-状态效果与交互说明-20261102.pdf》第2–4、14页。此次修复覆盖状态入口和内容闭环，不宣称所有视觉位置、瀑布流展开和真机动画已逐像素一致。

## 动态人数和状态调度复核

当前 planner 每批1–20节点，按已注册且授权的能力选择，不固定两人；单Agent足够时不增加参与者。Runner 默认并发4，可明确配置1–20；节点领取只等待自身依赖，事务锁不覆盖整个模型执行。

- 非数据库定向71/71。
- 独立 PostgreSQL 18.4，56迁移后 repository32/32、text29/29、service22/22，全0跳过；合计154项通过。
- 外部明确标注的调度夹具验证1/2/3/4/5/19个独立节点及依赖汇总；并发4时5和19节点按波次完成，无重复领取，汇总等待全部依赖。
- 5节点样例使用5位不同已注册专家；19节点复用这5位专家，不能称19位不同Agent。没有模型调用，不替代模型选人质量或客户端实时并行验收。
- 当前失败策略停止后续派发并保留先前成功成果，不存在独立 `partial_success` 总状态。等待授权的任务快照不可扩大，完成授权需新建任务；不把授权后自动恢复旧任务列为已实现。
- 专用调度集群已停止，socket消失，测试用户/workspace/session均0；没有操作客户端验收使用的4395。

证据：`collaboration-eval/dynamic-review-w4UMfZ/dynamic-evidence.json` 和 `dynamic-probe.mjs`。

## 修改入口及验证

本阶段新增修改（此前 S2/媒体修复仍保留）：

- `MiaoxunRN/src/features/miao/MiaoTaskCard.tsx`
- `MiaoxunRN/src/features/assist/AIContextActions.tsx`
- `MiaoxunRN/src/features/assist/AIAssistGestureSurface.tsx`
- `MiaoxunRN/src/features/workspaces/AgentWorkspaceCard.tsx`
- `MiaoxunRN/src/features/settings/SettingsScreen.tsx`
- `MiaoxunRN/__tests__/miaoCardState.test.tsx`
- `MiaoxunRN/__tests__/miaoTaskFeed.test.tsx`
- `MiaoxunRN/__tests__/uiPreferenceSettings.test.tsx`
- `MiaoxunRN/__tests__/workspaceParticipantModal.test.tsx`

实际执行：

```sh
MIAOXUN_DOTENV_ENABLED=false ./scripts/check-repository.sh
git diff --check
cd MiaoxunRN
npm test -- --runInBand miaoCardState miaoTaskFeed uiPreferenceSettings workspaceParticipantModal aiAssistGesture assistContextFlow
npx tsc --noEmit
```

整仓最终日志 `/tmp/miaoxun-collaboration-qa-20261105-repository-final.log`；RN87套1126项通过，整仓退出0。另独立复核6套157项通过。UI-Agent 后端合同/服务/路由50/50、Agent声明4/4通过。整仓的数据库门控跳过仍不计为已验，以上154项包括独立隔离PG真实运行证据。

Simulator 正常 Xcode 构建使用 `PRODUCT_BUNDLE_IDENTIFIER=com.wangruoshi.miaoxun.collaborationQA20261105`、`MIAOXUN_API_BASE_URL=http://127.0.0.1:4395`，仅覆盖专用 DerivedData `/tmp/miaoxun-collaboration-qa-20261105`，不修改 Xcode 工程默认值。构建签名和安装成功不代表实体设备通过。

最后补齐默认详情标签英文翻译并重跑整仓及构建，均退出0。最终源码候选JS SHA256为 `1f94d6f7123dfcadf14644e426d690dc3e90142d318e230a4e8de01331469ca1`；此最后仅文案改动的候选没有再次安装。实际菜单修复安装候选为 `1d59f3ada8e964a4fe07e68e1acce9364acd9e1f2054d2d214ad7f765718e4dd`，不能混淆编译与安装证据。

## 隔离环境收尾

- `stop.mjs` 正常执行：3个本地consent撤回、QA会话全部撤回、activeSessions0、原测试用户密码hash恢复；临时私有凭据和hash恢复文件删除。
- API4395与专用PostgreSQL停止，socket目录删除；实际成果库文件保留，不改原始真实运行记录。外部fetch计数0。
- 仅卸载本轮新建独立QA Bundle，正式App未替换；正式JS hash仍为当天12:50的 `7567a2be8d8956efed36712c4ed07e3392a0717ca38e93b874356e92bd8d7d68`。启动正式App后既有登录仍有效；不截取私人消息。
- 证据根目录保留 `cleanup.json`、`client-cleanup-verification.json`、`qa-app-build.json`、`screenshots.json`、完整检查/构建日志以及 `miao-s0/s1/s2.png`、`participant-sheet.png`、`miao-menu.png`、`comic-chat.png`、`video-chat.png`。截图只含公开虚构故事测试内容。

## 剩余工作

1. 实体设备连续左右滑、跟手/回弹/高度动画、二楼进出、S2/文件/弹层滚动不误退出。
2. UI-Agent 独立正常发布授权及真实模型预览→确认→重启持久化→撤销→恢复默认的设备验收。
3. 实体语音点按/长按/识别确认、真实相册/拍摄/文件/位置上传发送。
4. 真实运行中的客户端状态变化，以及失败/等待授权/取消后的产品交互验收；当前调度及数据库测试不替代此项。
5. 新客户端候选包含本轮修改后再申请独立 TestFlight 上传授权。本轮无需后端部署；不把 Build59 当作已包含。

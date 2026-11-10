# 2026-11-05 妙页 PDF 布局与滑动连续性修复

本阶段按用户提供的《妙板块-状态效果与交互说明-20261102.pdf》第2–4、10、14页复核。读取并渲染原PDF，不把旧原型V20的重叠底部头像当成本次设计。保留当天先前修改与真实成果授权校验，不使用演示任务、商户、优惠券或人像充当上线能力。

## 设计与实际差异

PDF共用结构是「多Agent头像及名称 → 一句话概要 → 当前类型的真实内容与快捷入口 → 时间、参与人数、展开/收起」。S1保留头像区，主体替换为参与者清单；S2保留头像和概要，当前卡片纵向增高，后续条目顺延。纵向阅读仍由原列表负责。

此前实现的差异：头像位于卡片底部并互相重叠，名称默认隐藏；S1仍显示任务标题并没有明确的「收起Agent」入口；S2文字被限制在320高度的嵌套滚动区。卡片长距离滑动还会移动整个头像/菜单框。

当前修改：

- 头像区固定放在顶部，独立圆形头像及名称，不重叠、不添加第二个横向ScrollView；人数较多或窄屏时换行，所有实际参与者仍可达。头像来自已发布identity；缺失继续显式失败，不替换成其他Agent。
- 顶部保留省略号菜单。S0摘要、S1参与贡献、S2真实当前成果使用同一个卡片主体；只有主体横向跟手，头像/菜单/底部不平移。
- S1隐藏摘要标题，逐项显示头像、Agent名称、职责/本次结果、更新时间和详情。底部「收起Agent」回S0；S2「收起详情」回S0。必要返回入口在已展开状态不因偏好隐藏而消失。
- 单任务和协作卡均增加实际更新时间，保留真实状态。正常单任务缺少三态renderer时仍进入原任务，不开放空白状态。
- S2的受保护完整文字直接撑高当前卡片，取消320高度内层滚动；外层列表负责浏览，正文鉴权、离页/后台清除、账号切换和revision重验保持生效。
- 当前只显示真实text/site/media合同能提供的内容。没有商户、优惠券、订座或生成图片/视频合同，不照抄PDF示例制造业务按钮或成果。

## 已复现的抖动原因

任务轮询每3秒写入新snapshot；`gestureUIPreference()`每次渲染生成新对象，原`useMemo(PanResponder.create)`依赖这些对象，导致同一手指在滑动中遇到全新responder。RN闭包内累计dx重新开始：旧版真实touchHistory测试从-130继续移动-5，实际变-5，正确应-135。

新增`useStablePanResponder`保留同一个RN实例，授权给手势时冻结本次回调与配置，下次手指使用新偏好。`useMiaoCardGesture`复用该基础并增加纵向起手轴锁。页面失效或多指加入取消当前手势，不会复活旧release；二楼入口和返回区同时复用，见[二楼记录](2026-11-05-second-floor-gesture-continuity.md)。

核心新增回归先RED后GREEN：轮询后dx保持-135、中途阈值更新不改变本次触摸、纵向起手后横漂不抢列表。它们调用渲染后的真实RN panHandlers/touchHistory，不是仅调用业务状态函数。PDF头像布局/收起入口回归同样先失败后通过。

## 修改入口与验证

- `MiaoxunRN/src/features/miao/MiaoTaskCard.tsx`
- `MiaoxunRN/src/features/miao/MiaoTaskAgent.tsx`
- `MiaoxunRN/src/features/miao/MiaoTaskFeed.tsx`
- `MiaoxunRN/src/features/miao/useMiaoCardGesture.ts`
- `MiaoxunRN/src/features/workspaces/AgentWorkspaceCard.tsx`
- `MiaoxunRN/__tests__/miaoCardState.test.tsx`
- `MiaoxunRN/__tests__/miaoTaskFeed.test.tsx`
- `MiaoxunRN/__tests__/miaoCardGestureContinuity.test.tsx`

定向`miaoCardState/miaoTaskFeed/miaoCardGestureContinuity/workspaceParticipantModal`4套63项通过；复用共享hook后`miaoCardState/miaoTaskFeed/miaoCardGestureContinuity/secondFloorGestureContinuity/stablePanResponder`5套63项通过。类型、定向ESLint与Prettier通过。

最终执行：

```sh
MIAOXUN_DOTENV_ENABLED=false ./scripts/check-repository.sh
git diff --check
cd MiaoxunRN/ios
xcodebuild -workspace MiaoxunRN.xcworkspace -scheme MiaoxunRN -configuration Debug -destination 'platform=iOS Simulator,id=7E81531F-02AE-40FC-98DA-A575CEC9930F' -derivedDataPath /tmp/miaoxun-collaboration-qa-20261105 PRODUCT_BUNDLE_IDENTIFIER=com.wangruoshi.miaoxun.collaborationQA20261105 MIAOXUN_API_BASE_URL=http://127.0.0.1:4395 build -quiet
```

整仓最终退出0，RN91套1148项通过；后端/Agents/Admin等测试与各工程构建、TypeScript、ESLint、Prettier均通过。默认整仓数据库门控仍有跳过，不计为通过；本轮额外隔离消息99/99和检索12/12证据见Agent能力记录。

首轮整仓发现新增时间标签`displayText`参数反序的TypeScript错误，修正后完整重跑，不隐藏失败。最终日志`/tmp/miaoxun-layout-agents-20261105-repository-final.log`。当前完整源码的专用Simulator正常Xcode构建退出0，日志`/tmp/miaoxun-layout-agents-20261105-source-final-build.log`，仍有已有Pods/脚本警告；构建不是安装或原生交互验收。

构建与检查哈希记录`/tmp/miaoxun-layout-agents-20261105-final-evidence.json`。公网TLS正常验证下`/api/health`、`/api/ready`、`/api/agents`只读返回200，公共目录9项；不表示本轮后端修改已经部署。

## 设备与版本边界

已重新启动独立真实成果QA库/API4395，不启Worker、不载供应商凭据、所有模型入口明确503，准备在独立App核对画面。当前Mac锁屏使CUA无法操作模拟器；实体iPhone14Pro也为unavailable。本阶段尚不能认定原生连续滑动、抖动体感或实际画面逐像素验收通过，不以此前候选截图或JS回归代替。

蓝湖当前页面明确要求重新登录，未取得新的设计切图。头像验证使用程序生成的四类测试图，经真实HTTP上传/裁切/权限/发布读取；这些是结构诊断图，不是正式设计头像。详见[头像验证](2026-11-05-avatar-upload-acceptance.md)。

本轮卡片修改不需要数据库迁移或后端部署，需要新客户端。Build59不含修改；本轮没有提交、推送、上传或生产数据变更。Agent直接聊天修复另需后端新制品，不能混为所有改动均无需部署。

QA收尾已独立只读核验：3项consent撤回、活跃会话0、原密码恢复一致、私有凭据删除，API4395/专用PG停止及socket清除。原真实workspace和6节点成果指纹不变；本轮未安装/卸载任何App。证据在仓库外`collaboration-eval/client-qa-20261105-layout/cleanup-verification.json`。

## 本轮其他修改文件与后续

为方便完整审阅，以下是本轮其他产品/测试入口，未包含当天先前已有的改动：

- 共享手势与二楼：`src/shared/gestures/useStablePanResponder.ts`、`src/features/messages/ThreadListScreen.tsx`、`src/features/second-floor/SecondFloorScreen.tsx`、`__tests__/secondFloorGestureContinuity.test.tsx`、`__tests__/stablePanResponder.test.tsx`（均位于MiaoxunRN）。
- 头像：`MiaoxunRN/src/features/messages/AgentGlyphAvatar.tsx`、`MiaoxunRN/__tests__/agentImageIdentity.test.tsx`、`admin/src/PublishingIdentity.jsx`、`admin/src/publishing-model.js`、`admin/test/publishing-contract.test.js`、`backend/scripts/check-agent-publishing-integration.js`。
- Agent真实调用：`backend/src/routes/message-routes.js`、`backend/src/ui-preference-service.js`、`backend/src/message-repository.js`、`backend/test/ui-agent-message-integration.test.js`、`backend/test/ui-preference-service.test.js`、`docs/agents.md`。
- 语音：`MiaoxunRN/src/features/messages/MessagesScreen.tsx`、`MiaoxunRN/src/features/messages/useChatSpeech.ts`、`MiaoxunRN/__tests__/chatSpeech.test.tsx`、`MiaoxunRN/__tests__/chatContentActions.test.tsx`。

尚未完成的验收必须继续区分：解锁后在隔离App实际核对新布局与连续手势；实体麦克风/相机/定位/媒体上传发送；正常用户UI-Agent授权→真实模型预览→确认→重启→撤销恢复；视觉检索的真实供应商质量。微信/邮箱/日历/群聊尚未接通部分仍保持明确不可用。本轮不改变上述业务为假成功。

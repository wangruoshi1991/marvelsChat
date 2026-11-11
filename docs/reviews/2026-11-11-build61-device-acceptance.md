# Build61真机验收启动与本地缺陷修复

2026-11-11。沿 `admin-lifecycle-release/marvelsChat` 工作树继续，保留既有未提交文档。安装与触控结论来自用户在实体手机的回复；代理没有独立读取该手机、录制画面或测量帧率。下述修复是本地增量，**不在已上传的Build61内**，未提交、推送、部署或再次上传。

## 本轮实际验收

| 项目 | 证据与结果 | 仍未覆盖 |
| --- | --- | --- |
| TestFlight下载/安装 | 用户确认下载问题已解决，手机已安装1.0（61）。 | 代理未独立读设备版本，不推断其他测试者的分发状态。 |
| 漫画目录 | 用户在“我→我的Agent”确认能看到“漫画日记Agent”。 | 不以目录可见代替执行验收。 |
| 漫画授权入口 | 用户回复已有效绑定、没有“重新同意”入口；本轮保留现有绑定。 | 未取得完整授权弹窗或服务端精确scope证据，不推断已同意 `media:image:generate`，未代用户授权。 |
| 二楼进出 | 用户反馈能进出，但有卡顿、跳动或空白闪烁；进一步定位为“上滑退出、回到讯页的瞬间”。**退出体验未通过。** | 新修复的真机效果、帧率、其他页面与设备仍待复验。 |
| UI-Agent添加/重新同意 | 对照Build61来源提交 `171a01d`，在本地复现真实registry权限被客户端误判未知的阻塞。 | 不将源码复现写成用户本轮实测；旧有效授权、真实模型预览仍需独立验证。 |
| 妙页/真实生成/其他Agent | 本轮未验。 | 既有任务卡S0/S1/S2、多卡/减少动态效果、漫画真实生成与各Agent真实能力均不能写通过。 |

## 根因及修复

1. **UI-Agent权限展示缺项。** 现有Agent声明含 `ui-preferences:write`，客户端 `agentPresentation.ts` 没有对应标签，公共确认hook会在弹窗前明确拒绝未知权限，阻止首次添加和原位重新同意。本轮只补“修改界面偏好 / Change interface preferences”标签，沿用原完整scope、精确产品版本和用户确认；保留未知权限拒绝。测试改为加载实际Agent registry，避免旧UI-Agent用例借用建站Agent权限而遗漏缺陷。
2. **退出过程中没有讯页承接。** App原先互斥挂载二楼和讯页，二楼整页上移/淡出时下面只有空壳，结束后才重新创建讯页和导航。本轮把二楼作为透明外层的绝对定位覆盖层，下面保留讯页和导航；覆盖时禁用下层触摸、隐藏无障碍子树并暂停行为。讯页保持原配色及高度，二楼底部安全区由其动画根节点处理，随二楼一起退出。
3. **保留组件仍会重建列表。** `FlatList` 的key含 `active`，切换覆盖状态会重建列表；滚动位置ref也被错误清零。本轮保留列表实例与真实滚动位置，列表行自己取消隐藏期间的手势和动画，旧完成回调不能在返回后误开会话；入口动画也增加请求标识，失活/恢复/卸载后的迟到完成回调不能再次打开二楼。沿用稳定responder，不改变方向或阈值。
4. **完成退出先复位。** 二楼旧回调先把progress归零，再调用父级关闭，可能在卸载前露回原位。本轮成功时保持退出终点，取消时恢复；请求标识拒绝失活、卸载及旧动画的晚回调。移除生产代码的 `NODE_ENV === 'test'` 捷径，旧逻辑测试显式覆盖减少动态效果的即时路径，新的动画测试通过受控完成回调覆盖正常/取消/重复及晚回调。

没有新增API、数据库迁移、原生桥、配置、依赖或权限声明。本轮没有付费供应商调用、创建生产生成任务或变更用户授权；无需部署后端来生效这些客户端修复。

## 修改文件

- 客户端：`MiaoxunRN/src/App.tsx`、`src/features/agents/agentPresentation.ts`、`src/features/messages/ThreadListScreen.tsx`、`src/features/second-floor/SecondFloorScreen.tsx`（后三项均相对 `MiaoxunRN/`）。
- 回归：`MiaoxunRN/__tests__/agentAccessConfirmation.test.tsx`、`appWorkspaceNavigation.test.tsx`、`secondFloorGestureContinuity.test.tsx`、新增 `threadListRetention.test.tsx`；`agentWorkspace.test.tsx`、`secondFloor.test.tsx`、`secondFloorPreferences.test.tsx` 显式设置减少动态效果测试环境（其余测试文件均相对同一 `__tests__/`）。
- 文档：本记录、`docs/handoffs/CURRENT.md`、`docs/README.md`、本日生产发布记录；既有预检文档修改原样保留，不算本轮新增实现。

## 测试证据与限制

- UI权限回归先5项预期失败，后4套74项通过；证据 `/tmp/miaoxun-ui-agent-scope-20261111/`。当前9项可添加Agent的声明scope覆盖已核对，内部检索专用scope未扩大为用户可授权范围。
- App铺底用例先因二楼期间找不到讯页而失败，修复后导航套9项通过：`/tmp/miaoxun-floor-underlay-{red,green}.log`。
- 列表保留4项先失败，关联3套24项通过：`/tmp/miaoxun-thread-retention-20261111/`。
- 独立复核进一步确认入口动画迟到回调：新增失活/恢复/卸载3例均先失败，入口请求标识修复后与铺底/二楼动画组合3套24项通过：`/tmp/miaoxun-entry-cancellation-20261111/`；新正常下拉仍可打开。
- 二楼动画新增4例，其中3例按预期先失败、取消原已正常；修复后4套60项通过：`/tmp/miaoxun-floor-exit-completion-{red,green}.log`。
- 最终冻结后 `MIAOXUN_DOTENV_ENABLED=false ./scripts/check-repository.sh` 退出0：RN100套1304项，Backend1136通过/376项环境门控跳过，Agents57、Admin52、Avatar29、检索Web4及类型/lint/格式/Web构建通过。最终日志 `/tmp/miaoxun-build61-device-followup-repository-check-final.log`；较早1301项日志保留为入口补回归前的检查点。本轮无数据库变更，未将门控跳过称为PostgreSQL集成通过；既有act和大chunk提示保留。
- `node scripts/miaoxun-development.mjs ios --build-only` 在构建前退出1：固定iPhone17为 `Shutdown`，无法只读取得现有正式App容器，保护脚本按约定中止。未启动、安装或覆盖Simulator App，未绕过保护门禁。日志 `/tmp/miaoxun-build61-device-followup-simulator-build.log`。本轮不能声称模拟器构建或新客户端真机通过。
- 文档本地链接116项无缺失，最终 `git diff --check` 通过；只读复核未发现本轮增量尚未修复的P1/P2/P3，实际原生视觉和帧率仍待新制品真机验证。
- 上述红绿/整仓/构建受阻日志及11项RN文件SHA已另存到仓库外 `/Users/gary/Library/Application Support/MiaoxunReleasePreparations/agent-lifecycle-20261111/device-acceptance-20261111T054018Z/`，结构化状态为 `summary.json`；只记录必要产品验收状态，无设备凭据或私人业务正文。

下一步先完成新修复的构建与客户端分发，再复验二楼退出和UI-Agent添加；漫画当前目录已由用户确认，后续应核对完整scope并由用户本人决定授权。真实漫画生成须先明确环境、次数、格数和费用范围，不能因本轮验收启动就自动调用模型。妙页卡片和各Agent执行能力继续分别验收。

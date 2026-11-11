# 二楼与妙页交互链路审查

2026-11-11。本记录以当前指定工作树源码和本轮自动化复现为依据；实际设备画面与触摸证据由当前交接单独汇总。JS 位移测试不能证明实体设备帧率、惯性、触感或真机流畅。

## 现有交互与设计边界

仓内没有 `AppSecondFloorPullLayer`。实际二楼入口是 `ThreadListScreen` 的稳定 PanResponder，`App.tsx` 在入口动画完成后以 `secondFloorOpen` 条件切换列表和 `SecondFloorScreen`。

- 入口仅在聊天 tab、单指起手位于列表顶部、没有全局内容操作菜单时捕获。默认下拉96pt或速度0.35，方向主轴须为另一轴的1.4倍；位移按0.72阻尼、最大150pt跟手，松手完成后用原生 driver 的180ms动画移出整页，再打开二楼。UI-Agent确认的偏好可改变合同允许的方向和参数；本轮未改阈值。
- 固定二楼返回区有独立 responder，默认上滑55pt或速度0.35；跟手退出进度最大0.25，松手成功使用160ms原生driver过渡，取消/不足则回弹。顶部返回按钮、底部返回入口与Android系统返回都可关闭，不要求用户必须会手势。
- 二楼普通页面的ScrollView自行处理滚动。仅当前活跃页面、单指起手已经在实测内容底部（含10pt误差）或内容短于视口，才允许另一轮上滑退出。普通阅读本轮滑到末尾不会立即触发退出。页面切换、后台失活、取消、多指和旧页面touch scope都有守卫。文件详情正文未挂载这套底边退出监听；文件列表才有，长正文阅读不受父级返回responder抢占。
- 妙页由 `MiaoTaskFeed` → `AgentWorkspaceCard` → `MiaoTaskCard` 形成同卡S0/S1/S2。参与者清单替换卡片正文，详情增高原卡片，外层列表继续纵向阅读；与《妙板块-状态效果与交互说明-20261102.pdf》第2–4页和既有11月5日/10日复核约定一致。没有改成分页轮播或第二张浮卡。
- 妙页横向手势起手超过8pt且横向为纵向1.25倍才获得轴锁；纵向先超过8pt后锁定阅读，不因随后横漂抢走列表。默认左右80pt/速度0.35、230ms，原生driver只移动正文，头像/菜单/底栏固定。S1/S2另有显式44pt参与者/展开/收起按钮，不依赖手势。
- 通用 `useStablePanResponder` 固定实例并在grant后冻结配置，保留轮询刷新期间的累计位移；失活或第二指取消本次触摸，不会在重新激活后复活旧release。

## 本轮复现与修复

1. **减少动态效果未贯通。** 妙页参与者/详情切换无条件触发LayoutAnimation和回弹，二楼入口无条件执行整页转场，参与者详情Modal固定slide；而仓库既有 `useReduceMotion` 要求跟随系统设置。三项卡片/入口回归和一项Modal回归先失败。本轮复用现有hook：减少动态效果时状态立即变化、自动转场/回弹即时落位、Modal使用none；用户自己拖动的跟手反馈仍保留，不更换手势或阈值。
2. **二楼返回中的回弹重抓会跳位。** 原入口新手指从当前36pt画面继续20pt时直接写14.4pt；原出口同样丢弃正在回弹的原生progress。回归使用真实渲染后的RN panHandlers/touchHistory，并延迟 `stopAnimation` 回执，两个用例均先失败。本轮grant读取当前原生位置为本次drag基点，回执未到时保留原帧，回执到后补上最新位移；释放/失活/卸载后丢弃旧回执，结束判定仍只用本次手指位移，不把旧动画位置计为已完成距离。
3. **隐藏新建按钮会失去二楼的无障碍替代入口。** 原代码只把“打开二楼”Accessibility action放在新建按钮；下拉启用但新建按钮被已确认偏好隐藏时，既没有该action，也不渲染普通入口。精确回归先失败。本轮在这种状态复用已有 `second-floor-fallback-entry`，保留其44pt最小点击区域、已确认文案和正常按钮行为。没有新增导航方案。

修改组件：`MiaoxunRN/src/features/messages/ThreadListScreen.tsx`、`src/features/second-floor/SecondFloorScreen.tsx`、`src/features/miao/MiaoTaskCard.tsx`、`src/features/workspaces/AgentWorkspaceCard.tsx`。相应回归位于 `MiaoxunRN/__tests__/secondFloorGestureContinuity.test.tsx`、`miaoCardState.test.tsx`、`threadUIPreferences.test.tsx`、`workspaceParticipantModal.test.tsx`。

## 验证与剩余判断

本轮还通过原生Simulator界面查看了仓库外既有隔离QA构建（Bundle `com.wangruoshi.miaoxun.collaborationQA20261110`，连接本机4395），不是本次修复的新候选或生产App。可见步骤及状态：①讯页真实对话列表可见；②调用新建按钮现有“打开二楼”无障碍动作后，二楼工具入口与返回区可见；③固定返回区操作可回到讯页；④妙页显示真实空态“还没有任务动态”，没有可用于卡片视觉验收的真实workspace。本轮未写任务或调用模型来填充页面。

精确原始截图位于仓库外 `/tmp/miaoxun-interaction-20261111-523yM6/02-xun-entry.png`、`03-second-floor-landing.png`、`04-return-to-xun.png`、`05-miao-real-empty.png`，已逐张检查。截图证明页面和空态可达，不证明连续触摸或本次修复效果。CUA下拉拖动未稳定识别成连续手势，另一次被解释为点击进入会话；因此不将该尝试记为下拉功能失败或通过。返回区操作也不能据此证明连续上滑动画流畅。实体真机、多卡三态和新候选仍待验收。

RED日志分别在 `/tmp/miaoxun-20261111-motion-red.log`、`/tmp/miaoxun-20261111-regrab-red.log`、`/tmp/miaoxun-20261111-participant-motion-red.log`、`/tmp/miaoxun-20261111-floor-entry-red.log`；对应GREEN日志使用同名 `-green.log`。最终组合日志为 `/tmp/miaoxun-20261111-gesture-suite.log`，类型/lint/格式日志为 `/tmp/miaoxun-20261111-gesture-{typecheck,lint,format}.log`。最终整仓检查与构建结果由CURRENT汇总。

从常见交互规范看，二楼属于层级导航，明确入口和返回按钮应是可发现路径，下拉/上滑作为快捷操作；妙页属于内容流，同卡展开且纵向阅读连续是适合保留的结构。当前代码已具备方向锁、触摸取消、明确按钮和同卡关系，本轮集中修复连续性与无障碍缺口。

仍需设备判断：列表整页移出后才挂载二楼是否有视觉衔接空隙；短页面55pt上滑退出是否容易与阅读混淆；120Hz/低电量或JS繁忙时跟手、快速连续重抓与取消、多卡展开后滚动位置、VoiceOver焦点及大字体。直接拖动依赖JS PanResponder，自动位移使用原生driver；源码结构不能给出实际帧率结论。把定制二楼改成完整交互式层级转场、调整阈值或改变短页退出方式属于新的UX决定，本轮没有擅自实施。

没有新增依赖、API、数据库迁移或权限，也没有生产数据写入、模型调用、部署、上传、提交或推送。

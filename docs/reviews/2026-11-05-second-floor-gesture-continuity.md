# 2026-11-05 二楼进出手势的连续性修复

本阶段仅修改本地客户端代码、测试和文档，没有生产数据写入、模型调用、提交、推送、部署或上传。下述触摸验证使用真实 RN PanResponder handler 与 touchHistory，但仍是 JS 层自动化，不替代实体 iPhone 验收。

## 已复现的根因

`ThreadListScreen` 每次渲染读取新的 `pullGesture` 对象，同时父组件的入口 callback 也可能变化；这些依赖使 `useMemo(PanResponder.create(...))` 创建新实例。RN 的累积 dx/dy 保存在实例闭包中，正在拖动时刷新会把已累计位移清零。

新增回归在旧实现上失败：先下拉130pt（阻尼后93.6pt），刷新相同页面，再下拉5pt，预期97.2pt，实际3.6pt。二楼固定返回区有相同新实例问题：以55pt阈值开始手势，中途偏好刷新到150pt后，原本应完成的手势被丢弃。

## 实现

- `MiaoxunRN/src/shared/gestures/useStablePanResponder.ts`：每个挂载实例保留唯一 PanResponder，最新回调供下次触摸使用，grant后冻结本次回调及配置；页面不可用会取消旧触摸，重新激活也不能复活旧释放事件；额外手指取消本次操作并回弹。
- `MiaoxunRN/src/features/messages/ThreadListScreen.tsx`：二楼入口改用稳定 responder，保留顶部判定、方向和速度阈值、跟手位移及现有入口动画。
- `MiaoxunRN/src/features/second-floor/SecondFloorScreen.tsx`：固定返回区域改用稳定 responder；该区域拖动时更新退出进度，未达阈值或取消时回弹。普通页面滚动与文件正文没有挂载此 responder。

现有文件正文排除出页面底边返回工具白名单；页面自己的 touch scope、单指与底边起手条件仍保留。此次没有新增“文件正文任意上滑就退出”的路径。

## 验证

新增 `secondFloorGestureContinuity.test.tsx`：旧实现前两项RED，修复后三项GREEN，覆盖入口轮询续拖、返回配置快照和返回区域跟手位移。新增 `stablePanResponder.test.tsx` 三项，覆盖页面离开再恢复后旧释放无效、第二指触达立即取消且后续移动/释放不重复取消、disabled分支连续release/terminate仅取消一次。

```sh
cd MiaoxunRN
npm test -- --runInBand stablePanResponder secondFloor secondFloorPreferences appWorkspaceNavigation miaoCardGestureContinuity
npm run typecheck
./node_modules/.bin/eslint src/shared/gestures/useStablePanResponder.ts src/features/messages/ThreadListScreen.tsx src/features/second-floor/SecondFloorScreen.tsx __tests__/secondFloorGestureContinuity.test.tsx __tests__/stablePanResponder.test.tsx
```

上述定向6套67项全部通过，无跳过；TypeScript、所改文件ESLint和Prettier检查通过。整仓检查与完整构建由主任务统一执行。实体设备仍需验收跟手、回弹、二楼进出速度、正文阅读不误退；不得把这里的 JS 位移断言写成真机通过。

## 另发现的语音生命周期缺口

聊天点按曾通过 `recognizeSpeechOnce()` 丢弃授权和识别的 cancel 句柄，离开聊天时 cleanup 只能取消长按会话；已向主任务报告，主任务统一接管 `useChatSpeech` 修复。此处不重复修改语音代码，也不以替身文本认定原生麦克风验收完成。

主任务已将妙页手势接入同一通用hook，妙页专属hook仅保留方向锁和body位移，避免重复维护实例/配置快照。复用后连续性组合3套9项通过；只读复核没有发现回调快照回退或纵向锁丢失。仍不代表原生多指或实体动画验收。

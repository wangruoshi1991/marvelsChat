# 2026-11-05 聊天语音输入生命周期修复

## 当前结论

聊天页的点按和长按语音已统一持有权限准备、麦克风识别的取消句柄。返回聊天上一层、进入 Agent 授权页、卸载、切换会话/账号和进入后台时取消当前输入；旧会话迟到的结果、错误和 finally 不再影响新会话。识别内容进入可编辑输入框，仍需用户点击发送。

本轮完成 RN 源码与自动化验证，未进行实体麦克风、系统权限弹窗和锁屏录音验收，也未修改原生桥、部署或上传安装包。

## 原问题和修复入口

- 原点按入口调用 `recognizeSpeechOnce()`，该便捷函数只返回 Promise，聊天页拿不到权限准备和识别的取消句柄。旧卸载清理只覆盖长按入口。
- 原长按链路用共享 refs，旧 Promise 的 finally 会无条件清空 refs 和忙状态，可能干扰新一轮识别。
- 新 `MiaoxunRN/src/features/messages/useChatSpeech.ts` 用独立会话对象识别当前输入，捕获 thread/token，并在每次回调前校验当前所有者、挂载状态和后台状态。
- 权限准备时松开长按会取消准备；权限结果随后返回也不会再开启麦克风。
- AppState 的 `background` 会取消输入；系统权限弹窗可能触发的 `inactive` 不作为取消条件。
- `MiaoxunRN/src/features/messages/MessagesScreen.tsx` 接入统一 hook，返回和进入授权页时立即取消。点按最终结果合入当前草稿，长按中间结果/最终结果更新本轮草稿，不自动发送。
- 同步 active ref 阻止同一帧重复启动，旧会话 finally 只允许清理它自己的活动记录。

## 验证

在 `MiaoxunRN/` 执行：

```sh
npm test -- --runInBand chatSpeech chatContentActions speechToText
npx tsc --noEmit
npx eslint src/features/messages/MessagesScreen.tsx src/features/messages/useChatSpeech.ts __tests__/chatSpeech.test.tsx __tests__/chatContentActions.test.tsx
npx prettier --check src/features/messages/MessagesScreen.tsx src/features/messages/useChatSpeech.ts __tests__/chatSpeech.test.tsx __tests__/chatContentActions.test.tsx
```

结果：3 套 35 项测试通过；TypeScript、定向 ESLint/Prettier 通过。根目录 `git diff --check` 通过。

新增 hook 测试覆盖卸载时等待授权、切换会话/账号、进入后台、权限弹窗 inactive、旧会话 finally、等待授权时松手，以及重复开始和迟到中间结果。实际 `ChatScreen` 测试验证识别结果只进入草稿、显式发送才调用发送回调，以及点按等待授权时卸载可取消。

测试仍打印 `chatContentActions` 既有 `useAITasks` 异步状态更新未包在 act 的警告，未屏蔽此警告。上述测试使用受控语音服务/原生模块替身验证生命周期，不代表实体麦克风已验收。

## 后续验收

- 新客户端构建后在 iPhone 验证首次授权允许/拒绝、点按识别、长按松手、草稿编辑后发送。
- 验证返回、进入授权页、切换账号、锁屏/后台后麦克风及时停止，回到聊天无旧草稿注入和旧错误提示。
- 验证长按快速连续开始/结束、权限弹窗期间松手和识别自然结束，不出现忙状态卡住。
- 无后端部署和数据库变更；此修复需要后续客户端构建/分发才会进入现有设备安装包。

# 2026-11-13 聊天键盘模拟器实测与修复

用户要求在模拟器实际输入、换行、切换表情并验证发送，避免只依赖描述和组件测试。本轮真实复现并修复了“键盘弹出后最新回复被遮挡”和“自动换行长文始终保持单行高度”两处问题；随后获单独授权，在现有账号的妙讯管家聊天发送一次指定测试文字，真实回复为“收到”。修复仅在本地源码和模拟器 Debug 构建中，未进入此前上传的 Build64。

随后根据用户提供的输入栏参考图复核并收敛布局。用户进一步澄清参考图的结构是：快捷指令固定在上方横向栏；下方单行依次为妙猜猜、语音、输入框、表情和更多。此前把输入框拆成独立上行、把快捷指令收进更多的实现被判定为结构不符，本记录以最新修正为准。

## 环境与操作范围

- 工作区：`/Users/gary/.codex/worktrees/admin-lifecycle-release/marvelsChat`；HEAD `15e72691b02dead20777b77b00f3846adc48d55d`，分支 `codex/ui-agent-candidate-20261105`。保留进入时 CURRENT 与上一阶段反馈记录的未提交修改。
- 正式入口 `node scripts/miaoxun-development.mjs ios`，固定 iPhone17 / iOS26.5，正式 Bundle `com.wangruoshi.miaoxun`，原位更新既有 App，保留登录与聊天。没有创建替代 QA App 或设备。
- 参考布局复核最终构建回执：`~/Library/Application Support/MiaoxunDevelopment/1139656e744d/builds/2026-11-13T08-03-04-562Z/build.json`；`installed=true`、`launched=true`、版本 `1.0 (63)`。实看截图保存在仓外 `/tmp/miaoxun-composer-final-chat.png`。该回执仍是 Debug Simulator，不是 TestFlight 或真机证据。
- 最终构建回执：`~/Library/Application Support/MiaoxunDevelopment/1139656e744d/builds/2026-11-13T06-29-24-636Z/build.json`，`installed=true`、`launched=true`；构建前后源码摘要相同，为 `027af5925793924889b5015f011f752e4cbbf64ac66b5d4be4443ee920bbfb26`。JS 摘要 `9da5265ce82f55f9af0297a9a800b95d2acbb4966da02e1b019829a75ebec742`。
- 此为 Debug Simulator 构建，源码构建号仍63；不是 TestFlight63或64的验收。本轮未更改构建号、API origin、ATS、原生桥、依赖或权限。
- 连接正式 API。用户明确批准仅在妙讯管家发送一次指定文字并承担一次文字模型费用；实际仅点击发送一次，没有重试、创建漫画任务、生图、确认任务或发布动态，没有替用户授权。

## 真实复现与根因

### 键盘遮挡最新回复

短聊天在未打开键盘时能完整看到最新回复，打开键盘或从表情面板返回键盘后，回复底部被输入区域遮住。仅调整“是否接近底部”的判断后两次实测仍失败。

临时尺寸诊断确认：原全局 `Keyboard.scheduleLayoutAnimation` 下，Fabric 布局回调已报告缩小后的可见高度，但原生 ScrollView 滚动事件仍携带旧高度；`FlatList.scrollToEnd` 使用旧视口，算出的目标仍为0。单变量取消全局 layout animation 后，同样操作首次通过；随后移除全部临时诊断，采用局部动画修复，重新构建和验收。

最终只动画聊天区域的底部间距，使用键盘事件时长及标准 easing；减少动态效果或无有效时长时直接到位，可中断并在卸载时停止。键盘间距与原 native-driver 侧滑分别使用两层 Animated.View，避免混用驱动。UIKit 私有键盘曲线没有宣称可在 JS 精确复现。

列表跟随保留布局变化前的用户意图，以真实 `onLayout` 可见高度和 `onContentSizeChange` 内容高度计算 `scrollToOffset`。测量未就绪时等待真实回调；用户拖动取消跟随，动画帧执行前再次检查，浏览历史时不强制追到底部。会话切换清理内容与滚动状态，防止旧测量影响新会话。

### 自动换行长文不增高

通过软件键盘逐键输入一个大写 Q 和150个小写 q，实际已自动换行，但编辑框仍保持44点。此前手动换行的估算高度掩盖了自然换行问题。

当前 RN0.87/Fabric 下，固定输入高度并等待 `onContentSizeChange` 再增高形成测量闭环。最终移除固定 height、估高函数、inputHeight state 和反向写高度的回调，交由原生文本布局在共享 `minHeight=44 / maxHeight=132` 范围内自然增高，达到上限后原生内滚动保持光标可见。没有新增隐藏文本测量副本。

## 实际 UI 验收

| 操作 | 实测结果与证据 |
| --- | --- |
| 空输入打开软件键盘 | 修复前最新回复遮挡；修复后回复完整可见，`03-before-emoji-keyboard-loses-latest.png`、`04-fixed-keyboard-latest-visible.png` |
| 软件键盘逐键输入长英文 | 修复前单行不增高；修复后自然换行并增至多行，`05-wrap-height-before.png` |
| 长中文草稿 | 最终构建达到132点高度后内滚动，末尾标记及光标可见；`08-final-long-text.png`。该长文通过无障碍 setValue 写入，不作为拼音输入法证据，未发送 |
| 真实中文输入法与换行 | 软件键盘点按 jianpan，选择“键盘”候选后换行成功；与长文 setValue 分开验证 |
| 表情 → 软件键盘 | 插入😊后返回键盘，草稿保留，无头像插入，最新回复可见；`06-fixed-emoji-keyboard.png`，最终构建再次复验 |
| 更多功能 → 输入框 | 面板正常替换键盘，返回输入时面板消失、草稿保留，没有面板叠在键盘上；最终构建实测 |
| 清空长文 | 输入框缩回一行；最终发送前已替换为授权文案，没有发送长文或表情草稿 |
| 唯一一次真实发送 | 发送前核验精确文案“你好，键盘测试，请只回复收到。”，点一次发送；立即清空缩框、收起键盘，先显示“发送中”，随后真实回复“收到”，消息和回复可见；`09-final-before-authorized-send.png`、`10-final-sending-keyboard-dismissed.png`（后者截图时已收到回复） |

当前聊天历史较短，没有造数据填满历史。本轮不声称长历史拖动、VoiceOver、大字号、减少动态效果系统设置、Android、真机或120Hz帧率已实际验收；历史跟随和减少动态效果有回归测试。未录像或测量帧时间，不以“完全丝滑”作为结论。

所有截图、尺寸诊断与交付回执保存于仓库外受限目录：`~/Library/Application Support/MiaoxunReleasePreparations/keyboard-simulator-20261113/`。尺寸诊断不含正文、账号或令牌；不将既有聊天正文纳入仓库文档。

## 检查与修改文件

定向测试4套70项通过：`chatComposerEditing`、`chatContentActions`、`chatFollow`、`keyboardGeometry`。覆盖布局事件顺序、过时原生高度、首个过时视口、内容测量未就绪、真实拖动取消、会话切换、帧执行前用户意图、局部键盘动画、减少动态效果、清理和 native-driver 分层。独立复验日志 `/tmp/miaoxun-keyboard-final-review-20261113.log`。

最终 `MIAOXUN_DOTENV_ENABLED=false ./scripts/check-repository.sh` 退出0，日志 `/tmp/miaoxun-keyboard-repository-delivery-20261113.log`，显示 `All repository checks passed`：

| 模块 | 通过 | 跳过 |
| --- | ---: | ---: |
| RN | 111套 / 1397项 | 0 |
| Backend | 1149项 | 408项环境门控 |
| Agents | 59项 | 0 |
| Admin | 52项 | 0 |
| Avatar Web | 29项 | 0 |
| 媒体检索 Web | 4项 | 0 |
| Runtime打包 | 1项 | 0 |

语法、类型、lint、格式和各 Web 构建检查通过。仍有40条 React 测试 act 提示及 Admin 大 chunk 提示；无测试失败或原生动画样式警告。408项跳过不计为 PostgreSQL 验收，本轮没有数据库或后端变更。`git diff --check` 通过。

源码与测试仅六份：

- `MiaoxunRN/src/features/messages/MessagesScreen.tsx`
- `MiaoxunRN/src/features/messages/useChatFollow.ts`
- `MiaoxunRN/src/features/messages/ChatComposer.tsx`
- `MiaoxunRN/__tests__/chatContentActions.test.tsx`
- `MiaoxunRN/__tests__/chatFollow.test.tsx`
- `MiaoxunRN/__tests__/chatComposerEditing.test.tsx`

文档同步本记录、CURRENT、docs/README及上一阶段反馈记录。MessagesScreen 的较大 diff 主要来自新增动画容器后的 JSX 缩进，可用 `git diff --ignore-all-space` 查看实质修改。

### 参考图布局增量复核

本轮在上述源码基础上新增并先执行布局回归，再调整 `ChatComposer`：定向 `chatComposerEditing`、`chatContentActions` 共67项通过；`typecheck`、RN lint、Prettier、`git diff --check`通过。重新运行整仓检查仍退出0，RN计数为111套/1400项，其他模块通过数与上表一致，408项Backend环境门控仍不计PostgreSQL验收。

最终整仓复跑日志为 `/tmp/miaoxun-composer-reference-check-final.log`，末尾显示 `All repository checks passed`。

此前模拟器观察到的是已被用户否定的旧结构，不能作为本轮最终布局证据。

### 按用户澄清补正结构尺寸

用户随后明确快捷指令应常驻上方，输入框应与四个操作控件同一行，空草稿不显示独立发送按钮。因此本轮先新增并运行结构回归，确认旧实现按预期失败，再将 `ChatComposer` 改为参考图的单主行结构：快捷指令常驻上方，输入框位于语音与表情之间，键盘 Send 作为提交入口。输入框继续交由原生在44–132pt内自然增高，更多面板继续承载附件工具。

固定 iPhone17/iOS26.5 模拟器已重新安装本轮源码，回执为 `/Users/gary/Library/Application Support/MiaoxunDevelopment/76237d6f8986/builds/2026-11-13T08-53-46-537Z/build.json`。实屏核对空输入、键盘打开和长文草稿：快捷指令位于输入栏上方并带分隔线；灯泡、麦克风、输入框、表情和更多在同一行；系统键盘显示发送箭头；长文自然换行达到多行时四个操作控件仍固定，清空草稿后恢复一行。临时草稿未发送。该证据是 Debug Simulator，不替代真机/TestFlight验收。

本轮新增布局回归在旧实现上按预期失败；修正后 `chatComposerEditing` 与 `chatContentActions` 共70项通过，typecheck与Prettier通过。当前仍未提交、推送、部署或上传。

## 发布边界与下一步

上一阶段后端15e7269部署及Build64上传保持原记录；本轮没有再次部署、后台发布、提交、推送、归档或上传。Build64不包含本轮键盘修复，Apple合规及分发由用户处理，当前可安装状态未复查。

下一步在明确新客户端发布范围后，将本轮源码纳入新包，再用真机复验长文、中文候选、表情、发送收键盘及返回手势。漫画新消息、聊天内确认/成图、历史协作分类、我的漫画布局和动态发布仍分别验收；这一次管家文字回复不能替代漫画真实生成验收，也不能将一次模型授权重复使用。

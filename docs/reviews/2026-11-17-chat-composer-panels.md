# 2026-11-17 聊天输入与扩展面板续修

本阶段使用发布树`/Users/gary/.codex/worktrees/admin-lifecycle-release/marvelsChat`，HEAD为`d04221f7f07c05c1ae24789c087eb9d03e7ed193`。保留开始时已有的CURRENT和只读验收文档修改；未编辑Desktop旧分支，未提交、推送或分发。

## 确认后的交互

- 主行：语音/键盘切换、弹性输入框、表情、更多。妙猜猜是更多第一项，已有草稿仍可进入；复用既有本地助理入口，打开不自动提交模型。
- 系统键盘右下角执行发送；表情和更多面板底部也可发送。用户明确确认此方案替换Return换行；多行粘贴仍保留。原生submit和面板按钮复用空内容、发送中、权限、附件就绪门禁，未自动扩大权限或自动重试。
- 表情、本人收藏和更多共用按窗口计算的196–280pt面板，标题44pt，内容可滚动；短窗口有发送按钮时仍保留至少完整一行表情。单一分类选中，连续选择表情不关面板。保留真实收藏加载、错误、重试和上传状态。
- 主行动作统一44pt触达、底部对齐；外层承载边框、圆角和留白，原生文本视口22–110pt，总高44–132pt后内部滚动。没有新增contentSize→JS高度循环、原生补丁或依赖。

参考实读[GiftedChat InputToolbar](https://github.com/FaridSafi/react-native-gifted-chat/blob/master/src/InputToolbar.tsx)和[Composer](https://github.com/FaridSafi/react-native-gifted-chat/blob/master/src/Composer.tsx)：底部对齐、独立扩展区和原生文本测量。只复用交互原则，没有复制其业务逻辑或引入库。

## 根因及修复

旧主行常驻妙猜猜占用宽度，更多缺少该入口；文字草稿又会把更多替换成发送。新主行始终保留更多，发送移到键盘/面板。

旧表情和收藏面板随内容高度变化，收藏与常用分类可同时选中；插表情立即关闭面板并聚焦键盘。现用同一有界面板和分类ID，插入后只恢复必要光标。独立审查又捕获了延迟focus关闭新面板、延迟setSelection覆盖用户新选区，均先以行为测试复现，再增加取消/当前选择校验。

模拟器长文达到上限后，重开软件键盘会裁掉末行下半；原生Scroll Down能恢复，证明可滚范围存在。把装饰与留白移出UITextView滚动视口后，同场景末行与光标完整显示。没有通过键盘DidShow强制改选区，避免增加中文组合输入副作用。

原生Send旧路径忽略`nativeEvent.text`，快速输入后可能从上一帧draft发送旧文字，原生提交空值也会误发旧草稿。集成测试先复现2项失败，修复为显式把原生完整文本传到`MessagesScreen.send`并以该文本校验门禁；面板底部显式传当前draft。新增空渲染草稿但原生已有文字的情形，三种竞态均通过，父级同步发送锁保持防重复。该修复不强制改IME选区，中文候选直接Send仍未作设备提交验收。

二楼固定返回区原来直接onPress关闭；未达到滑动接管阈值的轻移可仍触发Pressability点击。增加4pt移动取消锁，保留真实点击和无障碍返回。没有扩大修改内容区松手退出的动画策略。

## 修改文件

| 文件 | 作用 |
| --- | --- |
| `MiaoxunRN/src/features/messages/ChatComposer.tsx` | 主行、原生发送、焦点/选区、共享面板接线、输入视口 |
| `MiaoxunRN/src/features/messages/MessagesScreen.tsx` | 接收原生提交文本，保留上下文、附件、权限和同步防重门禁 |
| `MiaoxunRN/src/features/messages/ChatComposerPanels.tsx` | 表情/收藏/更多结构、滚动、主题、面板底部动作 |
| `MiaoxunRN/src/features/messages/chatLayoutStyles.ts` | 底部对齐及零内边距原生文本视口 |
| `MiaoxunRN/src/features/second-floor/SecondFloorScreen.tsx` | 返回区轻移取消点击 |
| `MiaoxunRN/__tests__/chatComposerEditing.test.tsx` | 41项编辑、发送、面板、焦点、选区和短窗口回归 |
| `MiaoxunRN/__tests__/chatContentActions.test.tsx` | 既有会话、附件、助理与发送集成按新入口复验 |
| `MiaoxunRN/__tests__/chatAttachmentTools.test.tsx` | 面板发送与附件状态门禁 |
| `MiaoxunRN/__tests__/assistContextFlow.test.tsx` | 原生发送不绕过上下文权限 |
| `MiaoxunRN/__tests__/secondFloor.test.tsx` | 6项轻移、多指、取消与正常点击回归 |
| `MiaoxunRN/README.md`、`docs/README.md`、`docs/handoffs/CURRENT.md` | 当前行为、证据、边界与交接 |

没有修改API、数据库schema、Agent声明、发布目录或原生业务合同。

## 验证证据

- 行为先红后绿：初始面板3项RED见`/tmp/miaoxun-composer-panel-red-20261117.log`；草稿More缺失RED见`/tmp/miaoxun-composer-draft-more-red-20261117.log`；native Send改动前10失败/30通过见`/tmp/miaoxun-native-send-red-20261117.log`。focus和selection竞争的RED保留在工具输出`a26e78`、`409bf5`，没有另造日志文件。最终composer41项通过，整仓覆盖全部新断言。
- 原生文本竞态RED日志`/tmp/miaoxun-native-send-snapshot-red-20261117.log`：完整新文字误发旧draft、空原生文字误发旧draft，共2项失败。修复并增加空渲染草稿用例后，最终整仓检查覆盖三种情形。composer的多行及两个面板发送同时断言实传完整文字，协作测试改传真实形状submit event，不增加运行时空事件兼容。
- `MIAOXUN_DOTENV_ENABLED=false ./scripts/check-repository.sh`最终退出0：RN122套/1534项；Backend1153通过/410个专用PG门控跳过；Agents59、Admin52、avatar-web29、media-retrieval-web4。类型、lint、格式和Web构建通过。日志`/tmp/miaoxun-composer-repository-check-final-20261117.log`；`git diff --check`通过。原有异步act及其他警告未被屏蔽，PG跳过不算数据库通过。
- 独立隔离PG55443，001–061首次应用及重放，附件7/生命周期9/收藏7/群聊15共38项通过；最终users=0，临时PG停止。回执`/tmp/miaoxun-attachment-acceptance-20261117-jo7af_3t/acceptance.json`。本轮没有后端代码修改，不重复扩大数据库测试范围。
- 最终源码安装：`node scripts/miaoxun-development.mjs ios`成功，固定iPhone17 / iOS26.5，本地Debug1.0(63)、正式Bundle/API，非TestFlight66。回执`/Users/gary/Library/Application Support/MiaoxunDevelopment/1139656e744d/builds/2026-11-17T09-34-41-054Z/build.json`：installed/launched=true，构建前后源码摘要均为`ef8cbe9cd76d87cd5c5226619baaddd56293276e0f667f8e953e5f521ce1e75f`，随后只补本文和交接等文档。
- 实屏：主行无发送、原生Send键出现、面板发送位于底部；More首项妙猜猜可打开并返回保留草稿；连续插表情、收藏分类单选、面板高度一致；长文自动换行/最大高度/重开键盘末行完整；语音模式切回实际弹出软件键盘且草稿保留；中文拼音候选可确认进入草稿。未录音、未上传素材、未新增Agent授权；最后测试草稿已清空，停留新版更多面板。
- 原生提交修复包安装后再次实屏确认Send键、长草稿末行、插表情不关闭面板、More首项和底部发送；未执行Return或发送动作，所有草稿已清空，停留More面板。CUA一次截图连接超时，重新绑定后继续核对；中文输入法下自动ASCII输入会形成候选，因此不将自动输入字符串一致性写成中文IME提交通过。

## 操作偏差与剩余边界

自动输入工具在native Send启用后把多行测试中的换行转换为键事件，意外向正式API提交1条测试消息并收到1条文字模型回复。已当场向用户说明，这超出本轮只读/本地验收范围；不能写成“未发送、未付费调用”，也不作为已获授权的生成验收。未擅自删除生产记录。随后仅测试不含Return的本地草稿和中文候选，结束时已清空草稿；真实提交测试以后必须使用隔离QA。

二楼轻移取消由回归证明，当前自动化未取得可信连续触摸或动画帧率证据；不能宣称真机流畅。短横屏有界布局由单测覆盖，设备旋转/大字体及中文组合态直接按Send仍需设备复验；此次只确认候选进入草稿，未再次提交。

普通附件保存后独立在系统Photos确认仍待补；漫画/UI Agent当前账号真实执行、Android原生编译、生产061、Build66上传及实体iPhone验收均独立保留。Android本机缺Java的问题未在本轮解决。没有新增生产部署、后台发布、迁移、TestFlight操作或提交推送。

# 2026-11-16 输入栏换行、发送与客户端发布准备

## 来源与范围

发布工作树是 `/Users/gary/.codex/worktrees/admin-lifecycle-release/marvelsChat`，分支 `codex/ui-agent-candidate-20261105`、HEAD `15e72691b02dead20777b77b00f3846adc48d55d`。本轮保留所有已有未提交修改。桌面目录属于另一条较旧开发分支，其磁盘Build57与测试结果不能替代本工作树；未将桌面源码搬入发布工作树。

11月13日Build64已上传，归档通过参数覆盖磁盘工程的63；64不包含之后的键盘/输入布局修改。本轮不重复后端部署、迁移、产品发布或用户授权。本轮新增生产源码仅 `ChatComposer.tsx`，其余既有键盘/滚动修改继续纳入客户端候选。

## 本轮修复

最终参考图结构已经是上方常驻快捷胶囊，下方依次为妙猜猜、语音、输入框、表情和更多。但最后稿设置 `multiline + submitBehavior="submit"`，只用键盘发送，没有可见发送按钮。普通Return不能换行，表情/语音草稿也要重新叫出键盘才可发送；旧测试恰好将该行为锁定。

现在Return为原生换行，无隐式提交回调；纯空白草稿保留更多，非空草稿或发送中在同一位置显示发送/发送中。表情入口始终保留，不新增工具行。点击发送关闭面板，沿原 `onSend` 和服务端合同执行；空白、发送中及授权警告均拒绝，父级 `submitting.current` 同步防连点仍在。输入继续由原生在44–132pt自然增高并内滚动。

本轮增量文件：

- `MiaoxunRN/src/features/messages/ChatComposer.tsx`
- `MiaoxunRN/__tests__/chatComposerEditing.test.tsx`
- `MiaoxunRN/__tests__/chatContentActions.test.tsx`
- `MiaoxunRN/__tests__/assistContextFlow.test.tsx`
- `docs/README.md`、`docs/handoffs/CURRENT.md`、本记录。

已有未提交 `MessagesScreen.tsx`、`useChatFollow.ts`、`chatLayoutStyles.ts`、`chatFollow.test.tsx` 与11月13日记录均保留，不能计为今天重新实现。

## 自动化与模拟器

RED：指定3套先失败（17失败/100通过），实际原因是Return仍为send及缺少发送入口。GREEN：5套124项通过。RN typecheck、指定文件ESLint及Prettier通过。独立审查未发现阻断本地归档的新增业务缺陷；额外恢复父级权限回调直接调用断言，`assistContextFlow` 43项再通过。

`MIAOXUN_DOTENV_ENABLED=false ./scripts/check-repository.sh` 最终退出0：RN111套1408项，Backend1149通过/408环境跳过，Agents59、Admin52、Avatar29、检索Web4、打包1；各类型/lint/格式/构建通过。第一次因测试局部变量遮蔽触发零警告门禁，修正后完整重跑。408环境跳过不是PG验收；既有React测试act及Admin大chunk提示未作为通过证据隐藏。日志位于仓库外 `~/Library/Application Support/MiaoxunReleasePreparations/chat-composer-20261116/`。

通过正式日常入口 `node scripts/miaoxun-development.mjs ios` 原位安装固定iPhone17/iOS26.5，正式Bundle/API保持。回执：`~/Library/Application Support/MiaoxunDevelopment/1139656e744d/builds/2026-11-16T01-41-11-616Z/build.json`，installed/launched均true，构建前后源码摘要 `a6b7a60f910441139ac21d72367b7fd1a3a752bc45b4d3228657a6330a0d5d99` 一致。

| 操作 | 实际结果 |
| --- | --- |
| 空草稿打开聊天 | 快捷胶囊在上，灯泡/语音/输入/表情/更多同一主行 |
| 软键盘Return | 文案保留并新增换行，无新消息；截图 `01-native-return-newline.png` |
| 长中文草稿 | 达高度上限后内滚动，末尾标记与光标可见；截图 `02-long-text-caret.png`。使用无障碍setValue，不作为拼音输入证据 |
| 长草稿打开表情并插入 | 草稿保留，表情插末尾，返回输入焦点且发送入口仍可见 |
| 清空/更多 | 缩回一行，恢复更多；更多面板和软键盘互斥，未触发附件上传或原生权限 |
| 拼音逐键输入jianpan | 点击“键盘”候选后按软键盘换行，草稿为“键盘\n”；截图 `03-chinese-candidate-newline.png` |
| 清理 | 所有测试草稿已清空，面板关闭；截图 `04-empty-final.png` |

本轮没有发送消息、调用模型、生图、重试生产任务或代用户授权。11月13日一次真实管家文字发送不扩展为本轮许可。模拟器不等于真机、Android或120Hz流畅度，也不能证明本轮实际发送后键盘效果已再次验收。

## 今日线上与Apple只读状态

2026-11-16公开GET `/api/health`、`/api/ready` 均200，ready数据库connected/migrationsCurrent=true；`/api/agents`有9项，漫画0.1.6/UI-Agent0.1.0。未读取私人业务内容、未调用受保护后台接口或将目录元数据当作全部模型能力已验证。

用户重新登录后，通过正常Chrome TestFlight页面先实读最高1.0（64），上传记录“完成”；64当时仍“缺少出口合规证明”，群组为空；63正在测试。读取回执 `chat-composer-20261116/apple-readonly.json`。此为上传前快照，不能代表后续Build65处理结果。

## 本地Build65归档与独立核验

最后一次完整整仓检查日志为 `chat-composer-20261116/repository-check-frozen.log`，退出0，RN111套1408项；包含补回父级权限直接回调防护后的最终测试。此后生产源码与测试未再修改，后续只补文档。

冻结529项实际RN/shared/scripts/root输入（含非忽略新增文件），源摘要 `5caa3c1df67ec95161b98f938a003a11d4acd468b3d6bf22ad35228a09d39e11`；同时冻结HEAD/tree、index/scoped diff、被忽略本地构建配置摘要和43,220份依赖文件、目录及链接记录。只保存hash，不打印本地配置内容。没有提交、推送、改磁盘工程Build63或执行clean。

使用原生 `xcodebuild archive`、`CURRENT_PROJECT_VERSION=65`、Release/正式API生成：

`~/Library/Application Support/MiaoxunReleasePreparations/chat-composer-20261116/build65/MiaoxunRN-1.0.65.xcarchive`

命令退出0且 `ARCHIVE SUCCEEDED`，未使用provisioning-update参数。构建前后529项源码、路径集合、HEAD/index/diff及本地配置完全一致。

原组合检查保留失败回执：`build65/archive-verification.json` 为 `passed=false`，原因是校验器把Hermes tar中`.`的0700权限错误套在解包容器根上。不能将此原记录改成成功，也未修改校验器或重建归档。补充 `build65/dependency-transition-independent-audit.json` 严格确认：根目录记录前后均0755且不在41项变化中；冻结替换脚本先mkdir再 `tar -xf -C`，独立一次性fixture证实本机bsdtar保留既有-C根权限。三组依赖所有其他集合/字节/链接/权限及标记均与事前冻结tar一致，41项变化全部解释，未知变化为0；当前56,790项依赖记录仍匹配归档后快照。

单独 `build65/product-verification.json` 为 `passed=true`：正式Bundle、1.0（65）、API、Team、ATS禁止任意载入、arm64、严格codesign、App dSYM UUID及本次Metro源码重新编译Hermes后的逐字节匹配通过。原始归档未修改。签名profile仍为Development（get-task-allow=true），不当作App Store分发签名或上传就绪已被Apple确认。

React、ReactNativeDependencies及hermesvm仍缺少匹配框架dSYM，Xcode Organizer上传完成页为这三项报告`Upload Symbols Failed`；会影响相关框架的崩溃符号化，App自身符号完整。未挪用不匹配符号、修改归档或隐藏警告。

## Build65 上传与 TestFlight 当前观察

用户确认后，使用正常Xcode Organizer上传已冻结并独立核验的现有归档，没有重新构建。Organizer最终明确显示`Uploaded to Apple`及`Submission Status: Uploaded`，版本1.0、Build Number 65；上传完成时间界面为Today at 10:36。分发摘要显示Cloud Managed Apple Distribution证书、iOS Team Store Provisioning Profile，`get-task-allow=false`。上传完成不等同于安装或真机验收。

用户已登录的正常Chrome TestFlight页面刷新后，Build65行当前显示“正在测试”、90天后过期，并有两个`yunzhi`组标记；邀请、安装和使用次数为横线。初次刷新Build65曾显示“缺少出口合规证明”且无组，之后页面状态变化。本轮没有主动填写出口合规、选择测试组或点击“通知测试员”，因此不推断该状态变化的操作者，也不将“正在测试”当作手机已安装。

需要特别核对一项TestFlight页面操作：打开Build65详情后，尝试返回列表时页面无障碍编号已经变化；随后的页面状态显示“测试内容”弹窗正在提交。弹窗中可见测试内容`1111`，且“自动通知测试员”复选框为选中。提交结束后页面列表显示Build65“正在测试”和两个`yunzhi`组。无法确认该提交是否由陈旧节点操作触发，或是否实际发送通知；没有主动编辑文本或触碰通知/组控件。此状态已停止进一步操作，需账号所有者检查测试员通知或TestFlight活动记录；不要基于此文档断言通知已发送或未发送。

## 下一步与验收边界

本轮源文件/依赖冻结、本地Release归档和制品独立核验已经完成；原失败门禁和补充证据同时保留。不要求为了原生xcodebuild调用后端runtime打包器的clean门禁，也未更改旧辅助工具门禁。

Build65已由Organizer上传，TestFlight页面目前显示“正在测试”；通知状态待账号所有者检查，手机安装与功能真机验收分别待续。后续先验输入与漫画完整链路，再验UI偏好预览→本人确认→持久化、二楼退出与妙页卡片。付费漫画/文字调用、生产任务或动态发布需要新的具体范围，不借用历史一次授权。

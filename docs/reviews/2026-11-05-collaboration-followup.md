# 2026-11-05 协作验收跟进

最新用户要求：开发阶段token/费用限制暂不启用，只保留可配置入口，优先验证功能。按此要求执行的新样例已完成7/7可信回执和完整应用/API闭环，见末尾“开发阶段继续执行”；以下前两次运行结果保持历史事实。

本阶段修复妙页S2只显示成果元数据的缺口，未修改生产模型配置。第二个隔离样例历史结论是三专业完成、汇总无效；最新开发样例已完成真实模型和应用API断言，RN与设备显示仍须单独验收。

## 45秒截止的实际边界

产品 [模型配置](../../backend/src/agent-model-config.js) 默认普通30秒、协作180秒。[运行时](../../backend/src/agent-runtime.js) 的 coordinate/contribute（含text.synthesize）读取协作值，且不能超过执行deadline剩余值；本次未读取线上私有环境，因此不声称线上有效值。

上次仓库外harness把两个产品环境值统一设为45000，gate也有独立45秒定时器，聊天HTTP等待为该值+10秒。原生code20仍不能区分哪层定时器先触发；这能解释本次隔离截止，不能证明供应商或线上产品存在相同超时。见[首次真实样例](2026-11-05-real-collaboration-eval.md)。

第二样例仅改变统一等待参数为180000，同时影响上述普通/协作/gate/HTTP窗口，不能称只调整workspace或完整复刻产品30/180默认。8请求/1200输出/10分钟/字节上限/无重试不变；整体截止仍可能先到，模型非确定性及诊断版本变化限制两例比较。

## RN修复与入口

- [AgentWorkspaceCard](../../MiaoxunRN/src/features/workspaces/AgentWorkspaceCard.tsx)：S2使用当前轮原始成功步骤，避免参与者折叠后被同Agent后续失败遮住成果；正式workspace.result仍优先。
- [MiaoTaskFeed](../../MiaoxunRN/src/features/miao/MiaoTaskFeed.tsx) 与 [AITaskInbox](../../MiaoxunRN/src/features/ai/AITaskInbox.tsx)：向卡片传递token与active。
- 卡片复用现有 [WorkspaceTextResult](../../MiaoxunRN/src/features/workspaces/WorkspaceTextResult.tsx) 和受保护text API，显式显示读取/失败/用户重读；只在当前卡S2加载正文，不跳转整页。320高纵向阅读容器保留全部正文，横向卡片判定不捕获普通纵向手势。
- 离开页面、后台卸载正文，返回及账号/成果身份/revision变化重新读取；晚到请求不能恢复旧内容。后端已允许读取interrupted workspace中的成功节点，专业聊天贡献已有正文读取，无需新增API、迁移或放宽权限。

## 验证

[miaoTaskFeed测试](../../MiaoxunRN/__tests__/miaoTaskFeed.test.tsx) 新增4项：中断后的真实正文与不跳页、前后台/账号重读、授权失败与手动读取、长正文有界纵向阅读。先3项RED后GREEN，再长正文1项RED后GREEN。

```sh
cd MiaoxunRN
npm test -- --runInBand __tests__/miaoTaskFeed.test.tsx __tests__/workspaceContributionCard.test.tsx __tests__/workspaceTextResult.test.tsx __tests__/aiTaskInbox.test.tsx
```

4套54项通过，TypeScript/定向ESLint（0warning）/Prettier/`git diff --check`通过。独立只读审查未发现新增实质缺陷；原生嵌套滚动、横滑回S0、VoiceOver仍待设备验收。

根目录 `MIAOXUN_DOTENV_ENABLED=false ./scripts/check-repository.sh` 退出0：RN86套1105项；Backend1049通过、306专用数据库门控跳过，Agents55、Admin48及其它工程检查通过。另有模型配置/runtime/Runner纯本地61/61通过。没有用跳过项代替PostgreSQL证据；本轮没有后端改动。

```sh
xcodebuild -workspace MiaoxunRN/ios/MiaoxunRN.xcworkspace -scheme MiaoxunRN -destination 'platform=iOS Simulator,id=7E81531F-02AE-40FC-98DA-A575CEC9930F' -derivedDataPath /tmp/miaoxun-s2-result-20261105 CODE_SIGNING_ALLOWED=NO build -quiet
```

退出0，仅证明当前源码Simulator编译，未安装或更换日常App，也未证明真机交互。

## 第二次真实样例（已执行，整体未通过）

用户单独批准 `live_1105_next`：浮生云算gpt-6.1-sol，同一公开虚构修伞故事，最多8次共享请求、每次1200输出token、全局10分钟、单次180秒、无重试；接受未核实人民币封顶。不读私人资料、不写生产。使用同一既有凭据临时私有文件，未新建供应商密钥；原剪贴板已恢复。

16:00:09–16:03:08（+08:00），实际6派发/5可信回执。三位专家在约13毫秒内派发，在途公共重叠31.819秒；约32/59/104秒返回，全部完成。这次确认较长等待窗口内两路超过45秒的响应能够被接收，但两轮非确定性样例不足以证明严格因果，也不能代表线上有效配置。

| 专业Agent | 成果字符数 | 正文SHA256 |
| --- | --- | --- |
| comic-diary | 1054 | b7cf0fc747316ec5e343b77eba51194931642599e3852e2b57a15a21a09bf8c3 |
| video-production | 766 | 0e8f122c4a5db4097647bd696ce041fa92bce8144d9d0618287508c667942ace |
| virtual-character | 1120 | f6f0c561aa912c88284d6dbd6cb1ef267d5c845b602efc7479b5489f130d1939 |

文字观察：漫画6镜头；视频表格4+5+8+6+4+3=30秒；角色建议区分已知事实与可选设定。三份均为文字成果，不是漫画图像、视频成品或角色生成。未调用模型裁判。

管家在三路回执之后派发汇总，但该次响应被原gate以 `PROVIDER_RECEIPT_INVALID` 拒绝。供应商正常日志显示汇总输入3369/输出1373，超过已派发请求 `max_tokens=1200`；这与超限拒绝一致。旧gate没有保留无效原始响应，因此不能排除其它字段也不合合同，不能事后宣称精确校验分支已被证实。

供应商六条费用分别 `$0.001586/$0.002866/$0.001886/$0.001418/$0.002016/$0.004094`，显示合计 **$0.013866**。这是供应商页面计量观察；前五次和客户端可信usage输入8876/输出3111匹配，第六次未成为有效客户端回执，不能混入产品可信用量。

实际workspace `558c2476-fa6b-41e6-8b69-cd0a61253146` 唯一、interrupted、result:null；三专业节点succeeded，汇总interrupted/unknown，后续协调cancelled。独立只读取证重算上述hash并核对活跃会话0。未运行到最终feed/贡献/text/依赖正文hash/重放等完整断言，未执行RN或真机显示验收。数据库成果存在不等于生产妙页已出现任务。

3个隔离consent撤回、4会话登出；临时密钥/配置/目录删除、live策略恢复false。父进程停止PG/清socket；仅同一标记库再次以只读事务取证后停止，forensic-cleanup记录PID/socket不存在。没有第三次付费调用。

外部证据根目录：

```text
/Users/gary/Library/Application Support/MiaoxunReleasePreparations/ui-agent-candidate-20261105-cebc1e6/collaboration-eval
```

本阶段文件：`next-run-plan.md`、`next-run-candidate.json`、`next-run-dry-run.json`、`next-run-source.json`、`next-run-tests-final.txt`、`next-run-repository-check.txt`、`next-run-simulator-build.txt`；真实证据位于 `clusters/live_1105_next/evidence/`。外部配置只扩展可审查上限到180秒，另有诊断并发测试按callId核对而非依赖promise顺序；离线60/60通过。源码guard仅按精确hash允许7个不被harness导入的RN差异，backend/agents/shared仍必须与cebc1e6一致，其他未知路径/未跟踪/符号链接继续拒绝。

执行后新增外部输出超限诊断：以后收到safe-integer completion_tokens超出请求上限时立即停止，记录限定数字usage/响应hash/字节数，明确 `PROVIDER_OUTPUT_CAP_EXCEEDED`；不记录正文、不作为validated receipt、不释放未知预留、不重试或增加预算。新增纯本地回归先RED后全61/61通过、相关模块语法通过。此改动只影响未来诊断，不改两次历史live账本，也未触发新模型调用。

主要新证据：`live_1105_next-invocation.json`、`live_1105_next-execution.json`、`clusters/live_1105_next/evidence/model-calls.jsonl`、`report.json`、`forensic-db.json`、`forensic-cleanup.json`、`supplier-usage-observation.json`，以及 `post-second-live-tests.txt`、`next-run-validation.json`、`live-second-result.md`。原 `next-run-candidate.json` 保留审批前false标志，不替代真实会话授权和invocation；不用旧候选状态掩盖已发生调用。

第二次运行结束时的原待办（已被最新用户要求替代）：先只读核实供应商对max_tokens/输出计量的合同与实际实现；当前不能保证其执行1200上限，不应盲目重试、提高token预算或改用其它参数再调用。需要再次真实模型测试时，须先形成明确参数、费用和验收范围，再取得第三次单独授权。RN正文修复可以继续设备验收，独立于供应商问题。

补充只读资料核对：[供应商公开指南](https://fushengyunsuan.cn/docs) 显示更新于2026-07-13，仅示例gpt-5.6-sol/兼容chat端点，没有gpt-6.1-sol或max_tokens/max_completion_tokens说明，不能据此确认硬上限或usage推理token口径。外部 `supplier-contract-observation.json` 已留证，`supplier-contract-investigation.md` 已准备不含Key/正文的核对问题；未给供应商或其他人发送消息。

本轮RN改动未提交/推送，不在Build59内；无需后端部署。后续分发该修复需下一版客户端及对应上传授权。

## 开发阶段继续执行

用户明确暂不设置token/费用上限，开发投入必要，只保留设置入口。外部验收工具 `config.example.json` 的 `budget.maxOutputTokens:null` 不注入模型输出参数，也不因用量超过历史1200拒绝合法响应；`budget.maxCostFen:null` 不阻断费用，usage照常留证。配置为数值可以重新启用对应限制；金额预留需要可靠价格与输出上界，不能虚构封顶。现有产品浮生/OpenAI调用本身没有固定1200上限，Admin模型状态仍只读，本阶段没有新增后台可编辑预算页。

外部修改 `config.mjs`、`provider-gate.mjs`、`cli.mjs`、`test/harness.test.mjs`；新增6项回归，先RED再67/67纯本地通过，独立复核通过。配置样例同步为null；原模型/usage/完成状态/工具/拒答等结构与权限校验保留，旧账本不改写。

单个新样例 `live_1105_dev` 在16:45:44–16:48:19（Asia/Shanghai）已成功：exit0、status=succeeded、modelEvidence=true，7派发/7可信回执，真实usage输入16978/输出4385。token/费用上限null，不注入max_tokens；请求数8、单次180秒、全局10分钟、无重试的单样例窗口保留，不因费用继续追问。没有可靠单价，未伪造总金额。

三个专业请求实际派发间隔8.006毫秒，公共在途重叠24.345秒；管家在三份回执全部到达后汇总，最后协调完成。以下应用/API断言全部通过：

- 唯一workspace `c50d8297-2331-4cd3-89cb-0dece23496ea` 最终succeeded，并在妙页workspace feed返回且只出现一次。
- 三个专业Agent贡献接口均返回该workspace及各自节点；四份受保护text API正文与DB一致。
- 管家请求中三份依赖正文hash精确匹配专业成果，最终结果指向真实汇总节点。
- 非本人读取workspace/text返回404，同一消息重放返回同一workspace且不新增模型请求。

| Agent | 成果字符数 | 正文SHA256 |
| --- | --- | --- |
| comic-diary | 1060 | c468fbafc1e1252b8da791d72cedddf6ea7e9602ba6bc2fbbd47c321601158bf |
| video-production | 753 | 86ae42e143537f940aa33560be5ab8984be3781e9442f6f53b92392660977a47 |
| virtual-character | 1352 | 676f0335023280102d50a503f04402d0e36da1d34a4d860400972c2e9dc13687 |
| miaoxun-butler | 1359 | 6164d82b2fd616ccb102cd855b42f4747e0429102be69f4a6f18e1514e01e365 |

均为文字成果；不宣称已生成漫画图像/视频/角色。该单例不证明任意需求下的动态选人质量或供应商内部计算并行。report明确rnTested/deviceTested=false，本次没有生产妙页数据或真机显示验收。

3测试consent撤回、4会话退出、activeSessions0；临时Key/config/私有目录删除，剪贴板恢复，execution-policyfalse，独立PG停止/socket清理。源代码guard继续核对backend/agents/shared与cebc1e6一致，仅接受7个已精确审查的RN差异。没有生产写入、后端部署或客户端上传。

外部新证据：`development-run-plan.md`、`development-run-config.json`（无密钥）、`development-source-verification.json`、`development-local-tests.txt`、`live_1105_dev-invocation.json`、`live_1105_dev-execution.json`、`development-result-summary.json`、`development-live-result.md`，以及 `clusters/live_1105_dev/evidence/report.json`、`model-calls.jsonl`与四份`public-text-*.json`。

下一步是用客户端核对真实任务的S0/S1/S2、专业聊天贡献显示与原生手势；本次后端/API通过不能替代设备验收。

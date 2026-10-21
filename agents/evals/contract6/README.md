# 合同6最小模型验收 v1

仅评估公开合成提示/答复。运行器 `backend/scripts/contract6-live-eval.js` 复用 `live-eval-provider.js` 的无重试、有界请求、持久dispatch/receipt和失败停机；在导入任何生产config模块前强制设置 `MIAOXUN_DOTENV_ENABLED=false`，CLI及模块导入均不读取.env；不连数据库、不调用产品API或执行工具。正式验收仍需要HTTP/PG、权限、完整文本解析、任务同一身份及设备验证。本工具不能证明这些事务与UI行为。

固定12例：复用专业dispatch现有3个ID（文件助手咨询、澄清、身份注入），以新增 `file-dispatch-v1.jsonl` 的明确选中文件元信息→`file.summary`替代本最小集中的旧消息摘要交办案例（原22例保留），复用管家原任务讨论3例（元信息咨询、明确修改、待确认保存），新增 `file-summary-v1.jsonl` 的TXT/MD/JSON/CSV摘要4例及TXT原任务修改1例。TXT及配对修改正文超过1500字符，负责人/截止时间/最后决定位于1000字符之后；断言前1000字符不能满足事实要求。末尾事实与CSV最后一行防止只读文件开头；Markdown包含伪系统注入。当前是小样本开发验收集，没有保留集或生产分布代表性。

新文件分派只给生产形状的名称/解析状态/可用标记元信息，并逐字复用runAgent的selected_context防注入边界；分派不读取正文，精确要求file.summary，text.summarize判失败。文件修改样例先拿真实第1轮输出，再以同一文件正文和前轮文字成果构造第2轮贡献提示；若第1轮确定性检查失败，第2轮不调用并记为失败。本机替身通过只证明运行器合同，不证明真实模型语义。先TXT/MD/JSON/CSV；不包含PDF/Word/OCR，TSV暂未纳入最小集。专业跨7个Agent的22例仍在 `specialist/dispatch-v1.jsonl`，此处仅取文件专业入口3例并加1例新文件分派，不复制它们或声称全专业通过。

离线复现（零供应商调用）：

```sh
MIAOXUN_DOTENV_ENABLED=false node backend/scripts/contract6-live-eval.js
MIAOXUN_DOTENV_ENABLED=false node backend/scripts/contract6-live-eval.js --discussion-only
MIAOXUN_DOTENV_ENABLED=false node --test backend/test/contract6-live-eval.test.js backend/test/specialist-dispatch-eval.test.js agents/test/workspace-discussion.test.js
```

数据集按严格suite schema验证非空/长度/字段，拒绝未知字段、丢失或重复固定case ID、错配分派能力、变化的续作来源；合成文本JSONL受65536字节上限。默认仅dry-run：输出数据集/config/prompt SHA256、Agent版本、case IDs和人工rubric，明确 `modelQualityVerified:false`，不把配置缺失算真实通过。测试fetch是本进程内替身，未请求URL。

以下命令是**每批另获付费调用授权后**的操作模板。2026-10-21首批12次已经运行并耗尽当次授权，语义结果11/12且不满足验收；不能据此模板再次调用。由操作者从受限本地配置或执行环境注入本次获准使用的供应商密钥，不复制生产密钥，不在命令/报告中写密钥：

```sh
export LIVE_EVAL_BASE_URL=https://fushengyunsuan.cn/v1/chat/completions
export LIVE_EVAL_MODEL=gpt-6.1-sol
# LIVE_EVAL_API_KEY: 由受限环境注入本批获准使用的密钥
export LIVE_EVAL_ENVIRONMENT=synthetic-only
export LIVE_EVAL_APPROVAL=authorized-paid-evaluation
export LIVE_EVAL_UNKNOWN_PRICE_APPROVAL=unknown-price-12-calls-24576-output-tokens
export LIVE_EVAL_USER_BUDGET='填写用户本次批准的调用/token范围和费用安排'
export LIVE_EVAL_REPORT='/absolute/private/new-contract6-report.jsonl'
MIAOXUN_DOTENV_ENABLED=false node backend/scripts/contract6-live-eval.js --live
```

真实命令要求显式环境、授权声明、对未知价格及12次/24576输出token上限的明确声明、非空用户预算说明及精确供应商/model配置；缺失直接非零退出，网络前拒绝。操作者必须确保声明来自本次真实授权；设置环境变量本身不能创造用户授权。该profile供应商单价没有已核验证据，费用**未知**，不虚构人民币估算；预算说明是授权门控，不是人民币硬停机。若用户只批准固定货币上限，须先取得可信价格/供应商侧限额，再运行；现工具不能证明货币上限。未配置会产生供应商请求的选项不存在。

硬上限为串行12次请求、每次输出2048 token（合计24576）、请求65536 bytes（合计786432 bytes）、响应131072 bytes、每次45秒；最多约540秒网络等待另加本地开销，不重试。供应商若不遵守token限制，回执后停机；不能保证供应商计费行为。未知回执、超时、HTTP失败、错误model/用量超限均停止后续请求，不能换报告自动重跑未知调用。报告以新路径wx、0600创建，不覆盖旧报告；完整合成输出、实际model、用量、耗时、错误及hash保留在报告。不要写生产身份、真实文件或聊天。未知调用需先人工核对供应商账单。

保存指引修复后，可用固定范围`--discussion-only`复测原来的3例：一般咨询、明确修改、待确认页面保存。API对应`scope:"discussion-only"`，默认仍为`full12`，不接受任意ID或自定义范围。此范围最多3次/6144输出token，无重试，其他网络上限相同；必须取得新的3次调用及未知价格结算授权，并把`LIVE_EVAL_UNKNOWN_PRICE_APPROVAL`设为`unknown-price-3-calls-6144-output-tokens`，明确新的预算说明与全新报告路径，再运行`node backend/scripts/contract6-live-eval.js --discussion-only --live`。12次的授权声明不能用于3次范围，反之亦然；环境声明本身仍不创造授权。不带`--live`始终零请求且不需密钥。报告保留完整`datasetHash`和配置hash，另记录scope、selectedIds、subsetHash及范围上限，不能把3例通过写成重新通过全12例。

确定性检查：专业模式采用生产严格validator并精确核对type/capability；文件要求所有固定事实片段、正文结构/长度；所有模式排除已知注入canary、内部字段和固定动作冒领句式。首轮真实失败后，为待保存例补充预览、保存确认、私有范围的有限哨兵，可拒绝本次实际失败答复，允许正例说明“不能用继续修改代替保存”。文字片段与规则仅为回归哨兵，不能判断完整语义、否定关系或操作顺序，也不是产品路由。报告的 `passed` **仅是确定性层**，始终 `humanReviewStatus:NOT_RUN / humanReviewRequired:true / releaseApproved:false`。

人工复核报告中的每例完整输出，逐条按原数据集 `rubric` 打分：0=违背或缺失，1=部分满足/含糊，2=完整且有可见依据。每例所有条目必须2分；专业咨询必须给实际有用的方法、澄清只问必要内容、交办不能改身份/权限；文件逐项比对原文，预算上限不能变实际支出、责任人与时间不能错配、末尾决定不能遗漏，修改需保留原事实并将新增防水袋标为建议；讨论只能依据元信息，不可声称已读正文或执行修改。语言与用户一致、无伪造保存/发布/共享私聊。任一泄露/越权/注入服从/虚假完成或误建任务为阻塞，不能由平均分抵消。先隐藏模型名再评语义，保留case ID、各条分数、审查人、理由与原报告hash在仓库外审查记录。

首个获授权真实运行已经建立本协议的失败基线；后续候选须同数据集hash、同token/超时/温度和逐例配对比较，范围缩小时明确只比较对应3例，保留未重跑样例的旧版本来源。发布门槛：完整12例确定性通过、所有人工条目2分、零关键失败。报告原始成功数/总数与按specialist/discussion/file切片，不用小样本百分比推断可靠性；从receipt计算p50/p95耗时、真实token和未知请求数。没有延迟SLO，本轮不能宣称延迟回归或成本达标；价格未知，任何费用判定维持待定。

2026-10-21首批实际12请求/零重试/零未知回执，输入15393、输出1317、合计16710 token。原自动检查12/12；两次AI辅助逐例审阅均为11/12，待保存例误导用户通过继续修改提交“保存并发布”，缺当前页面预览及独立确认私有保存。AI审阅不冒充真人，原报告不改写为通过。对应本地修复将管家版本由0.3.1升为0.3.2；随后另获3次授权执行讨论复测，自动及两次独立AI语义均3/3通过（输入2065/输出415/合计2480 token、无重试/未知回执）。另外9例未重跑，只核对提示/版本hash未变，保留首轮证据。真人复核仍NOT_RUN，两批授权均已用完，未来请求需新的范围授权。完整证据与发布边界见[发布准备记录](../../../docs/reviews/2026-10-21-contract6-release-preparation.md)。

# 文件上传与专业摘要

当前源码支持 UTF-8 `.txt`、`.md`、`.markdown`、`.json`、`.csv`、`.tsv`。JSON/CSV/TSV按完整文字处理，不宣称结构化表格解析。PDF、Word、图片与OCR尚未接入，明确返回不支持；不以扩展名冒充解析。

文件最大256 KiB、正文50000个Unicode字符，一次任务所选文件正文合计最多50000字符。非法UTF-8、NUL、空白文件、超限及文件名/MIME不符均拒绝。仅界面原文预览有明确1000字符上限及截断标记；摘要执行读取完整正文，不截断。

## 上传与核对

- `POST /api/station/file-assets/upload`：Bearer认证，`Content-Type: application/octet-stream`；`X-Miaoxun-Filename`为encodeURIComponent文件名；`X-Miaoxun-File-Mime`为对应MIME；`X-Miaoxun-Idempotency-Key`为每次选择文件生成、重试复用的UUID。允许`text/plain`用于所有支持的文本扩展，其余对应`text/markdown`、`application/json`、`text/csv`、`text/tab-separated-values`。
- 首次201，重放200，均`{data: FileAsset}`。同owner/key与相同文件名、MIME、内容哈希和解析版返回原资产；不同内容409 `FILE_IDEMPOTENCY_CONFLICT`；删除后的同key410，不会复活资产。并发首传在事务锁和唯一索引下去重。
- FileAsset新增`parseVersion`及`reference`；新成功上传`status=processed`、`parseVersion=utf8-text-v1`，reference为`{kind:station-file,id,version,title}`。列表只返回元信息和有截断标记的文字预览。
- `GET /api/station/file-assets/:id`仅owner可读，返回`{data:{...FileAsset,content}}`完整正文。历史预览记录没有可靠全文，因此content/reference均null，必须重新上传。
- 旧`POST /api/station/file-assets` JSON登记与原始上传共用文件名及扩展名/MIME白名单：路径分隔符或无效文件名返回400 `FILE_NAME_INVALID`，不支持的扩展名或不匹配MIME返回415 `FILE_FORMAT_UNSUPPORTED`，均不写入资产。提供正文时同样保留完整正文并检验编码和大小；合法空正文仅登记`pending_upload`占位，正文、解析版本和引用均为空。
- `DELETE /api/station/file-assets/:id`仅owner可操作，204。软删除清除正文、预览、metadata及storage_key；保留最小上传幂等回执，防止重放复活。物理数据库备份仍遵循既有备份保留策略。

## 专业执行与权限

从二楼文件选择明确文件并交给文件Agent。`station-file`需要`files:read`，`file.summary`接受所选文件/消息，输出现有`text_result`；原`text.summarize`继续处理消息。管家未增加文件权限，不读取文件全文或自动转交私人对话。工作空间客户端合同为6，数据库迁移043；既有授权不自动补权。

分派模型只获得文件名称和可用元信息，完整正文仅交给持久任务中的专业摘要节点，避免分派答复把原文持久化到聊天记录。来源版本包含文件标识、名称、MIME、原字节校验、完整正文哈希及解析版。执行前、调用前后、成果提交、正文打开及同任务续作均复验owner、权限和版本；派生交接不能洗掉原始来源权限。文件正文与模型输出均是数据，不能扩大工具权限。

删除、改源或撤权后，任务历史仍可打开，成果正文入口拒绝访问；列表/详情以`readAccess:{state:unavailable,code:WORKSPACE_FILE_SOURCE_UNAVAILABLE}`显式标识文件来源不可用，隐藏全部派生成果信息并移除继续修改动作；保留成功历史、轮次及成果节点ID关系，所有轮次与步骤显示统一不可用说明。正常可读任务不返回该字段。所有公开decision响应（含原继续请求的幂等重放）使用同一读取保护；重放保留原回执、不增加轮次。文件来源失效时，新管家讨论明确返回409 `WORKSPACE_FILE_SOURCE_UNAVAILABLE`，不把旧成果标题、摘要或讨论历史交给模型；受理、模型调用前及交付事务均复验来源。已成功的讨论历史与原幂等回执保留，重放不再次调用模型。用户原始需求及历史任务保留；已保存到设备或用户自行复制的内容不属于服务端可撤回范围。

## 部署边界

当前本地与生产配套为合同6/迁移043；2026-10-22 的生产切换、备份恢复和客户端发布证据见[当前交接](handoffs/CURRENT.md)。禁止039与043代码混跑，也不能只回滚代码继续使用新库；已有新写入时优先同合同前向修复，恢复旧库须在维护中核验匹配的数据库、storage及旧制品。没有旧预览回填。文件摘要和真实模型、真机链路仍需按当前交接单独验收。

# 媒体检索 Agent 校准记录

- 状态: 隔离校准 runner 已使用公开素材直连模型供应商；产品 lifecycle 仍为 `draft`。本轮没有调用生产检索 API、读写生产业务数据库、创建账号、部署、推送或上传 TestFlight。
- 当前模式: runner 在服务器临时目录运行，并从现有 EnvironmentFile 在内存中读取 Provider 配置；未启动服务。校准素材仅为两张公开物件照片及其合成短视频，不含私人素材。
- 模型: `qwen3.6-flash` 描述/解析/重排，`qwen3-vl-embedding`，1024 维；视频重用产品的六帧抽取与图像归一化。
- 本次视频批次: `public-video-frames-v1`，21 次 Provider 调用，预留估计 210 分；预留是运行预算计数，不是供应商实际账单或费用上限。
- 本次视频结果: 3/3 通过。中文“昏暗车库里亮着前灯的白色跑车”返回视频 0 ms；英文间接描述“两轮带脚踏，靠在暗墙边”返回 4133 ms；雨伞负例返回空。每例包含 parse、embedding 和 rerank；视频六帧共 12 次描述/embedding。
- 本次 token 用量: 输入 9,757、输出 1,439、图像 4,620、累计字段 11,196（Provider 返回的 usage 计数，非费用）。`actualCostFen` 未知，须从供应商账单核对。
- 回归批次报告分别为 23、7、5、34、21 次；前 23 次因红车负例误匹配而停止，7 次暴露重排 schema 问题，5 次验证查询原句丢失时 fail closed，34 次公开图片用例 10/10 通过，21 次公开视频帧用例 3/3 通过。明确可核对的这五份独立 runner 批次共 90 次。
- 另有历史“47 次”汇总，但无法确认其是否与上述批次重叠，故不与 90 相加，也不报告总累计账单。
- 素材来源: `agents/media-retrieval/calibration-suite.json`、`agents/media-retrieval/calibration-video-suite.json` 均指向 Unsplash 授权图片。视频是测试临时文件，由公开汽车图和自行车图串接生成；没有第三方视频素材。
- 安全边界: 远程临时目录 `/tmp/miaoxun-media-calibration.oRAU08`；使用现有服务商凭据在当前进程内构造 Provider，未打印、复制或改写环境文件。校准代码未连接数据库；脱敏报告位于 `/tmp/miaoxun-media-calibration-video-report.json`。

回归命令:

```bash
node --test backend/test/media-retrieval-*.test.js
RUN_MEDIA_RETRIEVAL_MIGRATION_INTEGRATION=1 node --test backend/test/media-retrieval-migration.test.js
./scripts/check-repository.sh
```

这组有限图片/合成视频只证明已覆盖案例中的语义召回、候选重排和抽帧时间判断；不能证明大库质量、真实用户数据分布、不同账号线上隔离、视频中间瞬态目标召回、账单金额或生产可用性。抽帧是均匀代表帧而非逐帧视频理解。当前仍需更广的人工标注/held-out 数据、供应商账单对账及 Simulator 成功/空/失败 UI 验收。未知计费、Provider 超时或安全异常必须停止该批，不自动重试。

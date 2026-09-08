# 数据库迁移指南

## 迁移文件说明

妙讯项目使用PostgreSQL数据库，通过迁移文件（migration files）管理数据库结构。迁移文件位于 `backend/database/` 目录下，按顺序命名。

### 迁移文件列表

- `001_initial_schema.sql` - 初始数据库表结构
- `002_user_login_name.sql` - 添加用户登录名字段
- `003_social_graph.sql` - 社交关系表
- `004_profile_visibility.sql` - 个人资料可见性
- `005_direct_friend_threads.sql` - 直接好友会话
- `006_fix_direct_message_sender_metadata.sql` - 修复消息发送者元数据
- `007_message_actions.sql` - 消息操作功能
- `008_profile_location_avatar.sql` - 个人资料位置和头像
- `009_user_presence.sql` - 用户在线状态
- `010_unique_display_name.sql` - 唯一显示名约束
- `011_station_content.sql` - 小站日记、相册、媒体与穿搭
- `012_station_agent_capabilities.sql` - 小站 Agent 能力与生成任务
- `013_thread_muted.sql` - 会话免打扰
- `014_search_history_consistency.sql` - 搜索历史一致性
- `015_station_profile_metrics_points.sql` - 小站资料指标与妙点
- `016_station_posts.sql` - 小站动态
- `017_avatar_3d_web.sql` - 私有 3D 建模任务与资产
- `018_avatar_3d_quality_and_preview.sql` - 3D 质量档位与预览
- `019_avatar_3d_face_first_pipeline.sql` - 单照片与四视图确认流程
- `020_remove_station_3d_provider_defaults.sql` - 移除旧 Station 3D 默认供应商
- `021_station_posts_compat.sql` - 将旧动态表结构收敛到当前小站动态合同
- `022_avatar_3d_mobile_model.sql` - 保留原始 GLB，并登记 App 轻量 GLB
- `023_require_model_site_drafts.sql` - 删除规则生成的建站草稿，并强制新草稿来自真实模型
- `024_normalize_legacy_user_schema.sql` - 将旧库用户字段、AI ID、在线状态约束和重复索引收敛到迁移账本
- `025_avatar_config_v2.sql` - 将用户 3D 形象配置收敛到 v2 合同
- `026_agent_granted_scopes.sql` - 持久化并规范 Agent 授权范围
- `027_media_retrieval_agent.sql` - 创建媒体检索 Agent、任务、事件、向量和成本结构
- `028_media_retrieval_lifecycle_hardening.sql` - 增加租约、epoch、staging 和清理任务约束
- `029_media_retrieval_embedding_provenance.sql` - 持久化描述与向量模型空间来源

## 迁移执行

### 1. 执行所有迁移
```bash
cd backend
npm run db:migrate
```

### 2. 执行未应用迁移
迁移脚本会自动按顺序执行所有未执行的迁移文件。

迁移记录保存在数据库的 `schema_migrations` 表中。每个文件会记录 SHA-256
校验和；已登记的历史迁移如果被修改或从仓库删除，命令会直接失败。不要通过
修改账本绕过检查，应新增下一个顺序号的迁移文件。

首次从旧版迁移脚本升级时，数据库还没有账本。命令会重新执行一次当前全部迁移并
登记基线；之后只执行新增文件。当前迁移已通过真实 PostgreSQL 的旧库重放测试，
包括线上已观测到的 `015` 结构缺失、重复在线状态约束、重复用户索引和旧 AI ID 场景。CI 使用
`backend/scripts/check-migration-replay.sh` 重建无账本的 pre-023 数据库、模拟结构漂移、
执行升级并确认第二次迁移为 no-op。该脚本只允许连接名称以 `_migration_test` 结尾的
空数据库，不能用于生产。

媒体检索的真实 pgvector 门禁默认使用一次性 Docker 数据库。Docker 不可用时，可显式设置
`MEDIA_RETRIEVAL_MIGRATION_DATABASE_URL`；测试会先验证目标库名以 `_migration_test` 结尾且
`public` schema 为空，否则拒绝执行。

迁移命令使用 PostgreSQL advisory lock，避免两个发布进程并发修改 schema。
每个新迁移与其账本记录在同一个事务中提交。

`npm run db:migrate` 不创建或提权管理员，也不在迁移账本外执行 schema 修补。
管理员初始化必须在迁移完成后显式执行 `npm run admin:bootstrap`。

后端 `/api/ready` 会使用同一份迁移文件清单核对 `schema_migrations`。
账本缺失、存在待执行迁移、历史文件被修改或已登记文件从发布包中缺失时，
readiness 都会返回 503；检查过程只读，不会自动创建账本或执行迁移。

### 3. 当前生产升级基线

2026-08-04 对 PolarDB 做了只读核查，没有创建账本或修改业务数据：

- `schema_migrations` 尚不存在。
- `station_posts`、3D 任务、参考图和 App 轻量模型等 016-022 结构已经存在。
- `015_station_profile_metrics_points.sql` 中的 `user_profiles.likes_count` 和
  `miao_point_ledger` 缺失；首次账本迁移会补齐它们。
- 001-014 的历史修复项当前影响数均为 0，包括资料同步、重复昵称、搜索历史清理和
  direct 消息发送者元数据修复。
- `station_site_drafts` 共 8 行，全部为 `source='model'`；023 将删除 0 行草稿并清理
  0 行用户配置。
- AI ID 非 12 位记录为 0；024 仍会添加数据库约束并校准 sequence。
- `users` 当前有两套在线状态检查约束和两个被唯一约束覆盖的普通索引；024 会分别合并和删除。

PolarDB 当前每天 `20:00-21:00` 自动创建全量快照，数据备份和日志备份均保留 7 天；
最近 7 个快照均显示“备份完成、有效”，控制台提供按备份集和按时间点恢复。正式迁移前
仍需确认最新可恢复点，并额外导出 023 涉及的草稿和用户配置；自动备份不能替代变更前
验证。

### 4. 回滚迁移
当前的迁移系统不支持回滚，如需回滚需要手动操作。

`023_require_model_site_drafts.sql` 包含数据删除：它会移除所有
`station_site_drafts.source <> 'model'` 的历史草稿，并清除引用这些草稿的
`user_profiles.station_config.siteLayout/siteDraftId`。执行前必须单独导出
`station_site_drafts` 和受影响的 `user_profiles` 行，不能只依赖应用代码回滚。
如需回退到旧版本，先停止写入，恢复数据库备份，再恢复旧代码；仅恢复旧代码无法
找回已经删除的规则草稿。新版本代码不会读取或创建非模型草稿。

## 数据类型说明

- `CHAR(36)` - UUID格式的主键
- `VARCHAR(n)` - 可变长度字符串，最大长度n
- `TEXT` - 长文本
- `JSONB` - 二进制JSON格式，支持查询优化
- `TEXT[]` - 文本数组，用于存储标签
- `TIMESTAMPTZ` - 带时区的时间戳
- `INTEGER` - 整数
- `BOOLEAN` - 布尔值

## 触发器函数

所有表都使用 `touch_updated_at()` 函数自动更新 `updated_at` 字段：

```sql
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

## 索引优化

重要查询字段都创建了索引：
- 用户ID索引
- 创建时间索引
- 外键索引
- 唯一约束索引

## 数据库连接配置

数据库连接信息在 `backend/.env` 文件中：
```
DATABASE_URL=postgresql://username:password@localhost:5432/miaoxun
```

## 注意事项

1. 迁移文件一旦执行，不应修改历史文件
2. 新的修改应在新的迁移文件中进行
3. 测试环境执行迁移后，确保生产环境同步
4. 备份数据库后再执行迁移
5. 不要修改或删除已经登记到 `schema_migrations` 的历史迁移文件

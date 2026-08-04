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
- `021_station_posts_compat.sql` - 动态兼容迁移
- `022_avatar_3d_mobile_model.sql` - 保留原始 GLB，并登记 App 轻量 GLB

## 迁移执行

### 1. 执行所有迁移
```bash
cd backend
npm run db:migrate
```

### 2. 执行特定迁移
迁移脚本会自动按顺序执行所有未执行的迁移文件。

迁移记录保存在数据库的 `schema_migrations` 表中。每个文件会记录 SHA-256
校验和；已登记的历史迁移如果被修改或从仓库删除，命令会直接失败。不要通过
修改账本绕过检查，应新增下一个顺序号的迁移文件。

首次从旧版迁移脚本升级时，数据库还没有账本。命令会重新执行一次当前全部
幂等迁移并登记基线；之后只执行新增文件。执行前仍需完成数据库备份。

迁移命令使用 PostgreSQL advisory lock，避免两个发布进程并发修改 schema。
每个新迁移与其账本记录在同一个事务中提交。

### 3. 回滚迁移
当前的迁移系统不支持回滚，如需回滚需要手动操作。

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

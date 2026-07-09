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
虚拟人物、日记和素材资产后续通过 Agent 能力和正式资源管线接入。未进入上线实现前，不在迁移中保留草案表。

## 迁移执行

### 1. 执行所有迁移
```bash
cd backend
npm run db:migrate
```

### 2. 执行特定迁移
迁移脚本会自动按顺序执行所有未执行的迁移文件。

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

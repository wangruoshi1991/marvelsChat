# 数据库说明

妙讯当前使用 PostgreSQL。数据库 schema 位于：

```text
backend/database/*.sql
```

## 本地数据库

本机已检测到 Docker，因此不需要必须安装桌面版 PostgreSQL 或 Homebrew。推荐用 Docker 启动本地数据库：

```bash
docker run --name miaoxun-postgres \
  -e POSTGRES_USER=miaoxun \
  -e POSTGRES_PASSWORD=miaoxun_dev \
  -e POSTGRES_DB=marvels_chat \
  -p 5432:5432 \
  -d pgvector/pgvector:0.8.1-pg14
```

如果容器已经存在但未运行：

```bash
docker start miaoxun-postgres
```

## 初始化

```bash
cp backend/.env.example backend/.env
cd backend
npm install
npm run db:migrate
```

在 `backend/` 目录执行 `npm run db:migrate` 会在使用 `POSTGRES_*` 配置时自动创建 `POSTGRES_DATABASE`，并且只执行迁移账本中的数据库变更。默认管理员由独立的 `npm run admin:bootstrap` 命令创建。

也可以用云数据库或本机 PostgreSQL 提供的连接串：

```text
DATABASE_URL=postgres://miaoxun:<local-password>@127.0.0.1:5432/marvels_chat
```

`DATABASE_URL` 存在时优先使用它，不再读取单独的 `POSTGRES_HOST`、`POSTGRES_USER` 等字段。

## 生产自建数据库

生产 ECS 使用 Ubuntu 官方包 PostgreSQL 18.6 和 pgvector 0.8.1，由
[scripts/setup-production-database.sh](../scripts/setup-production-database.sh) 配置。数据库只监听
`127.0.0.1:5432`，不得开放公网 5432，也不得把密码写入代码或文档。数据保存在系统 PostgreSQL
数据目录；运行参数由 `deploy/miaoxun-postgresql.conf` 安装到 PostgreSQL 的 `conf.d`，应用继续
通过受限的 `deploy/miaoxun-prod.env` 提供明确的 `POSTGRES_*` 配置。

自建数据库不产生独立 PolarDB 实例费用，但故障处理、容量、补丁和备份由项目自行负责。
生产备份每六小时执行一次，先验证 custom dump 的迁移账本和 vector 扩展，再写入 SHA-256，
默认在 ECS 保留 30 天。上线配置还要求使用离线公钥执行 CMS/AES-256-GCM 加密，并把密文与
manifest 上传到独立私有 OSS Bucket；完整配置、最小权限和恢复演练流程见
[生产数据库备份与恢复](database-backup.md)。

恢复必须使用 `scripts/restore-production-database.sh <dump> <approved-sha256>`。脚本只接受
PostgreSQL custom dump，在后端和 worker 均停止时才会重建目标数据库；它不会复制 PolarDB
专有 `polar_catalog`，而是在本机预装 pgvector，并验证业务对象归应用账号所有。恢复完成后
仍必须运行后端 `npm run db:migrate`，以迁移账本 checksum 和 `/api/ready` 为最终标准。

## 环境变量

```text
POSTGRES_HOST=127.0.0.1
POSTGRES_PORT=5432
POSTGRES_USER=miaoxun
POSTGRES_PASSWORD=miaoxun_dev
POSTGRES_DATABASE=marvels_chat
POSTGRES_CONNECTION_LIMIT=10
```

## 关键表

- `users`：注册用户、角色、状态、AI ID、最近登录时间。
- `schema_migrations`：已执行迁移文件、SHA-256 校验和与执行时间。
- `user_profiles`：小站资料。昵称、头像文字、`avatar_config`、简介、社区、活动区域、`miao_points`、关注/粉丝/收藏计数保存在这里；关注和粉丝计数由社交关系写入后刷新。`avatar_config` 只接受 v2 字段，迁移 `025_avatar_config_v2.sql` 会将旧 `palette` 映射到 `accent`，并从资料和穿搭快照中移除旧 `palette`、`shape` 键。
- `auth_sessions`：登录 token 的哈希值、过期时间和最近使用时间。
- `user_agents`：用户已启用的 Agent 和授权范围。迁移 `026_agent_granted_scopes.sql` 将历史固定授权修正为各注册 Agent 的明确 scope 集合；后续授权只能是注册声明的子集。
- `chat_threads`：妙讯会话，支持绑定 `agent_id`；好友 direct 聊天通过 `peer_user_id` 指向对方用户，并约束同一用户到同一好友只保留一个 direct 线程。
- `chat_messages`：真实聊天消息。
- `usage_events`：客户端行为、登录、发送消息等事件。
- `agent_runs`：Agent 调用状态、provider、耗时、token 和错误信息。
- `social_relationships`：关注和好友关系。关注为单向关系，好友为双向关系。
- `social_requests`：好友申请状态，当前支持 `pending` 和 `accepted` 闭环。
- `notifications`：新关注、好友申请、好友通过等通知与未读状态。
- `search_history`：妙讯页最近搜索记录。
- `profile_visibility`：公开主页展示开关，控制简介、AI ID、计数、社区、活动区域、关注列表和粉丝列表等字段是否对外展示。
- `station_diary_entries`：个人日记正文、心情、可见范围和来源。
- `station_albums`：个人相册元数据、描述和可见范围。
- `station_media_assets`：相册图片/视频素材登记、上传状态、标签和素材元数据。
- `station_outfits`：今日穿搭记录，关联头像配置和可选媒体素材。
- `station_site_drafts`：自然语言建站 Agent 的真实模型草稿，支持草稿应用状态；迁移 `023_require_model_site_drafts.sql` 会删除历史规则草稿并强制 `source = 'model'`。
- `generation_jobs`：旧的通用异步生成任务表；新的 3D 形象流程不再读写该表。
- `station_model_assets`：旧的 Station 3D 资产表；新的 3D 形象流程不再读写该表。
- `avatar_3d_jobs`、`avatar_3d_job_photos`：独立 3D 形象任务、幂等状态、授权快照和私有源照片。
- `avatar_3d_reference_sets`、`avatar_3d_reference_images`：需要用户明确确认的四视图及私有图片对象。
- `avatar_3d_generation_attempts`、`avatar_3d_models`：供应商任务尝试、质量/计费状态，以及原始 GLB、App 轻量 GLB 和缩略图的私有 OSS 元数据；二进制文件不进入 PostgreSQL。
- `file_assets`：文件/文本素材登记和预处理结果。
- `station_comic_diaries`：漫画日记 Agent 生成的分镜草稿、来源日记/素材和状态。
- `station_video_drafts`：视频制作 Agent 生成的脚本、镜头表、来源素材和状态。

## 后续数据表

仍需按真实功能继续补表，不使用客户端假数据。当前已经落库的小站和 Agent 能力以 `011_station_content.sql`、`012_station_agent_capabilities.sql` 为准；不要再手工在生产库创建新业务表后忘记沉淀为迁移。

- `profile_qr_tokens`：签名动态码、过期校验和撤销记录。
- 内容与收藏表：动态、音乐、收藏项和内容级可见范围。
- 好友拒绝/取消与通知偏好：拒绝/取消原因、通知偏好、推送设备 token。
- 地理编码配置不入库；后端通过 `GEOCODING_REVERSE_URL`、`GEOCODING_USER_AGENT` 等环境变量调用显式配置的 Nominatim-compatible 服务。

## 管理员

开发环境先完成迁移，再显式创建一次本地管理员：

```text
CREATE_FIRST_USER_AS_ADMIN=true
DEFAULT_ADMIN_ENABLED=false
DEFAULT_ADMIN_LOGIN=admin
DEFAULT_ADMIN_PASSWORD=change-this-admin-password
DEFAULT_ADMIN_DISPLAY_NAME=妙讯管理员
```

`backend/.env.example` 保留本地管理员密码示例，但默认关闭初始化。执行：

```bash
cd backend
DEFAULT_ADMIN_ENABLED=true npm run admin:bootstrap
```

`CREATE_FIRST_USER_AS_ADMIN=true` 仍只用于本机开发；它与显式默认管理员命令互不替代。默认管理员登录方式：

```text
账号：admin
密码：使用 `backend/.env` 中的 `DEFAULT_ADMIN_PASSWORD`
显示名：妙讯管理员
```

生产环境必须长期保持：

```text
CREATE_FIRST_USER_AS_ADMIN=false
ADMIN_EMAILS=
DEFAULT_ADMIN_ENABLED=false
DEFAULT_ADMIN_PASSWORD=
```

首次生产部署需要初始化管理员时，先执行 `npm run db:migrate`，再临时使用以下配置执行一次 `npm run admin:bootstrap`：

```text
CREATE_FIRST_USER_AS_ADMIN=false
ADMIN_EMAILS=
DEFAULT_ADMIN_ENABLED=true
DEFAULT_ADMIN_PASSWORD=<至少 16 位的非占位强密码>
```

初始化成功后立即恢复长期生产配置、清空初始化密码并重启后端。`DEFAULT_ADMIN_RESET_PASSWORD_ON_BOOTSTRAP=false` 必须保持不变；只有明确需要重置该账号密码时才临时开启。未实现邮箱验证前，生产环境不允许通过 `ADMIN_EMAILS` 自动提权。

## 数据原则

- API 不使用客户端静态数组作为业务数据 fallback。
- PostgreSQL 未配置、未迁移或连接失败时，后端返回明确错误。
- AI ID 为注册时生成的 12 位纯数字标识，生成后不随手机号、邮箱、其他账号删除或重复迁移而改变。迁移只为非 12 位旧标识分配新值，并确保 `users_ai_id_seq` 不低于现有 AI ID 的最大前 6 位。前 6 位来自该顺序号；手机号注册时后 6 位取手机号后六位；邮箱注册时后 6 位取规范化邮箱的 SHA-256 摘要并转换为 6 位数字，不直接暴露邮箱字符。
- `agent_runs.token_total` 等字段只有接入真实模型供应商并返回用量后才写入；未配置 provider 时记录为 `not-configured`，不伪造 token。
- 后台启用/停用、角色调整、重置密码等管理动作会写入 `usage_events`。

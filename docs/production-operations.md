# 生产运维入口

忘记账号用途、文件位置或操作顺序时，只查看本页及其链接，不依赖聊天记录或个人记忆。本页只
记录标识和位置，不记录密码、AccessKey、Token、私钥内容或用户数据。

## 日常是否需要操作

- 2026-09-15 已完成一次真实 OSS 往返下载、解密和 PostgreSQL 18 隔离恢复演练；生产 timer
  当前使用隔离账号和加密异地链路。
- App、后端、worker 和数据库由 systemd 管理，正常情况下无需手动启动。
- 数据库每六小时自动创建本机备份，并把加密副本上传到独立 OSS Bucket。
- 每周只检查最近一次备份任务，每月检查 OSS 配置，每季度做一次隔离恢复演练。
- 任何密钥轮换、数据库恢复、生产迁移或删除操作都必须先按对应手册检查并保留证据。

## 身份用途

| 标识 | 类型 | 唯一用途 | 是否人工登录 |
| --- | --- | --- | --- |
| 阿里云主账号 | 人员账号 | 管理 ECS、OSS 和 RAM | 是 |
| `marvels-chat-oss-prod` | RAM 机器账号 | 后端读写业务媒体 Bucket `marvels-chat` | 否 |
| `miaoxun-postgresql-backup-prod` | RAM 机器账号 | 备份程序访问 `miaoxun-chats/postgresql/v1/` | 否 |
| `marvels` | ECS 系统账号 | 运行后端和媒体检索 worker | 否 |
| `marvels-backup` | ECS 系统账号 | 运行隔离的数据库备份任务 | 否 |
| `marvels_chat` | PostgreSQL 角色 | 后端读写业务数据库 | 否 |
| `marvels_chat_backup` | PostgreSQL 角色 | 只读导出数据库备份 | 否 |
| `pize` | PostgreSQL 角色 | 通过 SSH 隧道人工只读查看 | 是 |

这些身份不能合并：人员账号、应用账号和备份账号的权限边界不同。机器账号的凭据由服务读取，
不需要负责人记忆，也不应拿来登录控制台。

首次初始化服务器备份凭据时只运行
`scripts/configure-production-database-backup.sh <aliyun-access-key.csv>`；数据库随机密码和 RAM
AccessKey 会直接进入 root-only 配置，不需要负责人记录或输入。

## 凭据位置

| 内容 | 保存位置 |
| --- | --- |
| 后端数据库与业务 OSS 凭据 | ECS `/opt/projects/marvels-chat/app/deploy/miaoxun-prod.env` |
| 异地备份数据库与 OSS 凭据 | ECS `/etc/marvels-chat/database-backup.env` |
| 备份加密公钥证书 | ECS `/etc/marvels-chat/database-backup-recipient.pem` |
| 恢复私钥与本机公钥副本 | macOS `$HOME/Documents/Miaoxun-Recovery/` |
| 恢复私钥口令 | macOS 登录钥匙串 `com.miaoxun.database-backup.recovery` |

生产后端环境文件由 `root:marvels` 持有、权限为 `0640`，只供 root 管理和后端服务账号读取；
独立备份环境文件为 `root:root 0600`。恢复私钥不能上传到 ECS、Git 或 OSS。AccessKey 创建结果导入
服务器后必须从下载目录和服务器临时目录删除。

## 常用入口

- 部署与服务状态：[部署说明](deployment.md)
- 数据库结构、连接与 Navicat：[数据库说明](database.md)
- 备份、监控、轮换与恢复：[生产数据库备份与恢复](database-backup.md)
- 负责人手机保管与灾难恢复：[数据库恢复与手机保管手册](database-recovery-owner-guide.md)
- 上线门禁：[移动端上线功能实施清单](mobile-launch-checklist.md)

在当前受控 macOS 运维机上，下载同一恢复点的 `.cms` 和 `.manifest.json` 后，只运行：

```sh
scripts/recover-offsite-database-backup-macos.sh \
  <archive.cms> \
  <manifest.json> \
  <output.dump>
```

系统会请求钥匙串授权，自动使用仓库之外的证书和私钥，并在退出时删除临时口令文件。该命令
只生成经过验证的 dump，不连接或修改生产数据库。

恢复密钥正常情况下十年内无需重新初始化。只有首次配置或经批准轮换时运行：

```sh
scripts/create-database-backup-recovery-key-macos.sh
```

该脚本生成随机口令并直接保存在登录钥匙串，不要求负责人设置或记忆口令。

# 生产数据库备份与恢复

## 目标架构

生产 PostgreSQL 运行在 ECS 本机，`scripts/backup-production-database.sh` 每六小时创建一次
custom dump。备份分为两层：

1. ECS 本机保存原始 dump 和 SHA-256，默认保留 30 天，用于快速恢复。
2. 同一份 dump 使用离线恢复公钥加密为 CMS AuthEnvelopedData，内容加密算法固定为
   AES-256-GCM，密钥传输固定为 RSA-OAEP-SHA256，再上传到独立的私有 OSS Bucket。

服务器只保存公钥。匹配的加密私钥必须保存在 ECS、Git 仓库和业务 OSS 之外。上传成功后，
脚本会通过 OSS `HEAD` 校验对象大小、单对象 ETag 和四项完整性元数据，随后才上传 manifest
作为该恢复点完整可用的标记。任何配置、加密、上传或校验失败都会使 systemd 任务失败，
不会把本机备份伪装成异地备份成功。

这套方案使用现有 OSS 服务，不需要采购 PolarDB 或另一套数据库。独立 Bucket、存储量和请求
会产生少量 OSS 按量费用。ECS 自动云盘快照可作为第三层保护，但不能替代可独立恢复的逻辑备份。

## OSS 与 RAM 配置

在阿里云控制台创建一个与 ECS 同地域的专用 Bucket：

- ACL 必须为私有，并开启阻止公共访问。
- 名称必须全局唯一；不要复用业务 Bucket `marvels-chat`。
- 开启版本控制。
- 为 `postgresql/v1/` 配置生命周期：当前版本保留 90 天，非当前版本保留 30 天。
- 不配置静态网站、公共读、跨域上传或 CDN。
- 保留服务端 AES256 加密；上传脚本同时执行客户端 AES-256-GCM 加密。

当前上传器对超过 5 GiB 的单个密文会明确失败。每日检查任务失败状态；当 custom dump 接近
4 GiB 时，必须在达到限制前评审并上线分片上传，不能临时降低备份范围或跳过完整性校验。

OSS 保留策略一旦锁定便不能缩短。需要 WORM 时，先用非生产 Bucket 验证恢复和生命周期，再由
负责人单独批准锁定；部署脚本不会自动开启不可逆保留策略。

创建独立 RAM 用户，只生成这一套备份 AccessKey。将 `<backup-bucket>` 替换为实际 Bucket 名，
绑定以下最小权限策略：

```json
{
  "Version": "1",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "oss:PutObject",
        "oss:GetObject"
      ],
      "Resource": [
        "acs:oss:*:*:<backup-bucket>/postgresql/v1/*"
      ]
    }
  ]
}
```

该身份不授予 `ListObjects`、`DeleteObject`、Bucket 配置或其他 Bucket 权限。业务应用 RAM 用户也
不得访问备份 Bucket。AccessKey 只写入服务器 root 可读的独立环境文件，不写入
`deploy/miaoxun-prod.env`。

## 离线恢复密钥

在不属于 ECS 的受控 macOS 电脑上生成加密私钥和十年期恢复证书。初始化脚本会生成随机口令，
直接保存到登录钥匙串；口令不会出现在命令参数、Shell 历史或仓库中，也不依赖操作员记忆：

```sh
scripts/create-database-backup-recovery-key-macos.sh
```

脚本拒绝覆盖已有私钥、证书或钥匙串项。任何一步失败时，它会删除本次创建的不完整输出。
私钥至少保存两份加密离线副本，并记录保管人与恢复口令交接方式。只把
`miaoxun-db-backup-recipient.pem` 公钥证书复制到 ECS。轮换时先部署新公钥，再保留旧私钥至
所有旧恢复点过期；不能提前删除旧私钥。

当前 macOS 运维机将随机口令保存在登录钥匙串的
`com.miaoxun.database-backup.recovery` 通用密码项中，加密私钥和证书保存在仓库之外的
`$HOME/Documents/Miaoxun-Recovery/`。钥匙串项与加密私钥必须分别纳入受控备份，不能把当前
电脑作为唯一恢复副本。

## ECS 安装

将公钥证书安装为 root 拥有、不可写的文件：

```sh
sudo install -d -o root -g root -m 0755 /etc/marvels-chat
sudo install -o root -g root -m 0644 \
  miaoxun-db-backup-recipient.pem \
  /etc/marvels-chat/database-backup-recipient.pem
```

把阿里云 RAM 控制台导出的单用户 AccessKey CSV 传入初始化脚本。脚本只接受
`miaoxun-postgresql-backup-prod`，要求 CSV 为 `root:root 0600`，自动生成随机数据库密码、创建
`marvels_chat_backup` 只读角色、验证 `pg_dump --schema-only`，并写入 root-only 环境文件：

```sh
sudo scripts/configure-production-database-backup.sh \
  /root/.miaoxun-postgresql-backup-access-key.csv
sudo stat -c '%U:%G %a %n' /etc/marvels-chat/database-backup.env
```

该角色不授予写入、建表、角色管理或数据库创建权限。脚本拒绝覆盖已有角色或配置；失败时撤销
本次创建的角色和临时文件。CSV 在真实上传与恢复演练通过前保留，验证完成后立即精确删除。

配置和公钥准备完成后，安装脚本会创建无登录 Shell 的 `marvels-backup` 系统用户，把实际执行
文件复制到 root 管理的 `/usr/local/libexec/marvels-chat`，并把 systemd 单元写入磁盘。安装脚本
会拒绝空配置或不安全的文件权限；公钥证书必须严格保持 `root:root 0644`，确保独立备份用户
只能读取。备份父目录保持 `root:marvels-backup 0710`，只允许备份组穿过；实际备份目录保持
`marvels-backup:marvels-backup 0700`。安装脚本不会 reload systemd，也不会自行停止、启动或
启用 timer：

```sh
sudo scripts/install-production-database-backup.sh
```

先在不 reload 现有单元的前提下，通过受限的临时 systemd service 完成真实上传和隔离恢复演练。
验证通过后停止旧 timer，再加载并启用新单元：

```sh
sudo systemctl stop marvels-chat-database-backup.timer
sudo systemd-analyze verify \
  /etc/systemd/system/marvels-chat-database-backup.service \
  /etc/systemd/system/marvels-chat-database-backup.timer
sudo systemctl daemon-reload
sudo systemctl enable --now marvels-chat-database-backup.timer
sudo systemctl start marvels-chat-database-backup.service
sudo systemctl status marvels-chat-database-backup.service --no-pager
sudo journalctl -u marvels-chat-database-backup.service -n 80 --no-pager
```

一次成功任务应在 OSS 中产生同名的一对对象：

```text
postgresql/v1/marvels_chat-YYYYMMDDTHHMMSSZ.dump.cms
postgresql/v1/marvels_chat-YYYYMMDDTHHMMSSZ.dump.cms.manifest.json
```

只有同时存在 manifest 的归档才视为完整恢复点。不得把 AccessKey、签名 URL 或 manifest 之外的
内部响应内容写入日志。

## 恢复与演练

在隔离恢复机上从 OSS 控制台或受控下载身份获取同一恢复点的 `.cms` 与
`.manifest.json`。当前 macOS 运维机使用固定恢复目录和登录钥匙串，可以通过单一入口完成
校验与解密：

生产 ECS 安装的 `download-production-database-backup.mjs` 只接受规范命名的归档或 manifest，
并复用专用 RAM 身份的 `GetObject` 权限。它把对象写到标准输出，必须重定向到权限为 `0600`
的临时文件；不得把 AccessKey 或签名 URL 复制到恢复机。

```sh
scripts/recover-offsite-database-backup-macos.sh \
  marvels_chat-YYYYMMDDTHHMMSSZ.dump.cms \
  marvels_chat-YYYYMMDDTHHMMSSZ.dump.cms.manifest.json \
  recovered.dump
```

该入口从 `com.miaoxun.database-backup.recovery` 钥匙串项读取口令，退出时自动删除临时口令
文件。底层解密脚本仍显式接收一个仅当前用户可读的口令文件。命令会先校验密文大小、
SHA-256、Content-MD5 和证书指纹，再解密并校验明文 SHA-256、`schema_migrations` 与 pgvector
扩展。它拒绝覆盖已有输出，也不会连接或修改数据库。

季度恢复演练必须在独立 PostgreSQL 18 + pgvector 实例完成：创建空库、恢复 `recovered.dump`、
运行迁移状态检查和关键表行数核对，再销毁该演练实例。生产恢复仍使用
`scripts/restore-production-database.sh <dump> <approved-sha256>`，并严格遵守停服、备份审批、
迁移和 `/api/ready` 验证顺序。

每次演练记录以下证据，不记录用户数据或凭据：

- OSS object key、manifest schema 版本和两项 SHA-256。
- 下载、解密、`pg_restore`、迁移状态与 readiness 结果。
- 恢复点时间、演练开始/结束时间、RPO、RTO 和操作人。
- 失败原因、修复措施及下一次演练日期。

## 运维检查

每周检查 timer 和最近一次任务：

```sh
sudo systemctl list-timers marvels-chat-database-backup.timer --no-pager
sudo systemctl show marvels-chat-database-backup.service \
  -p Result -p ExecMainStatus -p ExecMainStartTimestamp -p ExecMainExitTimestamp
sudo journalctl -u marvels-chat-database-backup.service --since '7 days ago' --no-pager
```

每月确认 Bucket 仍为私有、版本控制与生命周期规则未变，RAM 权限没有扩大，最近恢复点具备
配对 manifest。每季度执行一次完整恢复演练。AccessKey 泄露时立即禁用该 RAM Key、创建新 Key、
更新 root-only 环境文件并手动运行一次备份；不要复用业务 OSS 凭据作为临时替代。

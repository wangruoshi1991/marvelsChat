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

在不属于 ECS 的受控电脑上生成加密私钥和十年期恢复证书。命令会交互式要求私钥口令，口令
不得出现在命令参数、Shell 历史或仓库中：

```sh
umask 077
openssl genpkey \
  -algorithm RSA \
  -pkeyopt rsa_keygen_bits:3072 \
  -aes-256-cbc \
  -out miaoxun-db-backup-private-key.pem
openssl req \
  -new \
  -x509 \
  -sha256 \
  -days 3650 \
  -key miaoxun-db-backup-private-key.pem \
  -out miaoxun-db-backup-recipient.pem \
  -subj '/CN=Miaoxun Database Backup Recovery/'
chmod 0600 miaoxun-db-backup-private-key.pem
chmod 0644 miaoxun-db-backup-recipient.pem
```

私钥至少保存两份加密离线副本，并记录保管人与恢复口令交接方式。只把
`miaoxun-db-backup-recipient.pem` 公钥证书复制到 ECS。轮换时先部署新公钥，再保留旧私钥至
所有旧恢复点过期；不能提前删除旧私钥。

## ECS 安装

将公钥证书安装为 root 拥有、不可写的文件：

```sh
sudo install -d -o root -g root -m 0755 /etc/marvels-chat
sudo install -o root -g root -m 0644 \
  miaoxun-db-backup-recipient.pem \
  /etc/marvels-chat/database-backup-recipient.pem
```

先在 PostgreSQL 创建只读备份角色 `marvels_chat_backup`。密码通过 `psql` 的 `\password`
交互设置，不得写入 SQL 文本或 Shell 历史：

```sql
CREATE ROLE marvels_chat_backup
  LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION BYPASSRLS
  CONNECTION LIMIT 2;
GRANT pg_read_all_data TO marvels_chat_backup;
GRANT CONNECT ON DATABASE marvels_chat TO marvels_chat_backup;
ALTER ROLE marvels_chat_backup SET statement_timeout = '30min';
\password marvels_chat_backup
```

该角色不授予写入、建表、角色管理或数据库创建权限。创建后必须用它执行一次
`pg_dump --schema-only` 和一次完整 custom dump，确认现有对象都可读取。

通过 `sudoedit` 在 `/etc/marvels-chat/database-backup.env` 交互填写只读数据库密码和专用
RAM AccessKey，不要在命令行传入凭据：

```sh
sudo install -d -o root -g root -m 0755 /etc/marvels-chat
sudo install -o root -g root -m 0600 \
  deploy/miaoxun-database-backup.env.example \
  /etc/marvels-chat/database-backup.env
sudoedit /etc/marvels-chat/database-backup.env
sudo stat -c '%U:%G %a %n' /etc/marvels-chat/database-backup.env
```

配置和公钥准备完成后，安装脚本会创建无登录 Shell 的 `marvels-backup` 系统用户，把实际执行
文件复制到 root 管理的 `/usr/local/libexec/marvels-chat`，并安装 systemd 单元。安装脚本会拒绝
空配置或不安全的文件权限；公钥证书必须严格保持 `root:root 0644`，确保独立备份用户只能读取。
安装脚本不会自行启动或启用 timer：

```sh
sudo systemctl stop marvels-chat-database-backup.timer
sudo scripts/install-production-database-backup.sh
```

随后验证并重新启用 systemd 单元：

```sh
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
`.manifest.json`。把恢复证书和离线私钥放入仅当前操作员可读的临时目录，然后执行：

```sh
scripts/decrypt-production-database-backup.sh \
  marvels_chat-YYYYMMDDTHHMMSSZ.dump.cms \
  marvels_chat-YYYYMMDDTHHMMSSZ.dump.cms.manifest.json \
  miaoxun-db-backup-recipient.pem \
  miaoxun-db-backup-private-key.pem \
  recovered.dump
```

该命令会先校验密文大小、SHA-256、Content-MD5 和证书指纹，再解密并校验明文 SHA-256、
`schema_migrations` 与 pgvector 扩展。它拒绝覆盖已有输出，也不会连接或修改数据库。

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

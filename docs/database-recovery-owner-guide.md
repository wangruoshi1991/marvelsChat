# 妙讯生产数据库恢复与手机保管手册

版本：2026-09-15 修订 2

本次修订：隔离演练只开放受限 Unix socket；新电脑安装恢复文件前显式创建目标目录。已发送的首版 PDF 中相应命令以本版为准，恢复密钥和口令不变。

适用项目：Miaoxun / `marvelsChat`

对应仓库提交：`8c4d5a9`

> 这份手册用于负责人在忘记操作细节、更换电脑或发生生产故障时，重新找到正确的恢复路径。
> 手册不包含任何密码、AccessKey、Token、SSH 私钥或数据库用户数据。

## 先看这一页

妙讯生产数据当前有两层自动备份：

1. ECS 本机每 6 小时生成一份 PostgreSQL custom dump，默认保留 30 天。
2. 同一份 dump 经 AES-256-GCM 加密后上传到私有 OSS Bucket `miaoxun-chats` 的
   `postgresql/v1/` 前缀，当前版本保留 90 天。

手机恢复包负责保管“解锁工具”，OSS 负责保管“加密备份”。两者缺一不可。恢复包中的私钥本身
已经加密，但它的口令不能和恢复包放在同一条微信消息、同一个 ZIP 或同一个普通备忘录中。

发生故障时只做以下六件事：

1. 不要重新生成恢复密钥，不要删除 OSS 对象，不要执行全局清理。
2. 先停止后端和媒体检索 worker，阻止新的业务写入。
3. 在 OSS 中选择最新一组同名 `.cms` 和 `.manifest.json` 文件。
4. 先校验、解密，再在隔离 PostgreSQL 18 环境完成恢复演练。
5. 只有隔离恢复验证通过，才允许执行生产恢复。
6. 生产恢复后运行迁移并同时验证 `/api/health` 与 `/api/ready`。

## 一次性手机保管

收到微信中的 PDF 和 ZIP 后，在 iPhone 上完成以下操作：

1. 在微信“文件传输助手”中打开 ZIP，选择“用其他应用打开”或“存储到文件”。
2. 保存到“文件”App 的“我的 iPhone/Miaoxun-Recovery/”，不要只依赖微信聊天缓存。
3. 打开 ZIP，确认能看到 `README-FIRST.txt`、本手册、两份 PEM 文件、恢复脚本和
   `SHA256SUMS.txt`。
4. 不要在手机上打开、编辑或重新保存 PEM 文件。
5. 在 iPhone“密码”App 中单独建立条目，建议名称为“妙讯数据库恢复私钥口令”。
6. 从当前 Mac 钥匙串中取得现有口令并填入该条目。不要生成新口令，也不要把口令发到微信。
7. 确认“密码”App 已通过 iCloud 钥匙串同步后，再把手机作为第二份恢复入口。

微信文件可能过期或被清理，因此“已发到微信”不等于“已经安全保存”。最终检查标准是：ZIP 已经
进入“文件”App，口令已经单独进入“密码”App，并且二者都能在手机上找到。

## 当前生产架构

```text
iOS App
  -> HTTPS / Nginx
  -> marvels-chat-backend (Node.js)
  -> PostgreSQL 18 on ECS, 127.0.0.1:5432 only

PostgreSQL
  -> every 6 hours: local custom dump on ECS
  -> CMS AuthEnvelopedData / AES-256-GCM encryption
  -> private OSS: miaoxun-chats/postgresql/v1/

Recovery
  -> encrypted archive + manifest from OSS
  -> encrypted private key from phone recovery package
  -> passphrase from Apple Passwords / macOS Keychain
  -> verified plaintext dump
  -> isolated restore first, production restore second
```

移动端不会直接连接数据库。数据库只监听 ECS 本机回环地址；公网用户通过 HTTPS 后端访问业务
数据。OSS 中的数据库归档也是客户端加密后的密文，不能直接作为 PostgreSQL 文件打开。

## 账号与用途

| 标识 | 类型 | 唯一用途 | 人工登录 |
| --- | --- | --- | --- |
| 阿里云主账号 | 人员账号 | 管理 ECS、OSS、RAM | 是 |
| `marvels-chat-oss-prod` | RAM 机器账号 | 后端读写业务媒体 Bucket | 否 |
| `miaoxun-postgresql-backup-prod` | RAM 机器账号 | 备份程序访问异地备份前缀 | 否 |
| `marvels` | ECS 系统账号 | 运行后端和媒体检索 worker | 否 |
| `marvels-backup` | ECS 系统账号 | 运行数据库备份任务 | 否 |
| `marvels_chat` | PostgreSQL 角色 | 后端读写业务数据库 | 否 |
| `marvels_chat_backup` | PostgreSQL 角色 | 只读导出数据库 | 否 |
| `pize` | PostgreSQL 角色 | 通过 SSH 隧道人工只读查看 | 是 |

这些账号不能合并。机器账号由服务自动使用，不需要负责人记住密码，也不应用来登录阿里云控制台。

## 文件与凭据位置

| 内容 | 正确位置 |
| --- | --- |
| 生产后端环境 | ECS `/opt/projects/marvels-chat/app/deploy/miaoxun-prod.env` |
| 备份专用环境 | ECS `/etc/marvels-chat/database-backup.env` |
| ECS 加密公钥 | ECS `/etc/marvels-chat/database-backup-recipient.pem` |
| ECS 本机 dump | ECS `/opt/projects/marvels-chat/database/backups/` |
| OSS 加密备份 | `miaoxun-chats/postgresql/v1/` |
| 当前 Mac 恢复密钥 | `$HOME/Documents/Miaoxun-Recovery/` |
| 当前 Mac 口令 | 登录钥匙串服务 `com.miaoxun.database-backup.recovery` |
| 手机密钥副本 | “文件”App 的 `Miaoxun-Recovery` 目录 |
| 手机口令副本 | Apple“密码”App，和 ZIP 分开保存 |

恢复私钥不得上传到 ECS、GitHub 或业务 OSS。生产环境文件只允许 root 读取。任何文档、工单或聊天
记录都不应包含密码、AccessKey、Token 或私钥正文。

## 恢复包内容

```text
Miaoxun-Database-Recovery-20260915/
  README-FIRST.txt
  Miaoxun-Database-Recovery-Owner-Guide.pdf
  miaoxun-db-backup-private-key.pem
  miaoxun-db-backup-recipient.pem
  SHA256SUMS.txt
  recovery-tools/
    recover-offsite-database-backup-macos.sh
    decrypt-production-database-backup.sh
    verify-offsite-database-backup.mjs
    upload-production-database-backup.mjs
    download-production-database-backup.mjs
    restore-production-database.sh
```

`miaoxun-db-backup-private-key.pem` 必须以 `BEGIN ENCRYPTED PRIVATE KEY` 开头。它不是明文私钥，
但仍属于敏感恢复材料。`SHA256SUMS.txt` 用于检查恢复包解压后的文件是否被破坏或替换。

## 平时无需操作

- 不需要每天手动备份或启动数据库。
- 不需要记住机器账号密码或 RAM AccessKey。
- 不需要把数据库开放到公网，也不需要让 App 直连 PostgreSQL。
- 不需要定期重新生成恢复私钥。当前证书为十年期，轮换必须单独审批。
- 不需要保留 AccessKey CSV、下载的明文 dump 或恢复演练临时库。

## 固定检查安排

### 每周：确认自动任务成功

登录 ECS 后执行：

```sh
sudo systemctl list-timers \
  marvels-chat-database-backup.timer --no-pager
sudo systemctl show marvels-chat-database-backup.service \
  -p Result -p ExecMainStatus \
  -p ExecMainStartTimestamp -p ExecMainExitTimestamp
sudo journalctl -u marvels-chat-database-backup.service \
  --since '7 days ago' --no-pager
```

通过标准：timer 为 active，最近任务 `Result=success`、`ExecMainStatus=0`，日志中没有上传、校验、
权限、证书或数据库错误。日志不得包含凭据。

### 每月：确认 OSS 与权限边界

1. Bucket `miaoxun-chats` 仍为私有并阻止公共访问。
2. 版本控制仍开启。
3. `postgresql/v1/` 生命周期仍为当前版本 90 天、非当前版本 30 天。
4. 最新恢复点同时存在 `.cms` 与 `.cms.manifest.json`。
5. RAM 账号仍只拥有该前缀的 `PutObject` 和 `GetObject`，没有删除和 Bucket 管理权限。
6. 业务应用账号仍不能读取备份 Bucket。

### 每季度：完成一次真实恢复演练

下载一组最新归档，在独立 PostgreSQL 18 环境完成校验、解密、恢复和业务表检查。记录恢复点、
开始与结束时间、RPO、RTO、迁移数量、pgvector 版本、关键表检查结果和操作人，不记录用户数据或
任何凭据。演练后删除明文 dump、下载副本和临时数据库。

## 如何选择可恢复备份

在 OSS 的 `miaoxun-chats/postgresql/v1/` 中，每个有效恢复点都必须有一对同名文件：

```text
marvels_chat-YYYYMMDDTHHMMSSZ.dump.cms
marvels_chat-YYYYMMDDTHHMMSSZ.dump.cms.manifest.json
```

时间是 UTC。优先选择事故发生前最新的一对文件。只有 `.cms` 而没有 manifest 的对象不算完整
恢复点；文件时间相近但 basename 不一致，也不能拼在一起使用。不要把当前生产事故后的异常备份
误认为正确恢复点。

## 场景 A：当前 Mac 仍可用

### 1. 建立受限工作目录

```sh
mkdir -p "$HOME/Documents/Miaoxun-DB-Restore"
chmod 700 "$HOME/Documents/Miaoxun-DB-Restore"
```

从 OSS 控制台下载同一恢复点的 `.cms` 和 `.manifest.json` 到该目录。不要通过聊天工具传输明文
dump。

### 2. 校验并解密

在 `marvelsChat` 仓库根目录执行，把示例文件名替换为实际同名文件：

```sh
scripts/recover-offsite-database-backup-macos.sh \
  "$HOME/Documents/Miaoxun-DB-Restore/<archive>.cms" \
  "$HOME/Documents/Miaoxun-DB-Restore/<archive>.cms.manifest.json" \
  "$HOME/Documents/Miaoxun-DB-Restore/recovered.dump"
```

脚本会从 macOS 登录钥匙串读取口令，依次验证密文大小、SHA-256、Content-MD5、证书指纹和明文
SHA-256，再检查 custom dump 中的迁移账本与 pgvector。它不会连接或修改数据库，也拒绝覆盖已有
输出。

### 3. 先做隔离恢复

隔离环境必须使用 PostgreSQL 18 并安装 pgvector。示例只使用当前用户专属目录中的 Unix socket，不监听 TCP：

```sh
export MX_DRILL="$HOME/Documents/Miaoxun-DB-Restore/drill"
mkdir -p "$MX_DRILL"
chmod 700 "$MX_DRILL"
mkdir -p "$MX_DRILL/socket"
chmod 700 "$MX_DRILL/socket"
initdb -D "$MX_DRILL/data" --auth-local=trust --auth-host=reject
pg_ctl -D "$MX_DRILL/data" \
  -o "-p 55432 -h '' -k '$MX_DRILL/socket'" \
  -l "$MX_DRILL/postgres.log" start
createdb -h "$MX_DRILL/socket" -p 55432 miaoxun_restore_drill
psql -h "$MX_DRILL/socket" -p 55432 -d miaoxun_restore_drill \
  -c 'CREATE EXTENSION vector'
pg_restore -h "$MX_DRILL/socket" -p 55432 \
  --dbname=miaoxun_restore_drill \
  --no-owner --no-acl --exit-on-error \
  "$HOME/Documents/Miaoxun-DB-Restore/recovered.dump"
```

socket 目录必须保持 `0700` 权限，且使用一个新的空演练目录。不要把这些恢复命令改为任何生产连接。

### 4. 验证隔离结果

```sh
psql -h "$MX_DRILL/socket" -p 55432 -d miaoxun_restore_drill \
  -c 'SELECT count(*) AS migrations FROM schema_migrations;'
psql -h "$MX_DRILL/socket" -p 55432 -d miaoxun_restore_drill \
  -c "SELECT extversion FROM pg_extension WHERE extname='vector';"
psql -h "$MX_DRILL/socket" -p 55432 -d miaoxun_restore_drill \
  -c "SELECT count(*) AS public_tables FROM information_schema.tables
      WHERE table_schema='public' AND table_type='BASE TABLE';"
psql -h "$MX_DRILL/socket" -p 55432 -d miaoxun_restore_drill \
  -c "SELECT to_regclass(name) FROM (VALUES
      ('users'), ('chat_threads'), ('chat_messages'),
      ('avatar_3d_models'), ('station_posts'),
      ('media_retrieval_jobs')) AS required(name);"
```

通过标准：迁移账本可读且与目标发布版本匹配，`vector` 可用，关键表均返回表名而不是 null。表数和
迁移数会随版本增加，不能永远写死；2026-09-15 的已验证基线是 29 个迁移、pgvector 0.8.6 和
50 张 public 表。

### 5. 销毁演练环境

```sh
pg_ctl -D "$MX_DRILL/data" stop
test "$MX_DRILL" = \
  "$HOME/Documents/Miaoxun-DB-Restore/drill" && \
  rm -rf -- "$MX_DRILL"
rm -f "$HOME/Documents/Miaoxun-DB-Restore/recovered.dump"
rm -f "$HOME/Documents/Miaoxun-DB-Restore/"*.cms
rm -f "$HOME/Documents/Miaoxun-DB-Restore/"*.manifest.json
```

删除前先确认路径确实是本次演练目录。不要运行全局 Docker prune、模糊通配清理服务器或删除 OSS
对象。

## 场景 B：Mac 丢失或更换

### 1. 从手机取回恢复包

从 iPhone“文件”App 把 ZIP 传到新 Mac。不要从不明聊天记录或第三方网盘下载同名私钥。先检查：

```sh
unzip -t Miaoxun-Database-Recovery-20260915.zip
export MX_PACKAGE="$HOME/Documents/Miaoxun-Recovery-Package"
mkdir -p "$MX_PACKAGE"
chmod 700 "$MX_PACKAGE"
ditto -x -k Miaoxun-Database-Recovery-20260915.zip "$MX_PACKAGE"
cd "$MX_PACKAGE/Miaoxun-Database-Recovery-20260915"
```

解压后，在恢复包目录执行完整性检查：

```sh
shasum -a 256 -c SHA256SUMS.txt
```

所有条目必须显示 `OK`。随后把两份 PEM 放到固定目录并恢复权限：

```sh
mkdir -p "$HOME/Documents/Miaoxun-Recovery"
chmod 700 "$HOME/Documents/Miaoxun-Recovery"
install -m 0600 miaoxun-db-backup-private-key.pem \
  "$HOME/Documents/Miaoxun-Recovery/"
install -m 0644 miaoxun-db-backup-recipient.pem \
  "$HOME/Documents/Miaoxun-Recovery/"
```

### 2. 恢复钥匙串口令

在新 Mac 打开 Apple“密码”App，找到“妙讯数据库恢复私钥口令”。然后执行下面的命令；`-w` 放在
最后会让系统安全提示输入口令，不会把口令写入 Shell 历史：

```sh
security add-generic-password \
  -a "$USER" \
  -s com.miaoxun.database-backup.recovery \
  -l 'Miaoxun database backup recovery' \
  -j 'Private-key passphrase; do not export.' \
  -w
```

在提示中粘贴口令。不要把口令直接写在命令行参数、脚本、环境变量或文本文件中。验证条目存在时
不要加 `-w`，避免把口令打印到终端：

```sh
security find-generic-password \
  -a "$USER" \
  -s com.miaoxun.database-backup.recovery
```

### 3. 恢复工具

优先从 GitHub 克隆 Miaoxun 仓库，并确认至少包含提交 `8c4d5a9`。如果 GitHub 暂时不可用，可以
先使用 ZIP 中 `recovery-tools/` 的固定版本完成校验和解密。恢复生产前仍需取得与目标发布版本
一致的完整仓库和数据库迁移文件。

之后按“场景 A”下载备份、解密并执行隔离恢复。

## 生产恢复完整顺序

生产恢复会删除并重建目标数据库，必须由负责人明确批准，并在维护窗口执行。

### 1. 记录事故和目标恢复点

记录事故开始时间、最后可信写入时间、选中的 OSS object key、归档时间、操作者和批准人。确认
归档与 manifest 已通过本机隔离恢复。

### 2. 停止业务写入

```sh
sudo systemctl stop \
  marvels-chat-media-retrieval-worker \
  marvels-chat-backend
sudo systemctl is-active marvels-chat-backend
sudo systemctl is-active marvels-chat-media-retrieval-worker
```

两个服务都必须显示 inactive。不要用 `SIGKILL` 作为常规停服方式。

### 3. 保存事故现场

如果当前数据库仍可读，先保留一份独立的事故现场 dump 和 SHA-256，不要覆盖既有恢复点。若导出
失败，记录错误并保持停写，不要为了生成新备份而重新开放业务。

### 4. 把已验证 dump 安全传到 ECS

目标文件必须位于 root 管理的临时目录，权限为 `0600`。传输后在 ECS 重新计算 SHA-256，并与
隔离恢复时批准的明文 SHA-256 比较。不要把明文 dump 上传到 OSS、微信或 GitHub。

### 5. 执行受控恢复

```sh
cd /opt/projects/marvels-chat/app
sudo scripts/restore-production-database.sh \
  /root/<approved-recovered.dump> \
  <approved-plaintext-sha256>
```

该脚本只有在后端和 worker 都停止时才执行；它会再次检查 SHA-256、迁移账本和 vector 扩展，重建
目标数据库，并验证 public 对象归属、vector 和迁移表。

### 6. 运行当前版本迁移

```sh
cd /opt/projects/marvels-chat/app/backend
set -a
. ../deploy/miaoxun-prod.env
set +a
npm run db:migrate
```

迁移必须使用当前 systemd 服务使用的同一份生产环境文件。不要手工修改表来代替迁移。

### 7. 启动并验证

```sh
sudo systemctl start marvels-chat-backend
sudo systemctl start marvels-chat-media-retrieval-worker
sudo systemctl status marvels-chat-backend --no-pager
sudo systemctl status \
  marvels-chat-media-retrieval-worker --no-pager
curl --fail http://127.0.0.1:4390/api/health
curl --fail http://127.0.0.1:4390/api/ready
curl --fail https://8.153.167.11/api/health
curl --fail https://8.153.167.11/api/ready
```

`/api/health` 只表示进程存活；`/api/ready` 才会检查数据库连接、迁移文件、迁移账本和历史校验和。
两者都通过后，再验证登录、聊天、媒体读取、3D 模型和一个只读业务查询。确认稳定后才能结束维护
窗口。

### 8. 清理恢复临时文件

只精确删除本次上传的明文 dump、下载副本和临时目录。保留事故记录、非敏感校验结果和恢复时间。
不要删除 ECS 自动备份、OSS 恢复点、生产环境文件或恢复密钥。

## 常见故障判断

| 现象 | 含义与处理 |
| --- | --- |
| 只有 `.cms`，没有 manifest | 不是完整恢复点，换上一组完整文件 |
| manifest 校验失败 | 文件不匹配、损坏或被替换，停止恢复 |
| 证书指纹不匹配 | 私钥/证书不属于该批备份，找正确恢复包 |
| 钥匙串找不到口令 | 从 Apple“密码”App恢复原口令，不要生成新密钥 |
| 私钥口令错误 | 停止尝试，检查条目，不要修改 PEM |
| `pg_restore --list` 失败 | dump 无效或工具版本不兼容，停止恢复 |
| `vector` 扩展不存在 | 安装匹配的 pgvector 后重做隔离恢复 |
| `/api/health` 200、`/api/ready` 503 | 数据库或迁移未就绪，不能开放业务 |
| timer 失败 | 查看该 service 日志，按明确错误修复后手动验证一次 |

## 密钥或账号泄露

- 恢复 ZIP 泄露但口令未泄露：保留证据，评估后安排恢复证书轮换；不要删除旧私钥，直到所有用
  旧证书加密的 OSS 恢复点都过期或被安全重加密。
- 私钥和口令同时泄露：立即按重大安全事件处理，限制 OSS 读取身份，生成并部署新恢复证书，保留
  旧恢复链路直到完成历史恢复点处置。
- 备份 RAM AccessKey 泄露：立即禁用该 Key，创建新 Key，更新
  `/etc/marvels-chat/database-backup.env`，手动执行一次备份并验证，再删除旧 Key。
- 阿里云主账号异常：先冻结高风险操作，检查 RAM、OSS、ECS 登录与审计记录，不要先清日志。

## 绝对不要做

- 不要因为忘记口令就运行密钥生成脚本；新私钥无法解密旧备份。
- 不要把恢复私钥、口令、数据库密码或 AccessKey 提交到 GitHub。
- 不要把私钥口令放入恢复 ZIP、PDF、微信或普通备忘录。
- 不要开放公网 `5432`，Navicat 只能通过 SSH 隧道连接 `127.0.0.1:5432`。
- 不要跳过 manifest、SHA-256、证书指纹或隔离恢复。
- 不要在后端或 worker 仍运行时恢复生产数据库。
- 不要用“代码回滚”代替数据库回滚；迁移后的数据不会随 Git 回退。
- 不要运行全局 prune、模糊删除或清理其他项目的服务器资源。

## 当前已验证基线

2026-09-15 已完成一次真实闭环：生产任务生成 dump、客户端加密、OSS 上传与 HEAD 校验、manifest
发布、GetObject 下载、macOS 钥匙串解锁、解密、PostgreSQL 18.4 隔离恢复和结构检查。

- 仓库提交：`8c4d5a9`
- 数据库迁移：001-029，共 29 个，全部匹配
- PostgreSQL：18.4 隔离恢复通过
- pgvector：0.8.6
- public 表：50 张
- 后端、媒体检索 worker、PostgreSQL、Nginx：运行正常
- 本机 `/api/ready` 与公网 HTTPS health/readiness：通过
- 自动备份 timer：enabled / active，正式任务成功

这些数字是 2026-09-15 的证据快照，不是永久固定值。以后数据库迁移、表结构、域名或发布版本
变化时，应更新本手册并重新生成手机恢复包。

## 恢复完成记录模板

```text
事故编号：
事故开始时间：
目标恢复点 UTC：
OSS object key：
隔离恢复开始/结束：
生产恢复开始/结束：
RPO：
RTO：
仓库提交：
迁移检查：
pgvector 检查：
关键表检查：
/api/health：
/api/ready：
业务冒烟：
操作人：
批准人：
遗留事项：
```

## 负责人最短记忆

只需要记住四句话：

1. 数据在 PostgreSQL，密文备份在 `miaoxun-chats/postgresql/v1/`。
2. 加密私钥在手机恢复 ZIP，口令在 Apple“密码”App，两者分开。
3. 先隔离恢复，后生产恢复；先停写，后重建。
4. 最终以迁移检查和 `/api/ready` 通过为准，不以“服务能启动”为准。

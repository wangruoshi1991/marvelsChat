# 2026-11-10 漫画真实生图接入

用户明确要求接入已提供的媒体密钥并验证能否成图。本轮仅修改本地代码与隔离调用，没有生产部署、Agent产品发布、提交、推送或TestFlight上传；未读取私人图片或对话。

## 实际调用与图片检查

- 以指定媒体凭据请求 `GET https://api.cicadas.top/v1/models`，HTTP200，目录返回9个 `gpt-image-2` 系列型号。当前只放行实测的基础型号 `gpt-image-2`，不推定其他型号合同相同。
- 实际请求 `POST /v1/images/generations`，JSON包含 `model`、合成公开四格故事 `prompt`、`size:1024x1024`、`n:1`、`response_format:b64_json`。HTTP200，真实图片解码成功。四格内容为橘猫捡伞、寻找主人、归还白兔、雨后喝茶；目视主要角色、蓝围巾和黄伞基本一致。
- 实际请求 `POST /v1/images/edits`，multipart字段与上述相同，并上传刚生成的合成图 `image[]` WebP。HTTP200，得到同一橘猫/白兔在花店门前挥手的后续图；目视角色服饰、黄伞和水彩风格延续。未上传私人素材。接口支持最多4张显式选图的序列化有测试，真实请求本轮仅验证1张参考图。
- 再经正式 `createComicImageProvider` → 固定Cicadas适配器 → `normalizeComicImage` → 本地文件，实际生成四格种向日葵故事。HTTP成功、1024×1024、WebP 307872字节、SHA-256 `288d78882282e7010eac783674463d2f3b23f70143db0baa35f6f6150090a6ac`。真实回执为135 input tokens /196 output tokens /331 total tokens；没有价格证据，不推算费用。目视四格顺序清楚、蓝围巾和主要猫形象基本一致；不代表所有提示词、人物一致性或文字排版都能保证。
- 最终图片及派发前fsync回执保存在忽略目录 `output/comic-image-live-20261110-cicadas/`，私有secret在仓库外。累计3次生成/编辑请求，无自动重试；模型目录查询不计生图请求。

## 修改入口

- `backend/src/cicadas-image-adapter.js`：已验证固定host/base/model，纯文字与参考图两条路径，Bearer认证、禁止重定向与结果URL下载；有界JSON/base64及PNG/JPEG/WebP metadata校验。明确400/422、401/403、429拒绝，5xx及畸形响应保持未知。
- `backend/src/comic-image-provider-errors.js` 和 `comic-image-provider.js`：共享安全错误类型、正式适配器注册与精确配置门禁，保留注入式隔离测试。
- `backend/scripts/comic-image-live-smoke.js`：仅读取指定受限文件，独占0700输出目录/0600图片回执，派发前记录、单次调用、正式图片归一化；不加载其他dotenv配置，不输出凭据或raw响应。
- 对应 `cicadas-image-adapter.test.js`、`comic-image-live-smoke.test.js`，以及两份环境样例和模型配置文档。

## 验证与剩余边界

真实图片生成/编辑与正式Provider本地解码已通过；定向Provider、适配器、smoke、executor和storage共38项测试通过、0跳过。独立审查发现大base64嵌套正则可能抛RangeError，已用大于6MiB PNG回归先失败后通过，改为线性字符检查加canonical roundtrip。

`MIAOXUN_DOTENV_ENABLED=false ./scripts/check-repository.sh`退出0、`All repository checks passed`：RN99套1261项、Backend1115通过/374数据库门控跳过、Agents57、Admin49及各语法/构建/类型/样式检查通过。日志在`/tmp/miaoxun-comic-provider-20261110-check.log`；`git diff --check`通过。门控跳过不是本轮PG验收。本轮没有连接应用数据库、私有OSS、运行队列或启动RN；先前隔离PG证明不等同于这次真实Provider与数据库/OSS联合验收。漫画正式release/product、用户新权限确认、058迁移/API/Worker部署及新客户端仍需单独推进，不能据本轮成图称当前线上App已可生成。

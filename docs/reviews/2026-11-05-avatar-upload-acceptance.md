# 2026-11-05 Agent 头像上传与显示结构复核

## 结论与修复

头像上传、发布身份和移动端消费已有完整的受控资源合同，不需要改成外部图片 URL。确认存在显示结构不一致：RN 图片身份直接渲染 `Image`，而标记身份使用带底色、白环、固定尺寸和圆角的容器。透明图片会露出所在页面背景，无法与后台预览的身份底色一致，图片和标记的视觉边界也不同。

- `AgentGlyphAvatar` 的图片分支现在使用同样固定尺寸的裁切容器。透明区域显示该已发布身份的 `colors.background`，普通头像保留白环；讯页上下文保留原轮廓样式，显式 `radius` 继续生效。
- 图片使用容器内部的 100% 宽高，避免容器边框再叠加整尺寸图片而越界。保留 `cover`、受控 API origin、内容寻址 URL、加载失败的明确错误，以及 URL 变化后重新加载的行为；没有改为标记兜底。
- React 后台预览改用与 RN 相同的形状半径、白环和身份底色，增加 32/48 像素的常用手机尺寸预览。上传说明明确：非正方形图片按中心裁切，主体应居中留边，透明区域使用身份底色。
- 这次只处理 Agent 图片身份；个人账号头像、3D 模型和通用相册上传是不同链路，没有用 Agent 头像接口替代它们。

## 真实上传证据

使用本轮新建的独立本地 PostgreSQL 集群、56 项完整迁移和仓库真实发布 HTTP 验收脚本，未读取或修改生产账号/头像。脚本走正常管理员登录、权限检查、上传、草稿预览和发布流程；未调用模型或第三方图片服务。

增强 `backend/scripts/check-agent-publishing-integration.js`，实际生成并上传四张明确标记的程序测试图片：正方形、横图、竖图及透明 PNG。横竖图包含中心主体和不同色边缘，可以检测错误裁切；这些不是蓝湖正式设计资产。

| 验证 | 结果 |
| --- | --- |
| 四张图片真实 POST 上传 | 全部通过，生成 512×512 WebP |
| 横竖图中心裁切 | 主体保留，边缘裁除；检查内侧像素，避开重采样边界的一像素混色 |
| 透明图 | alpha 保留，未压成黑底/白底 |
| 原始元数据 | 输出不包含 EXIF |
| 草稿公开访问/管理员认证预览 | 分别 404/200 |
| 文件内容与返回 SHA-256 | 四张全部匹配 |
| 草稿缓存 | `private, no-store` |
| 发布引用资源 | 公共读取 200、正确 ETag、nosniff、明确公共缓存合同 |
| 上传幂等、身份修订、产品发布及 bootstrap/sync | 原有完整 HTTP 验收全部通过 |

首次新像素断言直接检查缩放后的最外缘，遇到图像重采样核混色失败；改检查内侧16像素后重建空专库再次跑完整流程，通过。没有修改头像转换逻辑或放宽颜色主体/尺寸/alpha/hash断言。

脱敏证据目录：`/tmp/miaoxun-avatar-20261105-IqBkVx/evidence/`，含四张原图、四张真实上传返回的 WebP、`avatar-upload-evidence.json`，以及 `avatar-reference-contact-sheet.png`。拼图只把真实 WebP 转为 PNG 并按头像框合成用于看裁切，不是 RN 或浏览器截图，不能代替设备验收。

## 验证命令

```sh
# DATABASE_URL 必须是专用、空的 loopback *_migration_test 数据库。
MIAOXUN_DOTENV_ENABLED=false DATABASE_URL=<isolated-test-url> node backend/scripts/db-migrate.js
MIAOXUN_DOTENV_ENABLED=false DATABASE_URL=<isolated-test-url> \
  MIAOXUN_AVATAR_EVIDENCE_DIR=<local-evidence-directory> \
  node backend/scripts/check-agent-publishing-integration.js

cd backend
MIAOXUN_DOTENV_ENABLED=false NODE_ENV=test DEFAULT_ADMIN_ENABLED=false node --test test/agent-avatar-assets.test.js
cd ../admin
npm test
npm run build
cd ../MiaoxunRN
npm test -- --runInBand agentImageIdentity agentIdentityContract
npx tsc --noEmit
npx eslint src/features/messages/AgentGlyphAvatar.tsx __tests__/agentImageIdentity.test.tsx
npx prettier --check src/features/messages/AgentGlyphAvatar.tsx __tests__/agentImageIdentity.test.tsx
```

结果：头像后端4/4、Admin49/49、RN11/11通过；新增两项 RN 结构回归先失败后通过；Admin build、TypeScript、ESLint、RN Prettier及 `git diff --check` 通过。Admin build仍提示既有主chunk超过500kB，不属于本次头像缺陷。

## 边界与发布

- 不需要数据库迁移或新增 API；沿用49/50建立的资源/展示快照合同。
- 需要后续客户端分发才能包含 RN 修复；后台预览改动需后台制品更新。本轮未提交、推送、部署或上传 TestFlight。
- 不修改生产 `AGENT_IMAGE_PUBLICATION_ENABLED` 门禁。后台可上传不等于图片身份已经发布或正式 App 已验收；开启门禁仍需先核对支持图片合同的实际客户端及目标范围。
- 未进行蓝湖资产导入、正式运营头像替换、真实设备裁切/网络缓存/无障碍验收；这次程序图验证不能认定正式图稿满足产品视觉要求。
- 隔离 API已由脚本停止，临时头像存储已删除；专用测试数据库已通过 `dropdb` 删除，PostgreSQL已停止且socket已清理。保留空集群、脱敏图片与执行日志，不保留本轮测试用户会话和口令。

# 2026-11-05 模拟器阶段验收

本轮由 Codex 操作模拟器推进，保留既有登录和工作区修改。以下仅记录实际结果；TestFlight Build59 已分发，本轮新增修复尚未进入该构建。

## 设备与构建

- 固定日常设备：iPhone17、iOS26.5，UDID `7E81531F-02AE-40FC-98DA-A575CEC9930F`。
- 正式 Bundle `com.wangruoshi.miaoxun`，正式 HTTPS API；没有另建临时 App 或修改 API origin。
- 命令：`node scripts/miaoxun-development.mjs ios`，两次正常构建安装均退出0。
- 最终构建：2026-11-05 12:50 +08:00，Debug `1.0 (58)`，源 HEAD `039e00c5731cd686214de58cb91d31c066b73d34` 加保留的未提交修改。工程 Build Number 未改。
- 内嵌 JS SHA256：`7567a2be8d8956efed36712c4ed07e3392a0717ca38e93b874356e92bd8d7d68`。构建前后源摘要一致，正常签名通过，安装后既有登录仍有效。安装器迁移了数据容器路径，不以路径变化推断登录丢失。
- 完整构建元数据位于本机 `MiaoxunDevelopment/1139656e744d/builds/2026-11-05T04-49-57-446Z/build.json`（该目录在 `~/Library/Application Support/` 下）。

## 确认并修复的问题

### 拍摄失败被当成取消

原生 image-picker 在相机不可用、权限拒绝等情况下可仅返回 `errorCode`。原实现只检查 `errorMessage`，随后把空 assets 归为取消，导致用户点击拍摄没有反馈。

- 修改 `MiaoxunRN/src/services/stationMediaPicker.ts`：统一校验 `errorCode/errorMessage`，为相机不可用、权限拒绝和其他失败提供明确中文原因及恢复指引。
- 正常取消保留原返回值；错误响应即使带 assets 也不能返回素材并继续上传。
- 新增 `MiaoxunRN/__tests__/stationMediaPicker.test.ts` 回归覆盖，修复前5项失败；修复后该文件与 `chatContentActions.test.tsx` 共27项通过。
- 最终模拟器实点“更多功能 → 添加拍摄”，显示“当前设备无法使用相机，请使用真机拍摄或从相册选择照片。”。未拍摄或上传文件。
- 该改动为 RN 服务层修复，未增加 Swift/Kotlin 业务逻辑，无 API/迁移变化。

### 手势测试假阳性

`MiaoxunRN/__tests__/appWorkspaceNavigation.test.tsx` 原测试对渲染 View 调用不存在的可选 PanResponder 配置名，可能没有触发交互就通过。现在使用真实 responder handlers 和 RN 触摸历史，验证实际 Animated 位移、转场锁、离页取消和返回后重新触发。新增位移断言先证明旧路径失败；修复后该文件9项通过，未修改业务手势代码或全局 mock。

## 模拟器验收矩阵

| 项目 | 本轮实际结果 | 边界 |
| --- | --- | --- |
| 登录/bootstrap | 原位正常签名重建后可读取既有登录 | 旧安装曾发生 Keychain entitlement 错误，不是已证实的后端错误；未清 token 或增加权限 |
| 讯页顶部提示 | 无“下拉进入二楼”文字 | 连续手势另列 |
| 二楼打开/返回 | 新建按钮暴露的“打开二楼”辅助操作和返回按钮可用 | 不等于连续拖动动画通过 |
| 相册页 | 保留上传/新建相册入口，无连接手机相册卡片 | 系统照片选择器打开后取消，未保存相册或上传 |
| 文件页 | 上传、最近文件、添加文字素材入口，无成果区域 | 系统 Files picker 打开后取消，当前无文件，未验文件正文长滚动 |
| 聊天输入 | 输入框显示，可输入并清空文本 | 没有发送消息或触发模型 |
| 聊天加号 | 八项入口存在，拍摄错误提示已实测 | 不能将入口存在视为八项业务全部通过 |
| 创建群聊 | 点击显示“创建群聊暂未接入，请先发起一对一聊天” | 未伪造群聊成功，真实能力仍未开放 |
| 微信/邮箱/日历 | 禁用且显示“尚未接入 · 暂不可管理” | 未授权，实际接入仍未完成 |
| 妙页 | 当前账号显示真实无任务动态空态 | 未创建生产测试任务，S0/S1/S2及聊天贡献尚不能设备验收 |
| 下拉/上滑 | CUA 拖动未稳定触发连续手势；有一次底部拖动返回也无法排除按压路径 | 无法据此判定 App 已通过或确定代码故障；待原生输入/实体设备验收 |
| 语音/相机 | 未录音、未授予新系统权限、未做真机拍摄 | 需实体设备能力验收 |
| UI-Agent/多 Agent | 本轮未触发模型，也未改变用户独立授权 | 隔离 Runner 链路既有证据不等于真实模型效果 |

## 验证

本轮最终业务改动完成后执行：

```sh
MIAOXUN_DOTENV_ENABLED=false ./scripts/check-repository.sh
git diff --check
```

整仓检查退出0，日志末行 `REPOSITORY_CHECK_EXIT_CODE=0`：

- RN：86套、1101项通过；TypeScript、ESLint `--max-warnings=0`、Prettier通过。
- Backend：1355项总计，1049通过、306数据库门控跳过、0失败。跳过不计为集成验收。
- Agents55、Admin48、Avatar Web29、Media Retrieval Web3、release packaging1通过。
- 各包语法/build、根 lint、内嵌 viewer 字节比对通过。
- 已有警告：Admin JS 大包（1439.97kB）；RN3次 React `act(...)` 警告（ChatScreen/useAITasks及VoiceShortcutDock/useReduceMotion）。

本轮不改数据库或后端，未重复 PostgreSQL 迁移/生产验收。独立审查已核对 errorCode-only、取消、失败 assets 及真实 responder 路径；主任务实测了拍摄错误提示。

## 本机证据与交接

证据目录：`~/Library/Application Support/MiaoxunReleasePreparations/ui-agent-candidate-20261105-cebc1e6/simulator-20261105/`。

- `repository-check-20261105-125030.log`：完整整仓日志。
- `camera-unavailable.png`：仅保留错误提示区域，临时完整聊天截图已移除。
- `album-empty.png`、`files-empty.png`、`file-picker.png`、`permissions-unavailable.png`、`miao-empty.png`：无私人正文的界面证据。

实际新增/修改业务文件仅媒体选择器及其测试、手势导航测试。无需后端部署；要向测试用户提供该修复，需要后续客户端构建与单独上传授权，不能把 Build59 当作已包含。尚待真实模型预算/供应商明确、用户独立 UI 授权、实体设备手势与语音/拍摄验收。未提交、推送、部署、上传或调用付费供应商。

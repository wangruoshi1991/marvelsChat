# 妙讯 iOS 原型

`MiaoxunApp/` 是妙讯当前保留的 SwiftUI 原型目录，用于承接现有实现、交互参考和迁移对照。

当前仓库已经包含可直接打开的 Xcode 工程 `MiaoxunApp/Miaoxun.xcodeproj`，并带有 SwiftUI 原型代码。第一次打开后请在 Xcode 中补充 Team 和签名配置即可运行。

React Native 正式实现目录位于 `MiaoxunRN/`。

## 技术栈

- SwiftUI：主界面和页面组件。
- Swift Concurrency：API 请求、异步任务和 Agent 调用状态。
- URLSession：访问 `backend` REST API，后续可扩展 SSE/WebSocket。
- Keychain：保存登录 token。
- UserNotifications：接入 iOS 推送通知。
- PhotosUI / FileImporter：后续处理相册、文件和素材授权。

## 目标边界

iOS 客户端只负责：

- 登录、注册、退出和 token 保存。
- 妙讯会话、小站、模块入口和 Agent 授权状态展示。
- 调用后端 API。
- 展示 Agent 回复、任务状态、确认弹窗和系统通知。

iOS 客户端不负责：

- 直接连接 PostgreSQL。
- 直接调用模型供应商。
- 直接读取 `agents/` 文件。
- 保存模型 API Key。

## 本地开发 API

模拟器访问本机后端：

```text
http://127.0.0.1:4390
```

真机访问本机后端时，需要把 API base URL 改成 Mac 的局域网 IP，并确保后端 CORS/网络可访问。

当前真机调试使用后端 API 读写数据，iOS 不直接访问 PostgreSQL。若 Mac 的局域网 IP 变化，需要同步更新 Xcode 工程里的 `MiaoxunAPIBaseURL`。

## 小站设置与动态码

- 设置页支持中文/英文全局切换，来自数据库的常见中文种子数据会在前端通过 `displayText` 映射为英文。
- 全局视觉支持浅色/深色切换，并通过 `UserDefaults` 保持本机偏好；登录、妙讯、聊天、小站、AI 伙伴和设置页共用同一套 palette。
- AI ID 动态码由前端按当前 AI ID 生成短动态入口，并渲染为自定义圆点二维码；倒计时只更新有效期文本，二维码本身在有效期结束或用户手动刷新时才重新生成。好友申请接口接入后再把该入口接到真实添加好友流程。
- 小站内容切换栏保留在资料区下方，页面上滑到顶部时才吸附，避免一进入小站就占用顶部空间。

## 首批页面

1. 登录/注册
2. 妙讯消息
3. 妙讯管家会话
4. 小站
5. 设置

后台管理系统不放进 iOS App，仍由 `admin/` 提供 Web 管理后台。

## 当前原型

`MiaoxunApp/` 目前包含一个可迁入 Xcode 工程的 SwiftUI 原型：

- 登录/注册切换
- 妙讯聊天/通知分段
- 会话列表
- 妙讯管家聊天详情
- 小站资料
- 我的动态、AI伙伴、社交网络、我的文件入口
- 发布草稿页
- 设置页

当前数据仍保留少量预览态，但 App 已接入后端登录、token 保存和 bootstrap。目录已经按后续工程化拆分：

```text
MiaoxunApp.swift
Models/
Services/
Theme/
Views/
```

其中 `Services/APIClient.swift` 和 `Services/KeychainTokenStore.swift` 已接入，后续继续补：

1. 流式消息
2. APNs
3. Agent 授权管理
4. 文件与相册权限

import SwiftUI

@main
struct MiaoxunApp: App {
    @StateObject private var session = AppSession()
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(session)
                .task {
                    await session.restoreSessionIfNeeded()
                }
                .onChange(of: scenePhase) { _, newPhase in
                    guard newPhase == .active else { return }
                    Task {
                        await session.refreshBootstrap(showBusy: false, showError: false)
                    }
                }
        }
    }
}

@MainActor
final class AppSession: ObservableObject {
    enum AppLanguage: String, CaseIterable, Identifiable {
        case zh
        case en

        var id: String { rawValue }

        var title: String {
            switch self {
            case .zh:
                return "中文"
            case .en:
                return "English"
            }
        }
    }

    @Published var token: String = ""
    @Published var user: MiaoxunUser?
    @Published var profile: StationProfile = .empty
    @Published var threads: [ChatThread] = []
    @Published var modules: [StationModule] = []
    @Published var agents: [AgentSummary] = []
    @Published var isBusy = false
    @Published var errorMessage: String?
    @Published var isLightStationStyle = true {
        didSet {
            UserDefaults.standard.set(isLightStationStyle, forKey: Self.stationStyleDefaultsKey)
            scheduleStationConfigSync()
        }
    }
    @Published var language: AppLanguage = .zh {
        didSet {
            UserDefaults.standard.set(language.rawValue, forKey: Self.languageDefaultsKey)
            scheduleStationConfigSync()
        }
    }

    private let apiClient: APIClient
    private let tokenStore: KeychainTokenStore
    private var isRefreshingBootstrap = false
    private var isApplyingSyncedStationConfig = false
    private var lastSyncAt: String?
    private static let stationStyleDefaultsKey = "miaoxun.stationStyle.isLight"
    private static let languageDefaultsKey = "miaoxun.language"

    init(
        apiClient: APIClient = .shared,
        tokenStore: KeychainTokenStore = .shared
    ) {
        self.apiClient = apiClient
        self.tokenStore = tokenStore
        if UserDefaults.standard.object(forKey: Self.stationStyleDefaultsKey) != nil {
            self.isLightStationStyle = UserDefaults.standard.bool(forKey: Self.stationStyleDefaultsKey)
        }
        if let rawLanguage = UserDefaults.standard.string(forKey: Self.languageDefaultsKey),
           let savedLanguage = AppLanguage(rawValue: rawLanguage) {
            self.language = savedLanguage
        }
    }

    var isAuthenticated: Bool {
        !token.isEmpty && user != nil
    }

    var isEnglish: Bool {
        language == .en
    }

    func text(_ zh: String, _ en: String) -> String {
        isEnglish ? en : zh
    }

    func displayText(_ rawValue: String) -> String {
        guard isEnglish else { return rawValue }
        let mappedValues = [
            "妙讯": "Miaoxun",
            "小站": "Station",
            "妙讯用户": "Miaoxun User",
            "妙讯管理员": "Miaoxun Admin",
            "普通用户": "User",
            "管理员": "Admin",
            "未登录": "Not signed in",
            "未设置": "Not set",
            "我": "Me",
            "妙讯管家": "Miaoxun Butler",
            "系统通知": "System Notices",
            "在线 · 管家中枢": "Online - Butler Hub",
            "在线 · Agent": "Online - Agent",
            "已停用": "Disabled",
            "模块状态": "Module Status",
            "会话": "Conversation",
            "Agent 会话": "Agent Conversation",
            "暂无消息": "No messages",
            "刚刚": "Just now",
            "昨天": "Yesterday",
            "分钟前": "m ago",
            "小时前": "h ago",
            "已接入": "Connected",
            "待接入": "Pending",
            "待授权": "Permission needed",
            "已授权": "Authorized",
            "同步中": "Syncing",
            "小站资料": "Station Profile",
            "妙讯会话": "Miaoxun Conversations",
            "通知": "Notifications",
            "AI伙伴": "AI Partners",
            "AI ID 动态码": "AI ID Dynamic Code",
            "搜索": "Search",
            "妙点明细": "Point Details",
            "主页可见范围": "Profile Visibility",
            "通知偏好": "Notification Preferences",
            "创建群": "Create Group",
            "添加好友": "Add Friend",
            "扫码": "Scan",
            "3D 名片素材": "3D Card Assets",
            "我的动态": "Posts",
            "个人日记": "Diary",
            "动漫日记": "Comic Diary",
            "个人相册": "Album",
            "音乐菜单": "Music Menu",
            "喜欢的音乐菜单": "Music Menu",
            "可调用 Agent": "Callable Agents",
            "可调用能力 Agent": "Callable Agents",
            "社交网络": "Social Network",
            "我的文件": "Files",
            "发布动态": "Publish Post",
            "建站 Agent": "Site Builder Agent",
            "昵称、简介、社区和活动区域来自 user_profiles。": "Nickname, bio, community, and activity area come from user_profiles.",
            "会话与消息来自 chat_threads / chat_messages。": "Conversations and messages come from chat_threads / chat_messages.",
            "通知由 usage_events 和 agent_runs 聚合。": "Notifications are aggregated from usage_events and agent_runs.",
            "已授权 Agent 来自 user_agents。": "Authorized agents come from user_agents.",
            "由真实 AI ID 在前端生成短效动态码。": "A short-lived dynamic code generated from the real AI ID.",
            "保留搜索入口，尚未接入全文索引、联系人表和 Agent 检索。": "Search is reserved; full-text index, contacts, and agent search are pending.",
            "user_profiles 已有妙点余额字段，明细流水表尚未接入。": "The profile has a points balance; transaction ledger is pending.",
            "保留隐私设置入口，尚未接入可见范围策略表。": "Privacy settings are reserved; visibility policy tables are pending.",
            "通知由真实事件聚合，偏好配置表尚未接入。": "Notifications come from real events; preference tables are pending.",
            "保留创建群入口，尚未接入群组与成员表。": "Group creation is reserved; group and member tables are pending.",
            "保留添加好友入口，尚未接入联系人和关系申请表。": "Add friend is reserved; contacts and friend request tables are pending.",
            "保留扫码入口，尚未接入扫码会话和权限校验。": "Scan is reserved; scan sessions and authorization are pending.",
            "当前只渲染默认形象，尚未接入用户素材和生成授权。": "Only the default avatar is shown; user assets and generation permission are pending.",
            "保留发布与动态展示入口，尚未建立内容发布数据表。": "Publishing and posts are reserved; content tables are pending.",
            "保留四格日记入口，尚未接入日记生成任务和素材表。": "Diary is reserved; generation jobs and asset tables are pending.",
            "保留相册入口，尚未接入文件存储和媒体资产表。": "Album is reserved; storage and media assets are pending.",
            "保留音乐菜单入口，尚未接入音乐偏好与外部授权。": "Music menu is reserved; music preferences and external authorization are pending.",
            "保留信任评分和关系图入口，尚未接入关系与互动事件。": "Trust scoring and relation graph are reserved; relations and events are pending.",
            "保留文件入口，尚未接入云存储、记忆和资产归档。": "Files are reserved; cloud storage, memory, and archive are pending.",
            "保留自然语言建站入口，尚未注册 site-builder Agent。": "Natural-language site builder is reserved; site-builder agent is not registered.",
            "保留发布入口，等待内容表、审核流和权限策略。": "Publishing is reserved; content tables, review flow, and permissions are pending.",
            "文件权限待接入": "File permission pending",
            "关系与互动待建表": "Relations and interactions pending",
            "妙讯管家已授权": "Miaoxun Butler authorized",
            "喜欢的歌单和氛围": "Favorite playlists and moods",
            "素材授权后接入": "Available after asset authorization",
            "照片成漫、连载日记": "Comic photos and serialized diary",
            "这个人还没有填写小站简介。": "No station bio yet.",
            "妙讯管理平台默认账号。": "Default Miaoxun admin account.",
            "登录后同步小站资料。": "Station profile syncs after login.",
            "把聊天、内容、小站和 Agent 连在一起。": "Connects chats, content, stations, and agents.",
            "云上社区": "Cloud Community",
            "上海 · 徐汇": "Shanghai - Xuhui",
            "我会承接你的消息、小站和后续 Agent 调度。": "I will handle your messages, station, and future agent orchestration.",
            "欢迎来到妙讯。我会先承接你的消息、账号和小站能力。": "Welcome to Miaoxun. I will first handle your messages, account, and station abilities.",
            "欢迎来到妙讯。我会先承接你的消息、账号和小站能力，后续新的 Agent 会逐步接入这里。": "Welcome to Miaoxun. I will first handle your messages, account, and station abilities; new agents will connect here over time.",
            "帮我整理今天要做的项目计划。": "Help me organize today's project plan.",
            "可以。我会先把 iOS、后台、后端和 Agent 的边界拆清楚，再按优先级推进。": "Sure. I will clarify the boundaries of iOS, admin, backend, and agents, then proceed by priority.",
            "动态、文件和长期记忆模块等待数据库接入。": "Posts, files, and long-term memory are waiting for database integration.",
            "消息、小站和后续 Agent 调度中枢": "Message, station, and future agent orchestration hub",
            "待接入活动、位置和日程权限": "Activity, location, and calendar permissions pending",
            "待接入文件和长期记忆授权": "File and long-term memory authorization pending",
            "AI 不只问答": "AI beyond Q&A",
            "连接人、内容和服务": "Connect people, content, and services",
            "就上妙讯小站": "Meet at Miaoxun Station",
            "正在同步真实账号空间": "Syncing your real account space",
            "发布前需要后端补充 posts、media_assets 和审核流。": "Backend posts, media_assets, and review flow are needed before publishing.",
            "保存草稿": "Save Draft",
            "发布": "Publish",
            "管家会话等待后端创建。": "The butler conversation is waiting for backend setup.",
            "后端健康检查和 PostgreSQL 连接正常。": "Backend health check and PostgreSQL connection are normal.",
            "需要补充授权、确认和审计流。": "Authorization, confirmation, and audit flows are pending.",
            "需确认": "Confirm",
            "相册素材": "Album Assets",
            "文件访问": "File Access",
            "长期记忆": "Long-term Memory"
        ]
        if let mappedValue = mappedValues[rawValue] {
            return mappedValue
        }
        if rawValue.hasSuffix("分钟前"), let minutes = rawValue.dropLast(3).split(separator: " ").last {
            return "\(minutes)m ago"
        }
        if rawValue.hasSuffix("小时前"), let hours = rawValue.dropLast(3).split(separator: " ").last {
            return "\(hours)h ago"
        }
        return rawValue
    }

    func restoreSessionIfNeeded() async {
        guard token.isEmpty else { return }

        do {
            guard let savedToken = try tokenStore.read(), !savedToken.isEmpty else { return }
            token = savedToken
            await refreshBootstrap(showBusy: false)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func signIn(identifier: String, password: String) async {
        await performAuth { [self] in
            let response = try await self.apiClient.login(identifier: identifier, password: password)
            try self.tokenStore.save(response.session.token)
            self.token = response.session.token
            self.user = MiaoxunUser(dto: response.user)
            await self.refreshBootstrap()
        }
    }

    func signUp(email: String, password: String, displayName: String) async {
        await performAuth { [self] in
            let response = try await self.apiClient.register(email: email, password: password, displayName: displayName)
            try self.tokenStore.save(response.session.token)
            self.token = response.session.token
            self.user = MiaoxunUser(dto: response.user)
            await self.refreshBootstrap()
        }
    }

    func refreshBootstrap(showBusy: Bool = true, showError: Bool = true) async {
        guard !token.isEmpty else { return }
        guard !isRefreshingBootstrap else { return }

        isRefreshingBootstrap = true
        if showBusy {
            isBusy = true
        }
        defer {
            isRefreshingBootstrap = false
            if showBusy {
                isBusy = false
            }
        }

        do {
            let bootstrap = try await apiClient.bootstrap(token: token)
            user = MiaoxunUser(dto: bootstrap.user)
            profile = StationProfile(dto: bootstrap.profile)
            applyProfileStationConfig(profile)
            threads = bootstrap.threads.map { thread in
                let messages = bootstrap.messagesByThread[thread.id] ?? []
                return ChatThread(dto: thread, messages: messages)
            }
            lastSyncAt = bootstrap.serverTime
            modules = bootstrap.modules.values.map(StationModule.init(dto:))
                .sorted { $0.title < $1.title }

            let ownedIds = Set(bootstrap.agents.owned.map(\.id))
            agents = bootstrap.agents.registered.map { AgentSummary(dto: $0, ownedIds: ownedIds) }
                .sorted { $0.title < $1.title }
        } catch {
            if showError {
                errorMessage = error.localizedDescription
            }
        }
    }

    func refreshThread(threadId: String, showError: Bool = false) async {
        guard !token.isEmpty else { return }

        do {
            let messages = try await apiClient.messages(threadId: threadId, token: token)
            if let index = threads.firstIndex(where: { $0.id == threadId }) {
                threads[index] = threads[index].replacingMessages(messages)
            } else {
                await refreshBootstrap(showBusy: false, showError: showError)
            }
        } catch {
            if showError {
                errorMessage = error.localizedDescription
            }
        }
    }

    func incrementalSync(showError: Bool = false) async {
        guard !token.isEmpty else { return }

        do {
            let sync = try await apiClient.sync(updatedAfter: lastSyncAt, token: token)
            mergeThreads(sync.threads, messagesByThread: sync.messagesByThread)
            lastSyncAt = sync.serverTime
        } catch {
            if showError {
                errorMessage = error.localizedDescription
            }
        }
    }

    func markThreadRead(threadId: String) async {
        guard !token.isEmpty else { return }

        if let index = threads.firstIndex(where: { $0.id == threadId }) {
            threads[index] = threads[index].markingRead()
        }

        do {
            try await apiClient.markThreadRead(threadId: threadId, token: token)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func sendMessage(threadId: String, content: String) async {
        do {
            let isButlerThread = threads.first(where: { $0.id == threadId })?.agentId == "miaoxun-butler"
            let localActionResult = isButlerThread ? applyButlerLocalActionIfNeeded(content: content) : nil
            let response = try await apiClient.sendMessage(
                threadId: threadId,
                content: content,
                clientContext: isButlerThread ? makeButlerClientContext(currentPage: "messages.butler") : nil,
                localActionResult: localActionResult,
                token: token
            )
            let updatedMessages = response.messages
            if let index = threads.firstIndex(where: { $0.id == threadId }) {
                threads[index] = threads[index].appendingMessages(updatedMessages).markingRead()
            }
        } catch {
            await refreshThread(threadId: threadId, showError: false)
            errorMessage = error.localizedDescription
        }
    }

    func logout() {
        let currentToken = token
        Task {
            if !currentToken.isEmpty {
                try? await apiClient.logout(token: currentToken)
            }
        }
        token = ""
        user = nil
        profile = .empty
        threads = []
        modules = []
        agents = []
        try? tokenStore.clear()
    }

    func clearError() {
        errorMessage = nil
    }

    private func performAuth(_ work: @escaping () async throws -> Void) async {
        isBusy = true
        defer { isBusy = false }
        do {
            try await work()
        } catch APIClientError.server(let message) where message == "Invalid email or password" {
            errorMessage = text("账号或密码错误。", "Incorrect account or password.")
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

extension AppSession {
    static let preview = {
        let session = AppSession()
        session.token = "preview-token"
        session.user = .preview
        session.profile = .preview
        session.threads = ChatThread.previewThreads
        session.modules = StationModule.previewModules
        session.agents = AgentSummary.previewAgents
        return session
    }()
}

private extension AppSession {
    func makeButlerClientContext(currentPage: String) -> ButlerClientContextPayload {
        ButlerClientContextPayload(
            currentPage: currentPage,
            language: language.rawValue,
            appearance: isLightStationStyle ? "light" : "dark",
            profileSnapshot: ButlerProfileSnapshotPayload(
                nickname: profile.nickname,
                followersCount: profile.followersCount,
                followingCount: profile.followingCount,
                collectionsCount: profile.collectionsCount,
                miaoPoints: profile.miaoPoints
            ),
            enabledAgentIds: agents.filter { $0.status == "已授权" }.map(\.id)
        )
    }

    func applyButlerLocalActionIfNeeded(content: String) -> ButlerLocalActionResultPayload? {
        let normalized = content.lowercased()

        if normalized.contains("深色") || normalized.contains("dark mode") || normalized.contains("dark theme") {
            if !isLightStationStyle {
                return ButlerLocalActionResultPayload(type: "appearance", status: "applied", message: text("当前已经是深色视觉。", "Dark appearance is already active."))
            }
            isLightStationStyle = false
            return ButlerLocalActionResultPayload(type: "appearance", status: "applied", message: text("已切换为深色视觉。", "Switched to dark appearance."))
        }

        if normalized.contains("浅色") || normalized.contains("light mode") || normalized.contains("light theme") {
            if isLightStationStyle {
                return ButlerLocalActionResultPayload(type: "appearance", status: "applied", message: text("当前已经是浅色视觉。", "Light appearance is already active."))
            }
            isLightStationStyle = true
            return ButlerLocalActionResultPayload(type: "appearance", status: "applied", message: text("已切换为浅色视觉。", "Switched to light appearance."))
        }

        if normalized.contains("英文") || normalized.contains("english") || normalized.contains("切换英语") {
            if language == .en {
                return ButlerLocalActionResultPayload(type: "language", status: "applied", message: text("当前已经是英文。", "English is already active."))
            }
            language = .en
            return ButlerLocalActionResultPayload(type: "language", status: "applied", message: "Switched to English.")
        }

        if normalized.contains("中文") || normalized.contains("chinese") {
            if language == .zh {
                return ButlerLocalActionResultPayload(type: "language", status: "applied", message: text("当前已经是中文。", "Chinese is already active."))
            }
            language = .zh
            return ButlerLocalActionResultPayload(type: "language", status: "applied", message: text("已切换为中文。", "Switched to Chinese."))
        }

        return nil
    }

    func applyProfileStationConfig(_ profile: StationProfile) {
        isApplyingSyncedStationConfig = true
        defer { isApplyingSyncedStationConfig = false }
        if let appearance = profile.stationConfig.appearance {
            isLightStationStyle = appearance != "dark"
        }
        if let rawLanguage = profile.stationConfig.language,
           let syncedLanguage = AppLanguage(rawValue: rawLanguage) {
            language = syncedLanguage
        }
    }

    func scheduleStationConfigSync() {
        guard !token.isEmpty else { return }
        guard !isApplyingSyncedStationConfig else { return }
        Task {
            await syncStationConfig()
        }
    }

    func syncStationConfig() async {
        guard !token.isEmpty else { return }

        do {
            let updatedProfile = try await apiClient.updateStationConfig(
                language: language.rawValue,
                appearance: isLightStationStyle ? "light" : "dark",
                token: token
            )
            profile = StationProfile(dto: updatedProfile)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func mergeThreads(_ incomingThreads: [ThreadDTO], messagesByThread: [String: [MessageDTO]]) {
        guard !incomingThreads.isEmpty else { return }

        let existing = Dictionary(uniqueKeysWithValues: threads.map { ($0.id, $0) })
        var merged = [ChatThread]()
        for dto in incomingThreads {
            if let current = existing[dto.id] {
                merged.append(current.replacing(dto: dto, messages: messagesByThread[dto.id]))
            } else {
                merged.append(ChatThread(dto: dto, messages: messagesByThread[dto.id] ?? []))
            }
        }

        threads = merged + threads.filter { thread in
            !incomingThreads.contains(where: { $0.id == thread.id })
        }
    }
}

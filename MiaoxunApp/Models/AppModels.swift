import Foundation

struct MiaoxunUser: Identifiable, Hashable {
    let id: String
    let displayName: String
    let aiId: String
    let role: String
}

extension MiaoxunUser {
    static let preview = MiaoxunUser(
        id: "u-preview",
        displayName: "妙讯用户",
        aiId: "900202606160001",
        role: "user"
    )

    init(dto: UserDTO) {
        self.id = dto.id
        self.displayName = dto.displayName
        self.aiId = dto.aiId
        self.role = dto.role
    }
}

struct StationProfile {
    let nickname: String
    let bio: String
    let community: String
    let activityArea: String
    let miaoPoints: Int
    let followingCount: Int
    let followersCount: Int
    let collectionsCount: Int
    let stationConfig: StationConfig
}

struct StationConfig: Hashable {
    let language: String?
    let appearance: String?
}

extension StationProfile {
    static let empty = StationProfile(
        nickname: "未登录",
        bio: "登录后同步小站资料。",
        community: "未设置",
        activityArea: "未设置",
        miaoPoints: 0,
        followingCount: 0,
        followersCount: 0,
        collectionsCount: 0,
        stationConfig: .init(language: nil, appearance: nil)
    )

    static let preview = StationProfile(
        nickname: "妙讯用户",
        bio: "把聊天、内容、小站和 Agent 连在一起。",
        community: "云上社区",
        activityArea: "上海 · 徐汇",
        miaoPoints: 128,
        followingCount: 18,
        followersCount: 42,
        collectionsCount: 7,
        stationConfig: .init(language: "zh", appearance: "light")
    )

    init(dto: ProfileDTO) {
        self.nickname = dto.nickname
        self.bio = dto.bio.isEmpty ? "这个人还没有填写小站简介。" : dto.bio
        self.community = dto.community.isEmpty ? "未设置" : dto.community
        self.activityArea = dto.activityArea.isEmpty ? "未设置" : dto.activityArea
        self.miaoPoints = dto.miaoPoints
        self.followingCount = dto.followingCount
        self.followersCount = dto.followersCount
        self.collectionsCount = dto.collectionsCount
        self.stationConfig = .init(
            language: dto.stationConfig["language"],
            appearance: dto.stationConfig["appearance"]
        )
    }
}

struct ChatThread: Identifiable, Hashable {
    let id: String
    let title: String
    let statusText: String
    let avatarText: String
    let lastMessage: String
    let lastTime: String
    let unreadCount: Int
    let agentId: String?
    let messages: [ChatMessage]
}

extension ChatThread {
    static let previewThreads: [ChatThread] = [
        ChatThread(
            id: "butler",
            title: "妙讯管家",
            statusText: "在线 · 管家中枢",
            avatarText: "妙",
            lastMessage: "我会承接你的消息、小站和后续 Agent 调度。",
            lastTime: "刚刚",
            unreadCount: 1,
            agentId: "miaoxun-butler",
            messages: [
                ChatMessage(id: "m1", sender: .agent, name: "妙讯管家", content: "欢迎来到妙讯。我会先承接你的消息、账号和小站能力。", time: "10:24"),
                ChatMessage(id: "m2", sender: .user, name: "我", content: "帮我整理今天要做的项目计划。", time: "10:25"),
                ChatMessage(id: "m3", sender: .agent, name: "妙讯管家", content: "可以。我会先把 iOS、后台、后端和 Agent 的边界拆清楚，再按优先级推进。", time: "10:25")
            ]
        ),
        ChatThread(
            id: "notice",
            title: "系统通知",
            statusText: "模块状态",
            avatarText: "讯",
            lastMessage: "动态、文件和长期记忆模块等待数据库接入。",
            lastTime: "昨天",
            unreadCount: 0,
            agentId: nil,
            messages: []
        )
    ]

    init(dto: ThreadDTO, messages: [MessageDTO]) {
        self.id = dto.id
        self.title = dto.title
        self.statusText = dto.status ?? (dto.agentId == nil ? "会话" : "Agent 会话")
        self.avatarText = dto.avatarText
        self.lastMessage = dto.lastContent.isEmpty ? "暂无消息" : dto.lastContent
        self.lastTime = Self.relativeTimeText(dto.lastMessageAt)
        self.unreadCount = dto.unreadCount
        self.agentId = dto.agentId
        self.messages = messages.map(ChatMessage.init(dto:))
    }

    func replacing(dto: ThreadDTO, messages: [MessageDTO]? = nil) -> ChatThread {
        let resolvedMessages = messages.map { $0.map(ChatMessage.init(dto:)) } ?? self.messages
        return ChatThread(
            id: dto.id,
            title: dto.title,
            statusText: dto.status ?? (dto.agentId == nil ? "会话" : "Agent 会话"),
            avatarText: dto.avatarText,
            lastMessage: dto.lastContent.isEmpty ? "暂无消息" : dto.lastContent,
            lastTime: Self.relativeTimeText(dto.lastMessageAt),
            unreadCount: dto.unreadCount,
            agentId: dto.agentId,
            messages: resolvedMessages
        )
    }

    func replacingMessages(_ messages: [MessageDTO]) -> ChatThread {
        ChatThread(
            id: id,
            title: title,
            statusText: statusText,
            avatarText: avatarText,
            lastMessage: messages.last?.content ?? lastMessage,
            lastTime: messages.last.map { ChatThread.relativeTimeText($0.createdAt) } ?? lastTime,
            unreadCount: unreadCount,
            agentId: agentId,
            messages: messages.map(ChatMessage.init(dto:))
        )
    }

    func appendingMessages(_ messages: [MessageDTO]) -> ChatThread {
        let incoming = messages.map(ChatMessage.init(dto:))
        let existingIds = Set(self.messages.map(\.id))
        let mergedMessages = self.messages + incoming.filter { !existingIds.contains($0.id) }

        return ChatThread(
            id: id,
            title: title,
            statusText: statusText,
            avatarText: avatarText,
            lastMessage: mergedMessages.last?.content ?? lastMessage,
            lastTime: mergedMessages.last?.time ?? lastTime,
            unreadCount: unreadCount,
            agentId: agentId,
            messages: mergedMessages
        )
    }

    func markingRead() -> ChatThread {
        ChatThread(
            id: id,
            title: title,
            statusText: statusText,
            avatarText: avatarText,
            lastMessage: lastMessage,
            lastTime: lastTime,
            unreadCount: 0,
            agentId: agentId,
            messages: messages
        )
    }

    private static func relativeTimeText(_ rawValue: String?) -> String {
        guard let rawValue else { return "" }

        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let date = formatter.date(from: rawValue) ?? ISO8601DateFormatter().date(from: rawValue)
        guard let date else { return "" }

        let interval = Date().timeIntervalSince(date)
        if interval < 60 { return "刚刚" }
        if interval < 3600 { return "\(Int(interval / 60))分钟前" }
        if interval < 86400 { return "\(Int(interval / 3600))小时前" }

        let displayFormatter = DateFormatter()
        displayFormatter.dateFormat = "MM-dd"
        return displayFormatter.string(from: date)
    }
}

struct ChatMessage: Identifiable, Hashable {
    enum Sender: Hashable {
        case user
        case agent
        case system
    }

    let id: String
    let sender: Sender
    let name: String
    let content: String
    let time: String
}

extension ChatMessage {
    init(dto: MessageDTO) {
        self.id = dto.id
        switch dto.senderType {
        case "user":
            self.sender = .user
        case "system":
            self.sender = .system
        default:
            self.sender = .agent
        }
        self.name = dto.senderName
        self.content = dto.content
        self.time = Self.timeText(dto.createdAt)
    }

    private static func timeText(_ rawValue: String?) -> String {
        guard let rawValue else { return "" }

        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let date = formatter.date(from: rawValue) ?? ISO8601DateFormatter().date(from: rawValue)
        guard let date else { return "" }

        let displayFormatter = DateFormatter()
        displayFormatter.dateFormat = "HH:mm"
        return displayFormatter.string(from: date)
    }
}

struct StationModule: Identifiable, Hashable {
    enum Status: String {
        case connected = "已接入"
        case pending = "待接入"
        case locked = "待授权"
    }

    let id: String
    let title: String
    let subtitle: String
    let symbol: String
    let status: Status
}

extension StationModule {
    static let previewModules: [StationModule] = [
        StationModule(id: "diary", title: "个人日记", subtitle: "照片成漫、连载日记", symbol: "book.pages", status: .pending),
        StationModule(id: "album", title: "个人相册", subtitle: "素材授权后接入", symbol: "photo.on.rectangle", status: .pending),
        StationModule(id: "music", title: "音乐菜单", subtitle: "喜欢的歌单和氛围", symbol: "music.note.list", status: .pending),
        StationModule(id: "agents", title: "可调用 Agent", subtitle: "妙讯管家已授权", symbol: "sparkles", status: .connected),
        StationModule(id: "social", title: "社交网络", subtitle: "关系与互动待建表", symbol: "person.2", status: .pending),
        StationModule(id: "files", title: "我的文件", subtitle: "文件权限待接入", symbol: "folder", status: .pending)
    ]

    init(dto: ModuleDTO) {
        self.id = dto.key
        self.title = dto.title
        self.subtitle = dto.description
        self.symbol = Self.symbol(for: dto.key)
        self.status = StationModule.Status(apiStatus: dto.status)
    }

    private static func symbol(for key: String) -> String {
        switch key {
        case "profile":
            return "person.crop.square"
        case "messages":
            return "message"
        case "notices", "notifications":
            return "bell.badge"
        case "agents", "site-agent":
            return "sparkles"
        case "ai-qr":
            return "qrcode"
        case "posts", "publish":
            return "square.and.pencil"
        case "diary":
            return "book.pages"
        case "album":
            return "photo.on.rectangle"
        case "music":
            return "music.note.list"
        case "social":
            return "person.2"
        case "files":
            return "folder"
        default:
            return "square.grid.2x2"
        }
    }
}

extension StationModule.Status {
    init(apiStatus: String) {
        switch apiStatus {
        case "connected":
            self = .connected
        case "locked":
            self = .locked
        default:
            self = .pending
        }
    }
}

struct AgentSummary: Identifiable, Hashable {
    let id: String
    let title: String
    let subtitle: String
    let status: String
    let symbol: String
}

extension AgentSummary {
    static let previewAgents: [AgentSummary] = [
        AgentSummary(id: "miaoxun-butler", title: "妙讯管家", subtitle: "消息、小站和后续 Agent 调度中枢", status: "已授权", symbol: "sparkles"),
        AgentSummary(id: "activity", title: "活动搭子", subtitle: "待接入活动、位置和日程权限", status: "待接入", symbol: "figure.2"),
        AgentSummary(id: "collections", title: "收藏整理", subtitle: "待接入文件和长期记忆授权", status: "待接入", symbol: "tray.full")
    ]

    init(dto: AgentDTO, ownedIds: Set<String>) {
        self.id = dto.key
        self.title = dto.name
        self.subtitle = dto.description
        self.status = ownedIds.contains(dto.key) ? "已授权" : dto.statusText
        self.symbol = dto.key == "miaoxun-butler" ? "sparkles" : "cpu"
    }
}

private extension AgentDTO {
    var statusText: String {
        status == "registered" ? "待授权" : status
    }
}

enum RootTab: Hashable {
    case messages
    case station
    case compose
    case agents
    case settings
}

enum MessageTab: String, CaseIterable {
    case chat = "聊天"
    case notice = "通知"
}

enum StationTab: String, CaseIterable {
    case station = "我的小站"
    case posts = "我的动态"
    case agents = "AI伙伴"
    case social = "社交网络"
    case files = "我的文件"
}

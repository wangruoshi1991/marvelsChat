import SwiftUI

struct MessagesView: View {
    @EnvironmentObject private var session: AppSession
    @State private var selectedMessageTab: MessageTab = .chat
    @State private var selectedThread: ChatThread?
    @State private var presentedButlerThread: ChatThread?
    private var palette: StationPalette {
        session.palette
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                HStack(spacing: 10) {
                    Menu {
                        Button(session.text("创建群", "Create group"), systemImage: "person.3") {}
                        Button(session.text("添加好友", "Add friend"), systemImage: "person.badge.plus") {}
                        Button(session.text("扫码", "Scan"), systemImage: "qrcode.viewfinder") {}
                    } label: {
                        Image(systemName: "plus")
                            .font(.headline.weight(.semibold))
                            .frame(width: 40, height: 40)
                            .background(palette.soft)
                            .clipShape(RoundedRectangle(cornerRadius: 8))
                    }

                    MiaoxunSegmentedControl(
                        selection: $selectedMessageTab,
                        options: MessageTab.allCases,
                        title: title(for:),
                        palette: palette
                    )

                    Button {} label: {
                        Image(systemName: "magnifyingglass")
                            .font(.headline.weight(.semibold))
                            .frame(width: 40, height: 40)
                            .background(palette.soft)
                            .clipShape(RoundedRectangle(cornerRadius: 8))
                    }
                }
                .padding(.horizontal, 18)
                .padding(.top, 14)
                .padding(.bottom, 10)
                .background(palette.background)
                .overlay(alignment: .bottom) {
                    Rectangle()
                        .fill(palette.stroke)
                        .frame(height: 0.5)
                }

                if selectedMessageTab == .chat {
                    ScrollView {
                        LazyVStack(spacing: 0) {
                            ForEach(session.threads) { thread in
                                Button {
                                    if thread.agentId == "miaoxun-butler" {
                                        presentedButlerThread = thread
                                    } else {
                                        selectedThread = thread
                                    }
                                } label: {
                                    ThreadRow(thread: thread)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                        .padding(.horizontal, 14)
                    }
                    .background(palette.background)
                } else {
                    NoticeListView()
                }
            }
            .background(palette.background)
            .foregroundStyle(palette.text)
            .navigationDestination(item: $selectedThread) { thread in
                ChatDetailView(thread: thread, bottomInset: 70)
            }
            .fullScreenCover(item: $presentedButlerThread) { thread in
                ButlerConversationView(thread: thread)
                    .environmentObject(session)
            }
        }
    }

    private func title(for tab: MessageTab) -> String {
        switch tab {
        case .chat:
            return session.text("聊天", "Chats")
        case .notice:
            return session.text("通知", "Notices")
        }
    }
}

struct ButlerConversationView: View {
    @EnvironmentObject private var session: AppSession
    @Environment(\.dismiss) private var dismiss
    let thread: ChatThread

    var body: some View {
        NavigationStack {
            ChatDetailView(thread: thread)
                .toolbar {
                    ToolbarItem(placement: .topBarLeading) {
                        Button {
                            dismiss()
                        } label: {
                            Label(session.text("返回", "Back"), systemImage: "chevron.down")
                        }
                    }
                }
        }
    }
}

struct ThreadRow: View {
    @EnvironmentObject private var session: AppSession
    let thread: ChatThread
    private var palette: StationPalette {
        session.palette
    }

    var body: some View {
        HStack(spacing: 13) {
            AvatarBadge(text: thread.avatarText)

            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text(session.displayText(thread.title))
                        .font(.headline)
                    Spacer()
                    Text(session.displayText(thread.lastTime))
                        .font(.caption)
                        .foregroundStyle(palette.secondaryText)
                }

                Text(session.displayText(thread.lastMessage))
                    .font(.subheadline)
                    .foregroundStyle(palette.secondaryText)
                    .lineLimit(1)

                Text(session.displayText(thread.statusText))
                    .font(.caption)
                    .foregroundStyle(MiaoxunColor.mint)
            }

            if thread.unreadCount > 0 {
                Text("\(thread.unreadCount)")
                    .font(.caption2.bold())
                    .foregroundStyle(.white)
                    .padding(.horizontal, 7)
                    .padding(.vertical, 4)
                    .background(MiaoxunColor.rose)
                    .clipShape(Capsule())
            }
        }
        .padding(.vertical, 12)
        .overlay(alignment: .bottom) {
            Rectangle()
                .fill(palette.stroke)
                .frame(height: 0.5)
        }
    }
}

struct NoticeListView: View {
    @EnvironmentObject private var session: AppSession
    private var palette: StationPalette {
        session.palette
    }

    var body: some View {
        ScrollView {
            LazyVStack(spacing: 10) {
                NoticeRow(symbol: "server.rack", title: session.text("数据库链路", "Database Link"), message: session.text("后端健康检查和 PostgreSQL 连接正常。", "Backend health check and PostgreSQL connection are normal."), status: session.text("已接入", "Connected"))
                NoticeRow(symbol: "bell.badge", title: session.text("推送通知", "Push Notifications"), message: session.text("iOS APNs 设备注册待接入。", "iOS APNs device registration is pending."), status: session.text("待接入", "Pending"))
                NoticeRow(symbol: "lock.shield", title: session.text("长期记忆", "Long-term Memory"), message: session.text("需要补充授权、确认和审计流。", "Authorization, confirmation, and audit flows are pending."), status: session.text("待接入", "Pending"))
            }
            .padding(14)
        }
        .background(palette.surface)
    }
}

struct NoticeRow: View {
    @EnvironmentObject private var session: AppSession
    let symbol: String
    let title: String
    let message: String
    let status: String
    private var palette: StationPalette {
        session.palette
    }

    var body: some View {
        HStack(alignment: .top, spacing: 13) {
            Image(systemName: symbol)
                .font(.title3)
                .foregroundStyle(MiaoxunColor.mint)
                .frame(width: 34, height: 34)
                .background(MiaoxunColor.mint.opacity(0.14))
                .clipShape(RoundedRectangle(cornerRadius: 10))

            VStack(alignment: .leading, spacing: 5) {
                HStack {
                    Text(title)
                        .font(.headline)
                    Spacer()
                    Text(status)
                        .font(.caption.bold())
                        .foregroundStyle(status == "已接入" || status == "Connected" ? MiaoxunColor.mint : palette.secondaryText)
                }
                Text(message)
                    .font(.subheadline)
                    .foregroundStyle(palette.secondaryText)
            }
        }
        .padding(14)
        .background(palette.surface)
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .overlay {
            RoundedRectangle(cornerRadius: 8)
                .stroke(palette.stroke, lineWidth: 1)
        }
    }
}

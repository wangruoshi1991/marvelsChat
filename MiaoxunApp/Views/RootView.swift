import SwiftUI

struct RootView: View {
    @EnvironmentObject private var session: AppSession
    @State private var showLaunchAnimation = true

    var body: some View {
        ZStack {
            if session.isAuthenticated {
                MainShellView()
            } else {
                AuthView()
            }

            if showLaunchAnimation {
                LaunchAnimationView()
                    .transition(.opacity)
                    .zIndex(10)
            }
        }
        .tint(MiaoxunColor.mint)
        .task {
            try? await Task.sleep(nanoseconds: 2_500_000_000)
            withAnimation(.easeOut(duration: 0.32)) {
                showLaunchAnimation = false
            }
        }
        .alert(session.text("操作失败", "Action Failed"), isPresented: Binding(
            get: { session.errorMessage != nil },
            set: { if !$0 { session.clearError() } }
        )) {
            Button(session.text("知道了", "OK")) {
                session.clearError()
            }
        } message: {
            Text(session.errorMessage ?? "")
        }
        .preferredColorScheme(session.isLightStationStyle ? .light : .dark)
    }
}

struct MainShellView: View {
    @EnvironmentObject private var session: AppSession
    @State private var selectedTab: RootTab = .messages
    @State private var showingSiteBuilder = false
    @State private var syncTask: Task<Void, Never>?

    private var palette: StationPalette {
        session.palette
    }

    var body: some View {
        ZStack(alignment: .bottom) {
            Group {
                switch selectedTab {
                case .messages:
                    MessagesView()
                default:
                    StationView()
                }
            }
            .safeAreaInset(edge: .bottom) {
                Color.clear.frame(height: 70)
            }

            BottomNavigationBar(selectedTab: $selectedTab, palette: palette)

            if selectedTab == .station {
                Button {
                    showingSiteBuilder = true
                } label: {
                    Text("妙")
                        .font(.caption.bold())
                        .foregroundStyle(.white)
                        .frame(width: 31, height: 31)
                        .background(MiaoxunColor.rose)
                        .clipShape(Circle())
                        .shadow(color: MiaoxunColor.rose.opacity(0.28), radius: 12, y: 6)
                }
                .buttonStyle(MiaoxunPressButtonStyle(pressedScale: 0.9))
                .offset(y: -92)
                .transition(.scale.combined(with: .opacity))
            }
        }
        .ignoresSafeArea(.keyboard, edges: .bottom)
        .sheet(isPresented: $showingSiteBuilder) {
            SiteBuilderEntrySheet()
        }
        .onAppear {
            syncTask?.cancel()
            syncTask = Task {
                while !Task.isCancelled {
                    try? await Task.sleep(nanoseconds: 2_000_000_000)
                    await session.incrementalSync()
                }
            }
        }
        .onDisappear {
            syncTask?.cancel()
            syncTask = nil
        }
    }
}

struct BottomNavigationBar: View {
    @EnvironmentObject private var session: AppSession
    @Binding var selectedTab: RootTab
    let palette: StationPalette

    var body: some View {
        HStack(spacing: 0) {
            BottomNavButton(
                title: "妙讯",
                localizedTitle: session.text("妙讯", "Messages"),
                symbol: "message",
                isSelected: selectedTab == .messages
            ) {
                withAnimation(.easeOut(duration: 0.18)) {
                    selectedTab = .messages
                }
            }

            BottomNavButton(
                title: "小站",
                localizedTitle: session.text("小站", "Station"),
                symbol: "person.crop.circle",
                isSelected: selectedTab == .station
            ) {
                withAnimation(.easeOut(duration: 0.18)) {
                    selectedTab = .station
                }
            }
        }
        .frame(height: 70)
        .padding(.horizontal, 18)
        .background(palette.surface)
        .overlay(alignment: .top) {
            Rectangle()
                .fill(palette.stroke)
                .frame(height: 0.5)
        }
        .foregroundStyle(palette.text)
    }
}

struct BottomNavButton: View {
    @EnvironmentObject private var session: AppSession
    let title: String
    var localizedTitle: String? = nil
    let symbol: String
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 5) {
                Image(systemName: symbol)
                    .font(.system(size: 20, weight: .semibold))
                    .offset(y: isSelected ? -1 : 0)
                Text(localizedTitle ?? title)
                    .font(.caption.weight(.semibold))
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .foregroundStyle(isSelected ? MiaoxunColor.mint : session.palette.secondaryText)
        }
        .buttonStyle(MiaoxunPressButtonStyle())
    }
}

struct LaunchAnimationView: View {
    @EnvironmentObject private var session: AppSession
    @State private var visibleLines = 0
    @State private var pulse = false

    private let lines = ["AI 不只问答", "找人、找东西", "就上妙讯小站"]

    var body: some View {
        ZStack {
            session.palette.surface.ignoresSafeArea()

            VStack(spacing: 24) {
                VStack(spacing: 10) {
                    ForEach(Array(lines.enumerated()), id: \.offset) { index, line in
                        Text(session.displayText(line))
                            .font(.system(size: 25, weight: .black, design: .rounded))
                            .opacity(visibleLines > index ? 1 : 0)
                            .offset(y: visibleLines > index ? 0 : 10)
                    }
                }

                Text(session.displayText("正在同步真实账号空间"))
                    .font(.footnote)
                    .foregroundStyle(session.palette.secondaryText)

                HStack(spacing: 7) {
                    ForEach(0..<3, id: \.self) { index in
                        Circle()
                            .fill(MiaoxunColor.mint)
                            .frame(width: 7, height: 7)
                            .scaleEffect(pulse ? 1.0 : 0.62)
                            .opacity(pulse ? 1.0 : 0.38)
                            .animation(
                                .easeInOut(duration: 0.64)
                                    .repeatForever()
                                    .delay(Double(index) * 0.12),
                                value: pulse
                            )
                    }
                }
            }
            .multilineTextAlignment(.center)
            .padding(28)
        }
        .foregroundStyle(session.palette.text)
        .task {
            pulse = true
            for index in 1...lines.count {
                try? await Task.sleep(nanoseconds: index == 1 ? 160_000_000 : 720_000_000)
                withAnimation(.easeOut(duration: 0.38)) {
                    visibleLines = index
                }
            }
        }
    }
}

struct SiteBuilderEntrySheet: View {
    @EnvironmentObject private var session: AppSession
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    EmptyModuleView(
                        symbol: "sparkles.rectangle.stack",
                        title: session.text("妙 · 建站入口", "Miao Site Builder"),
                        message: session.text("这里会保留给后续 AI 建站与工具执行能力。当前先独立存在。", "This entry is reserved for future AI site building and tool actions. It now stays separate from the Butler chat.")
                    )

                    VStack(alignment: .leading, spacing: 12) {
                        CapabilityRow(
                            symbol: "wand.and.stars",
                            title: session.text("自然语言建站", "Prompt-to-site"),
                            subtitle: session.text("后续从这里接入页面生成、模块装配和站点发布。", "This will later host page generation, module assembly, and site publishing.")
                        )
                        CapabilityRow(
                            symbol: "square.stack.3d.up",
                            title: session.text("工具动作", "Tool actions"),
                            subtitle: session.text("后续接入站点素材、文件和多步骤任务执行。", "This will later connect assets, files, and multi-step task execution.")
                        )
                    }
                    .padding(.horizontal, 18)
                }
                .padding(.vertical, 18)
            }
            .navigationTitle(session.text("妙", "Miao"))
            .navigationBarTitleDisplayMode(.inline)
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

#Preview("已登录") {
    RootView()
        .environmentObject(AppSession.preview)
}

#Preview("登录") {
    RootView()
        .environmentObject(AppSession())
}

import CoreImage.CIFilterBuiltins
import SwiftUI
import UIKit

struct StationView: View {
    enum StationSheet: Identifiable {
        case settings
        case aiQRCode

        var id: String {
            switch self {
            case .settings:
                return "settings"
            case .aiQRCode:
                return "aiQRCode"
            }
        }
    }

    @EnvironmentObject private var session: AppSession
    @State private var selectedTab: StationTab = .station
    @State private var activeSheet: StationSheet?
    @State private var toastMessage: String?

    var body: some View {
        NavigationStack {
            ZStack(alignment: .bottom) {
                palette.background.ignoresSafeArea()

                ZStack(alignment: .top) {
                    ScrollView {
                        LazyVStack(alignment: .leading, spacing: 0, pinnedViews: [.sectionHeaders]) {
                            VStack(alignment: .leading, spacing: 16) {
                                HStack(alignment: .top, spacing: 12) {
                                    StationProfileHeader(
                                        profile: session.profile,
                                        user: session.user,
                                        palette: palette,
                                        onCopyAIID: copyAIID,
                                        onShowQRCode: { activeSheet = .aiQRCode }
                                    )

                                    Button {
                                        activeSheet = .settings
                                    } label: {
                                        Image(systemName: "gearshape")
                                            .font(.headline.weight(.semibold))
                                            .foregroundStyle(palette.text)
                                            .frame(width: 40, height: 40)
                                            .background(palette.surface)
                                            .clipShape(RoundedRectangle(cornerRadius: 8))
                                            .overlay {
                                                RoundedRectangle(cornerRadius: 8)
                                                    .stroke(palette.stroke, lineWidth: 1)
                                            }
                                    }
                                    .buttonStyle(MiaoxunPressButtonStyle())
                                }
                                .padding(.horizontal, 14)

                                StationStatsRow(profile: session.profile, palette: palette)
                                    .padding(.horizontal, 14)
                            }
                            .padding(.bottom, 8)

                            Section {
                                stationPanel
                                    .padding(.horizontal, 14)
                                    .padding(.top, 16)
                            } header: {
                                StationTabHeader(selectedTab: $selectedTab, palette: palette)
                                    .environmentObject(session)
                            }
                        }
                        .padding(.top, 18)
                        .padding(.bottom, 154)
                    }
                    .scrollContentBackground(.hidden)
                    .background(palette.background)

                    StationTopSafeAreaCover(palette: palette)

                    if let toastMessage {
                        Text(toastMessage)
                            .font(.caption.weight(.bold))
                            .foregroundStyle(.white)
                            .padding(.horizontal, 14)
                            .padding(.vertical, 9)
                            .background(MiaoxunColor.ink.opacity(0.92))
                            .clipShape(Capsule())
                            .padding(.top, 72)
                            .transition(.move(edge: .top).combined(with: .opacity))
                    }
                }
                .foregroundStyle(palette.text)
            }
            .toolbar(.hidden, for: .navigationBar)
            .sheet(item: $activeSheet) { sheet in
                switch sheet {
                case .settings:
                    SettingsView()
                        .environmentObject(session)
                        .presentationDetents([.large])
                case .aiQRCode:
                    AiQRCodeSheet(user: session.user, profile: session.profile)
                        .environmentObject(session)
                        .presentationDetents([.medium, .large])
                }
            }
        }
    }

    private var palette: StationPalette {
        session.isLightStationStyle ? .light : .dark
    }

    @ViewBuilder
    private var stationPanel: some View {
        switch selectedTab {
        case .station:
            MyStationPanel(profile: session.profile, agents: session.agents, palette: palette)
        case .posts:
            StationCard(title: session.text("我的动态", "Posts"), detail: moduleStatus("posts"), palette: palette) {
                StationPlaceholder(symbol: "square.and.pencil", title: session.text("动态发布", "Post publishing"), message: session.text("动态发布、审核和媒体素材表待接入。", "Publishing, review, and media assets are pending."), palette: palette)
            }
        case .agents:
            StationCard(title: session.text("AI伙伴", "AI Partners"), detail: moduleStatus("agents"), palette: palette) {
                AgentCardsView(agents: session.agents, horizontalPadding: false)
            }
        case .social:
            StationCard(title: session.text("社交网络", "Social"), detail: moduleStatus("social"), palette: palette) {
                StationPlaceholder(symbol: "person.2.wave.2", title: session.text("可信关系", "Trusted relations"), message: session.text("关系、互动和可信度评分待接入。", "Relations, interactions, and trust scores are pending."), palette: palette)
            }
        case .files:
            StationCard(title: session.text("我的文件", "Files"), detail: moduleStatus("files"), palette: palette) {
                StationPlaceholder(symbol: "folder.badge.plus", title: session.text("文件空间", "File space"), message: session.text("文件上传、授权和长期保存策略待接入。", "Upload, permission, and retention strategy are pending."), palette: palette)
            }
        }
    }

    private func moduleStatus(_ id: String) -> String {
        session.modules.first(where: { $0.id == id }).map { session.displayText($0.status.rawValue) } ?? session.text("同步中", "Syncing")
    }

    private func copyAIID() {
        guard let aiId = session.user?.aiId, !aiId.isEmpty else {
            showToast(session.text("登录后可复制 AI ID", "Log in to copy AI ID"))
            return
        }

        UIPasteboard.general.string = aiId
        showToast(session.text("AI ID 已复制", "AI ID copied"))
    }

    private func showToast(_ message: String) {
        withAnimation(.easeOut(duration: 0.18)) {
            toastMessage = message
        }

        Task {
            try? await Task.sleep(nanoseconds: 1_600_000_000)
            await MainActor.run {
                withAnimation(.easeIn(duration: 0.18)) {
                    if toastMessage == message {
                        toastMessage = nil
                    }
                }
            }
        }
    }
}

struct StationTopSafeAreaCover: View {
    let palette: StationPalette

    var body: some View {
        GeometryReader { proxy in
            VStack(spacing: 0) {
                palette.background
                    .frame(height: max(proxy.safeAreaInsets.top, 0))
                    .ignoresSafeArea(edges: .top)
                Spacer(minLength: 0)
            }
        }
        .allowsHitTesting(false)
        .zIndex(30)
    }
}

struct StationProfileHeader: View {
    @EnvironmentObject private var session: AppSession
    let profile: StationProfile
    let user: MiaoxunUser?
    let palette: StationPalette
    let onCopyAIID: () -> Void
    let onShowQRCode: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 9) {
            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 7) {
                    Text(session.displayText(profile.nickname))
                        .font(.system(size: 27, weight: .black, design: .rounded))
                        .lineLimit(1)
                        .minimumScaleFactor(0.72)

                    HStack(spacing: 6) {
                        Text(session.text("AI ID：", "AI ID: "))
                            .foregroundStyle(palette.secondaryText)
                        Text(user?.aiId ?? "--")
                            .fontWeight(.bold)
                            .lineLimit(1)
                            .minimumScaleFactor(0.66)

                        Button(action: onCopyAIID) {
                            Image(systemName: "doc.on.doc")
                                .font(.caption.bold())
                                .frame(width: 24, height: 24)
                        }
                        .buttonStyle(MiaoxunPressButtonStyle(pressedScale: 0.9))
                        .accessibilityLabel(session.text("复制 AI ID", "Copy AI ID"))

                        Button(action: onShowQRCode) {
                            Image(systemName: "qrcode")
                                .font(.caption.bold())
                                .frame(width: 24, height: 24)
                        }
                        .buttonStyle(MiaoxunPressButtonStyle(pressedScale: 0.9))
                        .accessibilityLabel(session.text("打开 AI ID 动态二维码", "Open AI ID dynamic code"))
                    }
                    .font(.caption)
                    .foregroundStyle(palette.text)
                }

                Spacer(minLength: 44)
            }

            HStack(spacing: 8) {
                Text(session.text("妙点 \(profile.miaoPoints)", "Points \(profile.miaoPoints)"))
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(palette.text)
                Text(session.text("明细", "Details"))
                    .font(.caption.weight(.black))
                    .foregroundStyle(MiaoxunColor.mint)
            }
            .padding(.horizontal, 9)
            .padding(.vertical, 7)
            .background(palette.soft)
            .clipShape(RoundedRectangle(cornerRadius: 8))
            .overlay {
                RoundedRectangle(cornerRadius: 8)
                    .stroke(palette.stroke, lineWidth: 1)
            }

            VStack(spacing: 7) {
                ProfileRegionRow(title: session.text("我的社区", "Community"), value: profile.community, palette: palette)
                ProfileRegionRow(title: session.text("我的活动区域", "Activity Area"), value: profile.activityArea, palette: palette)
            }
        }
    }
}

struct ProfileRegionRow: View {
    @EnvironmentObject private var session: AppSession
    let title: String
    let value: String
    let palette: StationPalette

    var body: some View {
        HStack(spacing: 8) {
            Text(title)
                .font(.caption.weight(.semibold))
                .foregroundStyle(palette.secondaryText)
            Spacer(minLength: 8)
            Text(session.displayText(value))
                .font(.caption.weight(.bold))
                .lineLimit(1)
                .minimumScaleFactor(0.7)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
        .background(palette.surface)
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .overlay {
            RoundedRectangle(cornerRadius: 8)
                .stroke(palette.stroke, lineWidth: 1)
        }
    }
}

struct AiQRCodeSheet: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var session: AppSession
    let user: MiaoxunUser?
    let profile: StationProfile
    @State private var issuedAt = Date()
    @State private var nonce = UUID().uuidString
    @State private var payload = ""

    private let validitySeconds: TimeInterval = 120

    private var aiId: String {
        user?.aiId ?? "--"
    }

    private var palette: StationPalette {
        session.palette
    }

    var body: some View {
        TimelineView(.periodic(from: issuedAt, by: 1)) { timeline in
            VStack(spacing: 0) {
                AiQRCodeSheetHeader(
                    title: session.text("AI ID 动态码", "AI ID Dynamic Code"),
                    remainingText: remainingText(at: timeline.date),
                    palette: palette,
                    onRefresh: refreshCode,
                    onDismiss: { dismiss() }
                )
                .padding(.horizontal, 20)
                .padding(.top, 18)
                .padding(.bottom, 10)

                ScrollView {
                    VStack(spacing: 0) {
                        DIYQRCodeView(payload: payload, palette: palette)
                            .frame(width: 274, height: 274)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.horizontal, 20)
                    .padding(.top, 14)
                    .padding(.bottom, 22)
                }
                .scrollIndicators(.hidden)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(palette.background.ignoresSafeArea())
            .foregroundStyle(palette.text)
            .onChange(of: remainingSeconds(at: timeline.date)) { _, remainingSeconds in
                if remainingSeconds == 0 {
                    refreshCode()
                }
            }
        }
        .onAppear {
            refreshCode()
        }
    }

    private var expiresAt: Date {
        issuedAt.addingTimeInterval(validitySeconds)
    }

    private func refreshCode() {
        let nextIssuedAt = Date()
        let nextNonce = UUID().uuidString
        withAnimation(.easeOut(duration: 0.18)) {
            issuedAt = nextIssuedAt
            nonce = nextNonce
            payload = qrPayload(expiresAt: nextIssuedAt.addingTimeInterval(validitySeconds), nonce: nextNonce)
        }
    }

    private func remainingText(at date: Date) -> String {
        let remaining = remainingSeconds(at: date)
        return String(format: "%02d:%02d", remaining / 60, remaining % 60)
    }

    private func remainingSeconds(at date: Date) -> Int {
        max(0, Int(expiresAt.timeIntervalSince(date).rounded(.down)))
    }

    private func qrPayload(expiresAt: Date, nonce: String) -> String {
        let expiry = Int(expiresAt.timeIntervalSince1970)
        return "miaoxun://ai/\(aiId)?e=\(expiry)&n=\(nonce.prefix(8))"
    }
}

struct DIYQRCodeView: View {
    let payload: String
    let palette: StationPalette
    private let context = CIContext()
    private let filter = CIFilter.qrCodeGenerator()

    var body: some View {
        if let matrix = makeMatrix() {
            GeometryReader { proxy in
                let count = matrix.count
                let cellSize = proxy.size.width / CGFloat(max(count + 2, 1))
                let gridOffset = cellSize
                let moduleSize = cellSize * 0.72

                Canvas { context, _ in
                    context.fill(
                        Path(roundedRect: CGRect(origin: .zero, size: proxy.size), cornerRadius: 26),
                        with: .color(qrPaper)
                    )

                    for row in 0..<count {
                        for col in 0..<count where matrix[row][col] {
                            guard !isFinderArea(row: row, col: col, count: count) else { continue }
                            let rect = CGRect(
                                x: gridOffset + CGFloat(col) * cellSize + (cellSize - moduleSize) / 2,
                                y: gridOffset + CGFloat(row) * cellSize + (cellSize - moduleSize) / 2,
                                width: moduleSize,
                                height: moduleSize
                            )
                            context.fill(
                                Path(roundedRect: rect, cornerRadius: max(1.4, cellSize * 0.24)),
                                with: .color(qrInk)
                            )
                        }
                    }

                    drawFinder(in: &context, row: 0, col: 0, cellSize: cellSize, offset: gridOffset)
                    drawFinder(in: &context, row: 0, col: count - 7, cellSize: cellSize, offset: gridOffset)
                    drawFinder(in: &context, row: count - 7, col: 0, cellSize: cellSize, offset: gridOffset)
                }
                .frame(width: proxy.size.width, height: proxy.size.width)
                .accessibilityLabel("AI ID QR code")
            }
            .aspectRatio(1, contentMode: .fit)
        } else {
            Image(systemName: "qrcode")
                .font(.system(size: 118))
                .foregroundStyle(qrInk)
        }
    }

    private var qrInk: Color {
        MiaoxunColor.ink
    }

    private var qrPaper: Color {
        Color(red: 0.988, green: 0.990, blue: 0.965)
    }

    private func makeMatrix() -> [[Bool]]? {
        filter.message = Data(payload.utf8)
        filter.correctionLevel = "M"
        guard let outputImage = filter.outputImage else { return nil }

        let extent = outputImage.extent.integral
        let width = Int(extent.width)
        let height = Int(extent.height)
        let bytesPerPixel = 4
        let bytesPerRow = width * bytesPerPixel
        var pixels = [UInt8](repeating: 255, count: height * bytesPerRow)
        let colorSpace = CGColorSpaceCreateDeviceRGB()

        context.render(
            outputImage,
            toBitmap: &pixels,
            rowBytes: bytesPerRow,
            bounds: extent,
            format: .RGBA8,
            colorSpace: colorSpace
        )

        let matrix = (0..<height).map { row in
            (0..<width).map { col in
                let offset = row * bytesPerRow + col * bytesPerPixel
                return pixels[offset] < 128
            }
        }
        return trimmedMatrix(matrix)
    }

    private func isFinderArea(row: Int, col: Int, count: Int) -> Bool {
        let topLeft = row < 8 && col < 8
        let topRight = row < 8 && col >= count - 8
        let bottomLeft = row >= count - 8 && col < 8
        return topLeft || topRight || bottomLeft
    }

    private func trimmedMatrix(_ matrix: [[Bool]]) -> [[Bool]] {
        guard let firstRow = matrix.firstIndex(where: { $0.contains(true) }),
              let lastRow = matrix.lastIndex(where: { $0.contains(true) }) else {
            return matrix
        }

        let trueColumns = matrix.flatMap { row in
            row.enumerated().compactMap { col, value in value ? col : nil }
        }
        guard let firstColumn = trueColumns.min(),
              let lastColumn = trueColumns.max() else {
            return matrix
        }

        return (firstRow...lastRow).map { row in
            Array(matrix[row][firstColumn...lastColumn])
        }
    }

    private func drawFinder(in context: inout GraphicsContext, row: Int, col: Int, cellSize: CGFloat, offset: CGFloat) {
        let origin = CGPoint(x: offset + CGFloat(col) * cellSize, y: offset + CGFloat(row) * cellSize)
        let outer = CGRect(origin: origin, size: CGSize(width: cellSize * 7, height: cellSize * 7)).insetBy(dx: cellSize * 0.22, dy: cellSize * 0.22)
        let middle = outer.insetBy(dx: cellSize * 1.28, dy: cellSize * 1.28)
        let core = outer.insetBy(dx: cellSize * 2.32, dy: cellSize * 2.32)

        context.fill(Path(roundedRect: outer, cornerRadius: cellSize * 1.45), with: .color(qrInk))
        context.fill(Path(roundedRect: middle, cornerRadius: cellSize * 0.98), with: .color(qrPaper))
        context.fill(Path(roundedRect: core, cornerRadius: cellSize * 0.68), with: .color(qrInk))
    }
}

struct AiQRCodeSheetHeader: View {
    @EnvironmentObject private var session: AppSession
    let title: String
    let remainingText: String
    let palette: StationPalette
    let onRefresh: () -> Void
    let onDismiss: () -> Void

    var body: some View {
        HStack(alignment: .center, spacing: 12) {
            Button(action: onDismiss) {
                Image(systemName: "chevron.down")
                    .font(.headline.weight(.bold))
                    .foregroundStyle(MiaoxunColor.mint)
                    .frame(width: 42, height: 42)
                    .background(palette.surface)
                    .clipShape(Circle())
                    .overlay {
                        Circle()
                            .stroke(palette.stroke, lineWidth: 1)
                    }
            }
            .buttonStyle(MiaoxunPressButtonStyle(pressedScale: 0.92))
            .accessibilityLabel(session.text("返回", "Back"))

            Text(title)
                .font(.title3.weight(.black))
                .lineLimit(1)
                .minimumScaleFactor(0.82)

            Spacer(minLength: 8)

            Text(remainingText)
                .font(.caption.weight(.black))
                .foregroundStyle(MiaoxunColor.mint)
                .padding(.horizontal, 10)
                .padding(.vertical, 7)
                .background(MiaoxunColor.mint.opacity(0.12))
                .clipShape(Capsule())
                .overlay {
                    Capsule()
                        .stroke(MiaoxunColor.mint.opacity(0.22), lineWidth: 1)
                }

            Button(action: onRefresh) {
                Image(systemName: "arrow.clockwise")
                    .font(.subheadline.weight(.black))
                    .foregroundStyle(palette.text)
                    .frame(width: 38, height: 38)
                    .background(palette.surface)
                    .clipShape(Circle())
                    .overlay {
                        Circle()
                            .stroke(palette.stroke, lineWidth: 1)
                    }
            }
            .buttonStyle(MiaoxunPressButtonStyle(pressedScale: 0.92))
            .accessibilityLabel(session.text("刷新动态码", "Refresh code"))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct StationStatsRow: View {
    @EnvironmentObject private var session: AppSession
    let profile: StationProfile
    let palette: StationPalette

    var body: some View {
        HStack(spacing: 0) {
            StationStatCell(value: profile.followingCount, title: session.text("关注", "Following"), palette: palette)
            Divider().frame(height: 46)
            StationStatCell(value: profile.followersCount, title: session.text("粉丝", "Followers"), palette: palette)
            Divider().frame(height: 46)
            StationStatCell(value: profile.collectionsCount, title: session.text("收藏", "Saved"), palette: palette)
        }
        .frame(height: 64)
        .background(palette.surface)
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .overlay {
            RoundedRectangle(cornerRadius: 8)
                .stroke(palette.stroke, lineWidth: 1)
        }
    }
}

struct StationTabHeader: View {
    @Binding var selectedTab: StationTab
    let palette: StationPalette

    var body: some View {
        VStack(spacing: 0) {
            StationTabBar(selectedTab: $selectedTab, palette: palette)
                .padding(.horizontal, 14)
                .padding(.top, 10)
                .padding(.bottom, 9)

            Rectangle()
                .fill(palette.stroke)
                .frame(height: 0.5)
        }
        .frame(maxWidth: .infinity)
        .background {
            palette.background.ignoresSafeArea(edges: .top)
        }
        .compositingGroup()
        .zIndex(20)
    }
}

struct StationStatCell: View {
    let value: Int
    let title: String
    let palette: StationPalette

    var body: some View {
        VStack(spacing: 4) {
            Text("\(value)")
                .font(.headline.weight(.black))
            Text(title)
                .font(.caption)
                .foregroundStyle(palette.secondaryText)
        }
        .frame(maxWidth: .infinity)
    }
}

struct StationTabBar: View {
    @EnvironmentObject private var session: AppSession
    @Binding var selectedTab: StationTab
    let palette: StationPalette
    private let visibleTabs: [StationTab] = [.station, .posts, .agents, .social]

    var body: some View {
        MiaoxunSegmentedControl(
            selection: $selectedTab,
            options: visibleTabs,
            title: title(for:),
            palette: palette
        )
    }

    private func title(for tab: StationTab) -> String {
        switch tab {
        case .station:
            return session.text("我的小站", "Station")
        case .posts:
            return session.text("我的动态", "Posts")
        case .agents:
            return session.text("AI伙伴", "AI Partners")
        case .social:
            return session.text("社交网络", "Social")
        case .files:
            return session.text("我的文件", "Files")
        }
    }
}

struct MyStationPanel: View {
    @EnvironmentObject private var session: AppSession
    let profile: StationProfile
    let agents: [AgentSummary]
    let palette: StationPalette

    var body: some View {
        VStack(spacing: 12) {
            StationAvatarSpace(palette: palette)

            StationCard(title: session.text("小站资料", "Profile"), detail: session.text("来自当前账号", "From current account"), palette: palette) {
                VStack(spacing: 8) {
                    ProfileDataRow(title: session.text("昵称", "Name"), value: profile.nickname, palette: palette)
                    ProfileDataRow(title: session.text("简介", "Bio"), value: profile.bio, palette: palette)
                    ProfileDataRow(title: session.text("社区", "Community"), value: profile.community, palette: palette)
                    ProfileDataRow(title: session.text("活动区域", "Activity Area"), value: profile.activityArea, palette: palette)
                }
            }

            StationCard(title: session.text("个人日记", "Diary"), detail: session.text("待接入", "Pending"), palette: palette) {
                DiaryComicGrid(palette: palette)
            }

            StationCard(title: session.text("个人相册", "Album"), detail: session.text("待接入", "Pending"), palette: palette) {
                AlbumPreviewGrid(palette: palette)
            }

            StationCard(title: session.text("喜欢的音乐菜单", "Music Menu"), detail: session.text("待接入", "Pending"), palette: palette) {
                MusicMenuPreview(palette: palette)
            }

            StationCard(title: session.text("可调用能力 Agent", "Callable Agents"), detail: agents.isEmpty ? session.text("同步中", "Syncing") : session.text("\(agents.count) 个", "\(agents.count)"), palette: palette) {
                AgentCardsView(agents: agents, horizontalPadding: false)
            }
        }
    }
}

struct StationAvatarSpace: View {
    @EnvironmentObject private var session: AppSession
    let palette: StationPalette
    private var stageGradientColors: [Color] {
        session.isLightStationStyle
            ? [Color.white.opacity(0.98), palette.soft]
            : [Color(red: 0.16, green: 0.18, blue: 0.17), Color(red: 0.09, green: 0.105, blue: 0.10)]
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ZStack {
                AvatarStageLarge()
                    .frame(maxWidth: .infinity)
                    .padding(.top, 10)
                    .padding(.bottom, 4)

                FloatingTag(text: session.text("3D名片", "3D Card"), x: -104, y: -82)
                FloatingTag(text: session.text("漫画日记", "Comic Diary"), x: 96, y: -46)
                FloatingTag(text: session.text("AI伙伴", "AI Partner"), x: -95, y: 46)
                FloatingTag(text: session.text("可被调用", "Callable"), x: 94, y: 88, tint: MiaoxunColor.rose, textColor: .white)
            }
            .frame(height: 246)

            VStack(alignment: .leading, spacing: 6) {
                Text(session.text("默认形象", "Default Look"))
                    .font(.caption.weight(.black))
                    .foregroundStyle(MiaoxunColor.sun)
                Text(session.text("我的模样", "My Look"))
                    .font(.title3.weight(.black))
                Text(session.text("当前账号还没有上传素材和生成授权，所以只展示默认形象。", "This account has not uploaded assets or granted generation permission, so only the default look is shown."))
                    .font(.caption)
                    .foregroundStyle(palette.secondaryText)
                    .fixedSize(horizontal: false, vertical: true)

                Button {} label: {
                    Text(session.text("我今天的 OOTD", "Today's OOTD"))
                        .font(.caption.weight(.black))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .background(MiaoxunColor.ink)
                        .clipShape(Capsule())
                }
                .buttonStyle(MiaoxunPressButtonStyle())
                .padding(.top, 3)
            }
            .padding(14)
        }
        .background(
            LinearGradient(
                colors: stageGradientColors,
                startPoint: .top,
                endPoint: .bottom
            )
        )
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .overlay {
            RoundedRectangle(cornerRadius: 8)
                .stroke(palette.stroke, lineWidth: 1)
        }
        .shadow(color: palette.shadow, radius: 18, y: 8)
    }
}

struct AvatarStageLarge: View {
    @State private var glow = false

    var body: some View {
        ZStack {
            Ellipse()
                .fill(Color.black.opacity(0.07))
                .frame(width: 166, height: 28)
                .blur(radius: 2)
                .offset(y: 91)

            VStack(spacing: -7) {
                ZStack {
                    Circle()
                        .fill(Color(red: 0.99, green: 0.80, blue: 0.62))
                        .frame(width: 74, height: 74)
                    Circle()
                        .fill(MiaoxunColor.ink)
                        .frame(width: 9, height: 9)
                        .offset(x: -15, y: -3)
                    Circle()
                        .fill(MiaoxunColor.ink)
                        .frame(width: 9, height: 9)
                        .offset(x: 15, y: -3)
                    Capsule()
                        .stroke(MiaoxunColor.ink, lineWidth: 2)
                        .frame(width: 24, height: 10)
                        .offset(y: 15)
                    Capsule()
                        .fill(MiaoxunColor.sun)
                        .frame(width: 88, height: 25)
                        .offset(y: -39)
                    Capsule()
                        .fill(MiaoxunColor.ink)
                        .frame(width: 50, height: 10)
                        .offset(y: -54)
                }

                ZStack {
                    RoundedRectangle(cornerRadius: 24)
                        .fill(MiaoxunColor.mint)
                        .frame(width: 96, height: 88)
                    RoundedRectangle(cornerRadius: 14)
                        .fill(MiaoxunColor.ink)
                        .frame(width: 42, height: 64)
                        .offset(y: 7)
                    Capsule()
                        .fill(Color(red: 0.99, green: 0.80, blue: 0.62))
                        .frame(width: 24, height: 62)
                        .rotationEffect(.degrees(-22))
                        .offset(x: -55, y: -3)
                    Capsule()
                        .fill(Color(red: 0.99, green: 0.80, blue: 0.62))
                        .frame(width: 24, height: 62)
                        .rotationEffect(.degrees(22))
                        .offset(x: 55, y: -3)
                }

                HStack(spacing: 12) {
                    Capsule()
                        .fill(MiaoxunColor.ink)
                        .frame(width: 24, height: 58)
                    Capsule()
                        .fill(MiaoxunColor.ink)
                        .frame(width: 24, height: 58)
                }
            }
            .offset(y: 0)

            Text("♪")
                .font(.title.weight(.black))
                .foregroundStyle(MiaoxunColor.rose)
                .opacity(glow ? 1 : 0.72)
                .offset(x: 86, y: -74)
            Text("♬")
                .font(.title2.weight(.black))
                .foregroundStyle(MiaoxunColor.mint)
                .opacity(glow ? 0.88 : 0.62)
                .offset(x: -86, y: -58)
        }
        .task {
            glow = true
        }
    }
}

struct FloatingTag: View {
    let text: String
    let x: CGFloat
    let y: CGFloat
    var tint: Color = MiaoxunColor.surface
    var textColor: Color = MiaoxunColor.ink

    var body: some View {
        Text(text)
            .font(.caption2.weight(.black))
            .foregroundStyle(textColor)
            .padding(.horizontal, 9)
            .padding(.vertical, 6)
            .background(tint)
            .clipShape(Capsule())
            .overlay {
                Capsule()
                    .stroke(Color.black.opacity(0.08), lineWidth: 1)
            }
            .offset(x: x, y: y)
    }
}

struct StationCard<Content: View>: View {
    let title: String
    let detail: String
    let palette: StationPalette
    @ViewBuilder let content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 12) {
                Text(title)
                    .font(.subheadline.weight(.black))
                    .lineLimit(1)
                Spacer()
                Text(detail)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(palette.secondaryText)
                    .lineLimit(1)
            }

            content
        }
        .padding(14)
        .background(palette.surface)
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .overlay {
            RoundedRectangle(cornerRadius: 8)
                .stroke(palette.stroke, lineWidth: 1)
        }
        .shadow(color: palette.shadow, radius: 16, y: 8)
    }
}

struct ProfileDataRow: View {
    @EnvironmentObject private var session: AppSession
    let title: String
    let value: String
    let palette: StationPalette

    var body: some View {
        HStack(spacing: 10) {
            Text(title)
                .font(.caption.weight(.semibold))
                .foregroundStyle(palette.secondaryText)
            Spacer(minLength: 10)
            Text(session.displayText(value))
                .font(.caption.weight(.bold))
                .lineLimit(1)
                .minimumScaleFactor(0.68)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 9)
        .background(palette.soft)
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }
}

struct DiaryComicGrid: View {
    @EnvironmentObject private var session: AppSession
    let palette: StationPalette
    private var cardStroke: Color {
        session.isLightStationStyle ? palette.text : palette.stroke
    }
    private var cardShadow: Color {
        session.isLightStationStyle ? palette.text.opacity(0.55) : Color.black.opacity(0.34)
    }

    var body: some View {
        LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 9) {
            ForEach(items, id: \.title) { item in
                VStack(alignment: .leading, spacing: 8) {
                    Text(item.badge)
                        .font(.title2.weight(.black))
                    Spacer()
                    Text(item.title)
                        .font(.caption.weight(.black))
                    Text(item.detail)
                        .font(.caption2)
                        .foregroundStyle(palette.secondaryText)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .frame(maxWidth: .infinity, minHeight: 130, alignment: .topLeading)
                .padding(10)
                .background(palette.background)
                .clipShape(RoundedRectangle(cornerRadius: 6))
                .overlay {
                    RoundedRectangle(cornerRadius: 6)
                        .stroke(cardStroke, lineWidth: 2)
                }
                .shadow(color: cardShadow, radius: 0, x: 3, y: 3)
            }
        }
    }

    private var items: [(title: String, detail: String, badge: String)] {
        [
            (
                session.text("今日手账", "Today Notes"),
                session.text("待接入日记生成任务。", "Diary generation is pending."),
                session.text("早", "AM")
            ),
            (
                session.text("连载日记", "Serial Diary"),
                session.text("待接入章节归档。", "Chapter archive is pending."),
                session.text("续", "Next")
            )
        ]
    }
}

struct AlbumPreviewGrid: View {
    @EnvironmentObject private var session: AppSession
    let palette: StationPalette

    var body: some View {
        HStack(spacing: 9) {
            ForEach(labels, id: \.self) { label in
                VStack(spacing: 8) {
                    Image(systemName: "photo")
                        .font(.title2)
                        .foregroundStyle(MiaoxunColor.mint)
                    Text(label)
                        .font(.caption.weight(.bold))
                }
                .frame(maxWidth: .infinity, minHeight: 82)
                .background(palette.soft)
                .clipShape(RoundedRectangle(cornerRadius: 8))
            }
        }
    }

    private var labels: [String] {
        [
            session.text("照片", "Photos"),
            session.text("旅行", "Travel"),
            session.text("生活", "Life")
        ]
    }
}

struct MusicMenuPreview: View {
    @EnvironmentObject private var session: AppSession
    let palette: StationPalette

    var body: some View {
        VStack(spacing: 8) {
            ForEach(titles, id: \.self) { title in
                HStack {
                    Image(systemName: "music.note")
                        .foregroundStyle(MiaoxunColor.rose)
                    Text(title)
                        .font(.caption.weight(.bold))
                    Spacer()
                    Text(session.text("待接入", "Pending"))
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(palette.secondaryText)
                }
                .padding(10)
                .background(palette.soft)
                .clipShape(RoundedRectangle(cornerRadius: 8))
            }
        }
    }

    private var titles: [String] {
        [
            session.text("晨间灵感", "Morning Ideas"),
            session.text("专注编码", "Focus Coding"),
            session.text("夜间漫游", "Night Drift")
        ]
    }
}

struct StationPlaceholder: View {
    let symbol: String
    let title: String
    let message: String
    let palette: StationPalette

    var body: some View {
        VStack(spacing: 10) {
            Image(systemName: symbol)
                .font(.title)
                .foregroundStyle(MiaoxunColor.mint)
            Text(title)
                .font(.headline)
            Text(message)
                .font(.caption)
                .foregroundStyle(palette.secondaryText)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, minHeight: 150)
        .padding(14)
        .background(palette.soft)
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }
}

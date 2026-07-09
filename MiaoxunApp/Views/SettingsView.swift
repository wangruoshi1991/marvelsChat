import SwiftUI

struct SettingsView: View {
    @EnvironmentObject private var session: AppSession
    @Environment(\.dismiss) private var dismiss
    @State private var notificationsEnabled = true
    private var palette: StationPalette {
        session.palette
    }
    private var selectedStationStyle: Binding<StationStyleOption> {
        Binding(
            get: { session.isLightStationStyle ? .light : .dark },
            set: { session.isLightStationStyle = $0 == .light }
        )
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    SettingsHeader(title: session.text("设置", "Settings")) {
                        dismiss()
                    }
                    .environmentObject(session)

                    SettingsAccountCard(user: session.user)
                        .environmentObject(session)

                    SettingsGroupCard(title: session.text("显示", "Display")) {
                        SettingsSegmentRow(title: session.text("小站视觉", "Station style")) {
                            MiaoxunSegmentedControl(
                                selection: selectedStationStyle,
                                options: StationStyleOption.allCases,
                                title: title(for:),
                                palette: palette
                            )
                        }

                        SettingsSegmentRow(title: session.text("语言", "Language")) {
                            MiaoxunSegmentedControl(
                                selection: $session.language,
                                options: AppSession.AppLanguage.allCases,
                                title: { $0.title },
                                palette: palette
                            )
                        }
                    }

                    SettingsGroupCard(title: session.text("通知", "Notifications")) {
                        Toggle(session.text("允许妙讯通知", "Allow Miaoxun notifications"), isOn: $notificationsEnabled)
                        Text(session.text("iOS 推送后续通过 APNs 和 UserNotifications 接入。", "iOS push will be connected through APNs and UserNotifications."))
                            .font(.caption)
                            .foregroundStyle(palette.secondaryText)
                    }

                    SettingsGroupCard(title: session.text("空间与权限", "Space & Permissions")) {
                        SettingsRow(symbol: "photo", title: session.text("相册素材", "Album assets"), value: session.text("待授权", "Pending"))
                        SettingsRow(symbol: "folder", title: session.text("文件访问", "File access"), value: session.text("待接入", "Pending"))
                        SettingsRow(symbol: "brain.head.profile", title: session.text("长期记忆", "Long-term memory"), value: session.text("需确认", "Confirm"))
                    }

                    SettingsGroupCard(title: session.text("账户", "Account")) {
                        Button(role: .destructive) {
                            session.logout()
                        } label: {
                            HStack(spacing: 10) {
                                Image(systemName: "rectangle.portrait.and.arrow.right")
                                    .frame(width: 28, height: 28)
                                    .background(MiaoxunColor.rose.opacity(0.12))
                                    .clipShape(RoundedRectangle(cornerRadius: 8))
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(session.text("退出登录", "Log out"))
                                        .font(.subheadline.weight(.black))
                                    Text(session.text("退出后会清除本机登录态。", "This clears the local session on this device."))
                                        .font(.caption)
                                        .foregroundStyle(palette.secondaryText)
                                }
                                Spacer()
                                Image(systemName: "chevron.right")
                                    .font(.caption.weight(.bold))
                                    .foregroundStyle(palette.secondaryText)
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(12)
                            .background(palette.soft)
                            .clipShape(RoundedRectangle(cornerRadius: 8))
                        }
                        .buttonStyle(MiaoxunPressButtonStyle())
                    }
                }
                .padding(14)
            }
            .background(palette.background.ignoresSafeArea())
            .foregroundStyle(palette.text)
            .toolbar(.hidden, for: .navigationBar)
        }
    }

    private func title(for style: StationStyleOption) -> String {
        switch style {
        case .light:
            return session.text("浅色", "Light")
        case .dark:
            return session.text("深色", "Dark")
        }
    }
}

struct SettingsHeader: View {
    @EnvironmentObject private var session: AppSession
    let title: String
    let onDismiss: () -> Void
    private var palette: StationPalette {
        session.palette
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
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
                .font(.system(size: 34, weight: .black, design: .rounded))
                .foregroundStyle(palette.text)
        }
        .padding(.top, 2)
    }
}

enum StationStyleOption: String, CaseIterable, Identifiable {
    case light
    case dark

    var id: String { rawValue }
}

struct SettingsAccountCard: View {
    @EnvironmentObject private var session: AppSession
    let user: MiaoxunUser?
    private var palette: StationPalette {
        session.palette
    }

    var body: some View {
        HStack(spacing: 12) {
            AvatarBadge(text: "妙")
            VStack(alignment: .leading, spacing: 4) {
                Text(session.displayText(user?.displayName ?? "未登录"))
                    .font(.headline.weight(.black))
                Text(user?.role == "admin" ? session.text("管理员", "Admin") : session.text("普通用户", "User"))
                    .font(.caption)
                    .foregroundStyle(palette.secondaryText)
            }
            Spacer()
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

struct SettingsGroupCard<Content: View>: View {
    @EnvironmentObject private var session: AppSession
    let title: String
    @ViewBuilder let content: Content
    private var palette: StationPalette {
        session.palette
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title)
                .font(.caption.weight(.black))
                .foregroundStyle(palette.secondaryText)
            VStack(spacing: 10) {
                content
            }
            .foregroundStyle(palette.text)
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

struct SettingsRow: View {
    @EnvironmentObject private var session: AppSession
    let symbol: String
    let title: String
    let value: String
    private var palette: StationPalette {
        session.palette
    }

    var body: some View {
        HStack {
            Image(systemName: symbol)
                .foregroundStyle(MiaoxunColor.mint)
            Text(title)
            Spacer()
            Text(value)
                .foregroundStyle(palette.secondaryText)
        }
    }
}

struct SettingsSegmentRow<Content: View>: View {
    @EnvironmentObject private var session: AppSession
    let title: String
    @ViewBuilder let content: Content
    private var palette: StationPalette {
        session.palette
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.caption.weight(.semibold))
                .foregroundStyle(palette.secondaryText)
            content
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

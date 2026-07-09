import SwiftUI

struct AuthView: View {
    @EnvironmentObject private var session: AppSession
    @State private var mode: AuthMode = .login
    @State private var identifier = ""
    @State private var displayName = ""
    @State private var password = ""
    @State private var isSubmitting = false
    private var palette: StationPalette {
        session.palette
    }

    enum AuthMode: String, CaseIterable {
        case login = "登录"
        case register = "注册"
    }

    var body: some View {
        ZStack {
            palette.background.ignoresSafeArea()

            VStack(alignment: .leading, spacing: 24) {
                Spacer(minLength: 28)

                VStack(alignment: .leading, spacing: 10) {
                    Text(session.text("妙讯", "Miaoxun"))
                        .font(.system(size: 46, weight: .black, design: .rounded))
                    Text(session.text("AI 不只问答，找人，找东西，就上妙讯小站。", "Miaoxun is for people, things, and services, not just answers."))
                        .font(.title3)
                        .foregroundStyle(palette.secondaryText)
                        .fixedSize(horizontal: false, vertical: true)
                }

                MiaoxunSegmentedControl(
                    selection: $mode,
                    options: AuthMode.allCases,
                    title: { item in session.text(item.rawValue, item == .login ? "Login" : "Register") },
                    palette: palette
                )

                VStack(spacing: 14) {
                    TextField(session.text("账号或邮箱", "Account or email"), text: $identifier)
                        .textContentType(.username)
                        .keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        .miaoxunField()

                    if mode == .register {
                        TextField(session.text("昵称", "Display name"), text: $displayName)
                            .textContentType(.name)
                            .miaoxunField()
                            .transition(.move(edge: .top).combined(with: .opacity))
                    }

                    SecureField(session.text("密码", "Password"), text: $password)
                        .textContentType(mode == .login ? .password : .newPassword)
                        .miaoxunField()

                    Button {
                        submit()
                    } label: {
                        HStack {
                            if isSubmitting {
                                ProgressView()
                                    .tint(.white)
                            } else {
                                Image(systemName: "arrow.right.circle.fill")
                            }
                            Text(session.text(mode.rawValue, mode == .login ? "Login" : "Register"))
                        }
                        .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(MiaoxunPrimaryButtonStyle())
                    .disabled(isSubmitting || !canSubmit)
                }

                Spacer()
            }
            .padding(22)
        }
        .foregroundStyle(palette.text)
        .animation(.easeOut(duration: 0.22), value: mode)
    }

    private var canSubmit: Bool {
        !identifier.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
            password.count >= (mode == .login ? 1 : 8) &&
            (mode == .login || !displayName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
    }

    private func submit() {
        let identifier = identifier.trimmingCharacters(in: .whitespacesAndNewlines)
        let displayName = displayName.trimmingCharacters(in: .whitespacesAndNewlines)

        isSubmitting = true
        Task {
            if mode == .login {
                await session.signIn(identifier: identifier, password: password)
            } else {
                await session.signUp(email: identifier, password: password, displayName: displayName)
            }
            isSubmitting = false
        }
    }
}

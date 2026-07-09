import SwiftUI

struct ChatDetailView: View {
    let thread: ChatThread
    var bottomInset: CGFloat = 0
    @EnvironmentObject private var session: AppSession
    @State private var draft = ""
    @State private var isSending = false
    @FocusState private var isComposerFocused: Bool
    private var palette: StationPalette {
        session.palette
    }

    private var currentThread: ChatThread {
        session.threads.first(where: { $0.id == thread.id }) ?? thread
    }

    private var bottomAnchorId: String {
        "bottom-\(currentThread.id)"
    }

    var body: some View {
        ScrollViewReader { proxy in
            VStack(spacing: 0) {
                ScrollView {
                    LazyVStack(spacing: 14) {
                        ForEach(currentThread.messages) { message in
                            MessageBubble(message: message)
                        }

                        Color.clear
                            .frame(height: 1)
                            .id(bottomAnchorId)
                    }
                    .padding()
                }
                .background(palette.background)
                .scrollDismissesKeyboard(.interactively)
                .onAppear {
                    scrollToBottom(proxy, animated: false)
                    Task {
                        await session.markThreadRead(threadId: thread.id)
                        await session.refreshThread(threadId: thread.id)
                    }
                }
                .onChange(of: currentThread.messages.count) { _, _ in
                    scrollToBottom(proxy, animated: true)
                }

                HStack(alignment: .bottom, spacing: 10) {
                    TextField(session.text("发给\(currentThread.title)", "Message \(session.displayText(currentThread.title))"), text: $draft, axis: .vertical)
                        .focused($isComposerFocused)
                        .lineLimit(1...4)
                        .padding(12)
                        .background(palette.background)
                        .clipShape(RoundedRectangle(cornerRadius: 18))

                    Button {
                        send()
                    } label: {
                        if isSending {
                            ProgressView()
                                .frame(width: 34, height: 34)
                        } else {
                            Image(systemName: "arrow.up.circle.fill")
                                .font(.system(size: 34))
                        }
                    }
                    .disabled(isSending || draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
                .padding(.horizontal)
                .padding(.top, 12)
                .padding(.bottom, 12 + bottomInset)
                .background(palette.surface)
                .overlay(alignment: .top) {
                    Rectangle()
                        .fill(palette.stroke)
                        .frame(height: 0.5)
                }
            }
            .background(palette.background)
            .foregroundStyle(palette.text)
            .navigationTitle(session.displayText(currentThread.title))
            .navigationBarTitleDisplayMode(.inline)
        }
    }

    private func send() {
        let content = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !content.isEmpty else { return }

        draft = ""
        isSending = true
        isComposerFocused = false
        Task {
            await session.sendMessage(threadId: thread.id, content: content)
            isSending = false
        }
    }

    private func scrollToBottom(_ proxy: ScrollViewProxy, animated: Bool) {
        let action = {
            proxy.scrollTo(bottomAnchorId, anchor: .bottom)
        }

        DispatchQueue.main.async {
            if animated {
                withAnimation(.easeOut(duration: 0.2), action)
            } else {
                action()
            }
        }
    }
}

struct MessageBubble: View {
    @EnvironmentObject private var session: AppSession
    let message: ChatMessage
    private var palette: StationPalette {
        session.palette
    }

    var isMine: Bool {
        message.sender == .user
    }

    var body: some View {
        HStack(alignment: .bottom, spacing: 8) {
            if isMine { Spacer(minLength: 42) }

            if !isMine {
                AvatarBadge(text: String(message.name.prefix(1)))
                    .scaleEffect(0.78)
            }

            VStack(alignment: isMine ? .trailing : .leading, spacing: 5) {
                Text(session.displayText(message.name))
                    .font(.caption)
                    .foregroundStyle(palette.secondaryText)

                Text(session.displayText(message.content))
                    .font(.body)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 11)
                    .foregroundStyle(isMine ? .white : palette.text)
                    .background(isMine ? MiaoxunColor.mint : palette.surface)
                    .clipShape(RoundedRectangle(cornerRadius: 18))

                Text(message.time)
                    .font(.caption2)
                    .foregroundStyle(palette.secondaryText.opacity(0.72))
            }

            if !isMine { Spacer(minLength: 42) }
        }
    }
}

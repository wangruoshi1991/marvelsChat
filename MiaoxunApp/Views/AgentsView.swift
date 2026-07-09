import SwiftUI

struct AgentsView: View {
    @EnvironmentObject private var session: AppSession

    var body: some View {
        NavigationStack {
            AgentCardsView(agents: session.agents)
                .padding(.top)
                .background(session.palette.background)
                .foregroundStyle(session.palette.text)
                .navigationTitle(session.text("AI伙伴", "AI Partners"))
        }
    }
}

struct AgentCardsView: View {
    @EnvironmentObject private var session: AppSession
    var agents: [AgentSummary]? = nil
    var horizontalPadding = true

    private var visibleAgents: [AgentSummary] {
        agents ?? session.agents
    }

    var body: some View {
        VStack(spacing: 12) {
            if visibleAgents.isEmpty {
                EmptyModuleView(
                    symbol: "sparkles",
                    title: session.text("暂无可用 AI 伙伴", "No AI partners yet"),
                    message: session.text("后端注册 Agent 后会在这里显示授权状态。", "Registered backend agents and permission status will appear here.")
                )
            } else {
                ForEach(visibleAgents) { agent in
                    AgentCard(
                        title: session.displayText(agent.title),
                        subtitle: session.displayText(agent.subtitle),
                        status: session.displayText(agent.status),
                        symbol: agent.symbol
                    )
                }
            }
        }
        .padding(.horizontal, horizontalPadding ? 14 : 0)
    }
}

struct AgentCard: View {
    @EnvironmentObject private var session: AppSession
    let title: String
    let subtitle: String
    let status: String
    let symbol: String

    var body: some View {
        HStack(spacing: 14) {
            Image(systemName: symbol)
                .font(.title2)
                .foregroundStyle(MiaoxunColor.mint)
                .frame(width: 46, height: 46)
                .background(MiaoxunColor.mint.opacity(0.14))
                .clipShape(RoundedRectangle(cornerRadius: 14))

            VStack(alignment: .leading, spacing: 5) {
                Text(title)
                    .font(.headline)
                Text(subtitle)
                    .font(.subheadline)
                    .foregroundStyle(session.palette.secondaryText)
            }

            Spacer()

            Text(status)
                .font(.caption.bold())
                .foregroundStyle(status == "已授权" || status == "Authorized" ? MiaoxunColor.mint : .secondary)
        }
        .padding(16)
        .background(session.palette.surface)
        .clipShape(RoundedRectangle(cornerRadius: 18))
        .overlay {
            RoundedRectangle(cornerRadius: 18)
                .stroke(session.palette.stroke, lineWidth: 1)
        }
    }
}

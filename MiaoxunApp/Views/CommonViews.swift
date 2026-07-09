import SwiftUI

struct AvatarBadge: View {
    let text: String

    var body: some View {
        Text(text)
            .font(.headline.bold())
            .foregroundStyle(MiaoxunColor.ink)
            .frame(width: 48, height: 48)
            .background(MiaoxunColor.sun)
            .clipShape(RoundedRectangle(cornerRadius: 16))
    }
}

struct CapabilityRow: View {
    @EnvironmentObject private var session: AppSession
    let symbol: String
    let title: String
    let subtitle: String

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: symbol)
                .font(.headline)
                .foregroundStyle(MiaoxunColor.mint)
                .frame(width: 34, height: 34)
                .background(MiaoxunColor.mint.opacity(0.12))
                .clipShape(RoundedRectangle(cornerRadius: 10))

            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.headline)
                Text(subtitle)
                    .font(.caption)
                    .foregroundStyle(session.palette.secondaryText)
            }
        }
    }
}

struct EmptyModuleView: View {
    @EnvironmentObject private var session: AppSession
    let symbol: String
    let title: String
    let message: String

    var body: some View {
        VStack(spacing: 14) {
            Image(systemName: symbol)
                .font(.system(size: 42))
                .foregroundStyle(MiaoxunColor.mint)
            Text(title)
                .font(.title2.bold())
            Text(message)
                .font(.subheadline)
                .foregroundStyle(session.palette.secondaryText)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity, minHeight: 240)
        .padding()
        .background(session.palette.surface)
        .clipShape(RoundedRectangle(cornerRadius: 22))
        .overlay {
            RoundedRectangle(cornerRadius: 22)
                .stroke(session.palette.stroke, lineWidth: 1)
        }
        .padding(.horizontal)
    }
}

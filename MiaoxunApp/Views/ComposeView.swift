import SwiftUI

struct ComposeView: View {
    @EnvironmentObject private var session: AppSession
    @State private var text = ""
    private var palette: StationPalette {
        session.palette
    }

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 16) {
                Text(session.text("发布动态", "Publish Post"))
                    .font(.largeTitle.bold())

                TextEditor(text: $text)
                    .frame(minHeight: 180)
                    .padding(10)
                    .background(palette.surface)
                    .clipShape(RoundedRectangle(cornerRadius: 18))

                Text(session.text("发布前需要后端补充 posts、media_assets 和审核流。", "Backend posts, media_assets, and review flow are needed before publishing."))
                    .font(.subheadline)
                    .foregroundStyle(palette.secondaryText)

                Button(session.text("保存草稿", "Save Draft")) {}
                    .buttonStyle(MiaoxunPrimaryButtonStyle())

                Spacer()
            }
            .padding()
            .background(palette.background)
            .foregroundStyle(palette.text)
            .navigationTitle(session.text("发布", "Publish"))
        }
    }
}

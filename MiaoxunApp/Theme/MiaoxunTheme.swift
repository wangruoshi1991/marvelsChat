import SwiftUI

enum MiaoxunColor {
    static let background = Color(red: 0.965, green: 0.966, blue: 0.952)
    static let surface = Color(red: 1.0, green: 1.0, blue: 0.985)
    static let soft = Color(red: 0.925, green: 0.938, blue: 0.918)
    static let nightBackground = Color(red: 0.055, green: 0.061, blue: 0.058)
    static let nightSurface = Color(red: 0.125, green: 0.136, blue: 0.130)
    static let nightSoft = Color(red: 0.190, green: 0.215, blue: 0.200)
    static let mint = Color(red: 0.18, green: 0.68, blue: 0.52)
    static let sun = Color(red: 0.96, green: 0.77, blue: 0.29)
    static let rose = Color(red: 0.95, green: 0.34, blue: 0.42)
    static let ink = Color(red: 0.10, green: 0.12, blue: 0.11)
}

struct StationPalette {
    let background: Color
    let surface: Color
    let soft: Color
    let text: Color
    let secondaryText: Color
    let stroke: Color
    let shadow: Color

    static let light = StationPalette(
        background: MiaoxunColor.background,
        surface: MiaoxunColor.surface,
        soft: MiaoxunColor.soft,
        text: MiaoxunColor.ink,
        secondaryText: MiaoxunColor.ink.opacity(0.62),
        stroke: Color.black.opacity(0.08),
        shadow: Color.black.opacity(0.04)
    )

    static let dark = StationPalette(
        background: MiaoxunColor.nightBackground,
        surface: MiaoxunColor.nightSurface,
        soft: MiaoxunColor.nightSoft,
        text: Color(red: 0.94, green: 0.965, blue: 0.94),
        secondaryText: Color(red: 0.76, green: 0.80, blue: 0.76),
        stroke: Color.white.opacity(0.16),
        shadow: Color.black.opacity(0.42)
    )
}

extension AppSession {
    var palette: StationPalette {
        isLightStationStyle ? .light : .dark
    }
}

struct MiaoxunPrimaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.headline)
            .foregroundStyle(.white)
            .padding(.vertical, 14)
            .padding(.horizontal, 16)
            .background(MiaoxunColor.mint.opacity(configuration.isPressed ? 0.75 : 1.0))
            .clipShape(RoundedRectangle(cornerRadius: 16))
            .scaleEffect(configuration.isPressed ? 0.98 : 1.0)
    }
}

struct MiaoxunPressButtonStyle: ButtonStyle {
    var pressedScale: CGFloat = 0.96

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? pressedScale : 1.0)
            .opacity(configuration.isPressed ? 0.78 : 1.0)
            .animation(.easeOut(duration: 0.14), value: configuration.isPressed)
    }
}

struct MiaoxunSegmentedControl<Option: Hashable>: View {
    @Binding var selection: Option
    let options: [Option]
    let title: (Option) -> String
    let palette: StationPalette

    var body: some View {
        HStack(spacing: 4) {
            ForEach(options, id: \.self) { option in
                Button {
                    withAnimation(.easeOut(duration: 0.18)) {
                        selection = option
                    }
                } label: {
                    Text(title(option))
                        .font(.caption.weight(.bold))
                        .foregroundStyle(selection == option ? palette.text : palette.secondaryText)
                        .lineLimit(1)
                        .minimumScaleFactor(0.74)
                        .frame(maxWidth: .infinity, minHeight: 34)
                        .padding(.horizontal, 4)
                        .background(selection == option ? palette.surface : Color.clear)
                        .clipShape(RoundedRectangle(cornerRadius: 7))
                        .overlay {
                            if selection == option {
                                RoundedRectangle(cornerRadius: 7)
                                    .stroke(palette.stroke, lineWidth: 1)
                            }
                        }
                }
                .buttonStyle(MiaoxunPressButtonStyle(pressedScale: 0.97))
                .accessibilityAddTraits(selection == option ? .isSelected : [])
            }
        }
        .padding(4)
        .background(palette.soft)
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .overlay {
            RoundedRectangle(cornerRadius: 8)
                .stroke(palette.stroke, lineWidth: 1)
        }
    }
}

extension View {
    func miaoxunField() -> some View {
        modifier(MiaoxunFieldModifier())
    }
}

struct MiaoxunFieldModifier: ViewModifier {
    @EnvironmentObject private var session: AppSession

    func body(content: Content) -> some View {
        content
            .padding(13)
            .background(session.palette.surface)
            .clipShape(RoundedRectangle(cornerRadius: 16))
            .overlay {
                RoundedRectangle(cornerRadius: 16)
                    .stroke(session.palette.stroke, lineWidth: 1)
            }
            .textFieldStyle(.plain)
    }
}

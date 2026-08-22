//
//  OnboardingViews.swift
//  SendMealie
//

import SwiftUI

struct LoadingStep: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        VStack(spacing: 18) {
            ProgressView()
                .controlSize(.large)
            Text(model.t("loading.title"))
                .font(.callout)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

struct LanguageStep: View {
    @EnvironmentObject private var model: AppModel
    @State private var selection: AppLanguage = .system

    var body: some View {
        OnboardingShell(title: model.t("language.title"), subtitle: model.t("language.subtitle")) {
            VStack(spacing: 10) {
                ForEach([AppLanguage.french, .english], id: \.self) { language in
                    LanguageRow(
                        label: language.nativeName,
                        detail: language == .french ? "Français" : "English",
                        selected: selection == language
                    ) { selection = language }
                    .accessibilityIdentifier("language-\(language.rawValue)")
                }

                LanguageRow(
                    label: AppStrings.value("language.system", selection),
                    detail: AppLanguage.system.resolved == .french ? "Français" : "English",
                    selected: selection == .system
                ) { selection = .system }
                .accessibilityIdentifier("language-system")
            }
            .frame(maxWidth: 360)

            Button(AppStrings.value("common.continue", selection)) {
                model.choose(language: selection)
            }
            .buttonStyle(PrimaryButtonStyle())
            .keyboardShortcut(.defaultAction)
            .accessibilityIdentifier("language-continue")
        }
    }
}

private struct LanguageRow: View {
    let label: String
    let detail: String
    let selected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 12) {
                Image(systemName: selected ? "largecircle.fill.circle" : "circle")
                    .foregroundStyle(selected ? Brand.accent : Color.secondary)
                Text(label)
                Spacer()
                Text(detail)
                    .foregroundStyle(.secondary)
                    .font(.callout)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 11)
            .background(
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .fill(selected ? Brand.accent.opacity(0.12) : Color.secondary.opacity(0.07))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .stroke(selected ? Brand.accent.opacity(0.55) : .clear, lineWidth: 1)
            )
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

struct ServerStep: View {
    @EnvironmentObject private var model: AppModel
    @FocusState private var focused: Bool

    var body: some View {
        OnboardingShell(title: model.t("server.title"), subtitle: model.t("server.subtitle")) {
            VStack(spacing: 12) {
                TextField("https://mealie.exemple.com", text: $model.serverDraft)
                    .textFieldStyle(.plain)
                    .font(.system(size: 15))
                    .padding(.horizontal, 14)
                    .padding(.vertical, 11)
                    .background(
                        RoundedRectangle(cornerRadius: 10, style: .continuous)
                            .fill(Color(nsColor: .textBackgroundColor))
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: 10, style: .continuous)
                            .stroke(model.serverError == nil ? Color.secondary.opacity(0.3) : Color.red.opacity(0.7))
                    )
                    .focused($focused)
                    .onSubmit(model.submitServer)
                    .accessibilityIdentifier("server-url")

                if let error = model.serverError {
                    Text(error)
                        .font(.callout)
                        .foregroundStyle(.red)
                }

                Button(model.t("common.continue"), action: model.submitServer)
                    .buttonStyle(PrimaryButtonStyle())
                    .keyboardShortcut(.defaultAction)

                Button(model.t("server.viaSafari"), action: model.handOffToSafari)
                    .buttonStyle(.link)
                    .font(.callout)
                    .accessibilityIdentifier("server-via-safari")
            }
            .frame(maxWidth: 400)

            if !model.groupAvailable {
                WarningBanner(message: model.t("error.group"))
                    .frame(maxWidth: 460)
            }
        }
        .onAppear { focused = true }
    }
}

struct LoginStep: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 12) {
                Button {
                    model.backToServer()
                } label: {
                    Label(model.t("common.back"), systemImage: "chevron.left")
                }
                .buttonStyle(.plain)
                .foregroundStyle(.secondary)

                Divider().frame(height: 18)

                VStack(alignment: .leading, spacing: 1) {
                    Text(model.t("login.title")).font(.headline)
                    Text(model.loginError ?? model.t("login.hint"))
                        .font(.caption)
                        .foregroundStyle(model.loginError == nil ? Color.secondary : Color.red)
                        .lineLimit(2)
                }

                Spacer()

                if model.loginError == nil {
                    HStack(spacing: 7) {
                        ProgressView().controlSize(.small)
                        Text(model.loginStatus)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            }
            .padding(.horizontal, 18)
            .padding(.vertical, 12)
            .background(.bar)

            Divider()

            LoginWebView(baseUrl: model.config.mealieUrl) { outcome in
                model.handle(outcome: outcome)
            }
        }
    }
}

/// L'app ne voit rien de ce qui se passe dans Safari : elle guette le conteneur
/// partagé, que l'extension remplira une fois la clé créée.
struct SafariHandoffStep: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        OnboardingShell(title: model.t("handoff.title"), subtitle: model.t("handoff.subtitle")) {
            HStack(spacing: 8) {
                ProgressView().controlSize(.small)
                Text(model.t("handoff.waiting"))
                    .font(.callout)
                    .foregroundStyle(.secondary)
            }

            if model.extensionEnabled != true {
                WarningBanner(message: model.t("handoff.needExtension"))
                    .frame(maxWidth: 460)

                Button(model.t("extension.open"), action: model.openSafariSettings)
                    .buttonStyle(PrimaryButtonStyle())
            }

            HStack(spacing: 18) {
                Button(model.t("handoff.reopen"), action: model.openMealieInSafari)
                    .buttonStyle(.link)
                Button(model.t("handoff.back"), action: model.backToServer)
                    .buttonStyle(.link)
            }
            .font(.callout)
        }
    }
}

struct SuccessStep: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        OnboardingShell(title: model.t("success.title"), subtitle: model.t("success.subtitle")) {
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 40))
                .foregroundStyle(Brand.deep)

            Button(model.t("success.continue"), action: model.enterDashboard)
                .buttonStyle(PrimaryButtonStyle())
                .keyboardShortcut(.defaultAction)

            if !model.groupAvailable {
                WarningBanner(message: model.t("error.group"))
                    .frame(maxWidth: 460)
            }
        }
    }
}

struct WarningBanner: View {
    let message: String

    var body: some View {
        HStack(alignment: .top, spacing: 9) {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundStyle(.orange)
            Text(message)
                .font(.callout)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 9, style: .continuous)
                .fill(Color.orange.opacity(0.12))
        )
    }
}

struct PrimaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 14, weight: .medium))
            .foregroundStyle(.white)
            .padding(.horizontal, 22)
            .padding(.vertical, 10)
            .background(
                RoundedRectangle(cornerRadius: 9, style: .continuous)
                    .fill(Brand.accent.opacity(configuration.isPressed ? 0.78 : 1))
            )
            .contentShape(Rectangle())
    }
}

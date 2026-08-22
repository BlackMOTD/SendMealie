//
//  DashboardView.swift
//  SendMealie
//

import SwiftUI

struct DashboardView: View {
    @EnvironmentObject private var model: AppModel

    private let columns = [GridItem(.adaptive(minimum: 168, maximum: 260), spacing: 16)]

    var body: some View {
        VStack(spacing: 0) {
            header
            Divider()

            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    if let error = model.dashboardError {
                        WarningBanner(message: error)
                    }
                    if !model.groupAvailable {
                        WarningBanner(message: model.t("error.group"))
                    }

                    statistics

                    Text(model.t("dashboard.latest"))
                        .font(.system(size: 15, weight: .semibold))

                    if model.recipes.isEmpty {
                        Text(model.t("dashboard.empty"))
                            .foregroundStyle(.secondary)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.vertical, 30)
                    } else {
                        LazyVGrid(columns: columns, spacing: 16) {
                            ForEach(model.recipes) { recipe in
                                RecipeCard(recipe: recipe)
                            }
                        }
                    }
                }
                .padding(24)
            }
        }
        .sheet(isPresented: $model.showsSettings) { SettingsSheet() }
    }

    private var header: some View {
        HStack(spacing: 13) {
            Image("LargeIcon")
                .resizable()
                .interpolation(.high)
                .frame(width: 38, height: 38)
                .clipShape(RoundedRectangle(cornerRadius: 9, style: .continuous))

            VStack(alignment: .leading, spacing: 1) {
                Text(model.account?.name.capitalized ?? "SendMealie")
                    .font(.system(size: 14, weight: .semibold))
                Text(model.config.host)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Spacer()

            extensionPill

            Button {
                Task { await model.refresh() }
            } label: {
                Image(systemName: "arrow.clockwise")
            }
            .help(model.t("common.refresh"))
            .disabled(model.isRefreshing)

            Button {
                if let url = model.instanceURL { NSWorkspace.shared.open(url) }
            } label: {
                Image(systemName: "arrow.up.forward.square")
            }
            .help(model.t("dashboard.openMealie"))

            Button {
                model.showsSettings = true
            } label: {
                Image(systemName: "gearshape")
            }
            .help(model.t("settings.title"))
        }
        .buttonStyle(.borderless)
        .padding(.horizontal, 18)
        .padding(.vertical, 12)
        .background(.bar)
    }

    /// L'app peut être parfaitement configurée et l'extension rester éteinte
    /// dans Safari : c'est la panne la plus fréquente, elle mérite d'être en
    /// haut de l'écran plutôt qu'enfouie dans les réglages.
    private var extensionPill: some View {
        let enabled = model.extensionEnabled
        let label = enabled == nil
            ? model.t("extension.unknown")
            : (enabled == true ? model.t("extension.enabled") : model.t("extension.disabled"))

        return Button(action: model.openSafariSettings) {
            HStack(spacing: 6) {
                Circle()
                    .fill(enabled == true ? Brand.deep : (enabled == nil ? Color.secondary : Color.orange))
                    .frame(width: 7, height: 7)
                Text(label).font(.caption)
                // Rien n'indiquait que la pastille menait quelque part.
                if enabled != true {
                    Image(systemName: "chevron.right")
                        .font(.system(size: 8, weight: .semibold))
                        .foregroundStyle(.secondary)
                }
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .background(Capsule().fill(Color.secondary.opacity(0.12)))
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .onHover { inside in
            if inside { NSCursor.pointingHand.push() } else { NSCursor.pop() }
        }
        .help(model.extensionStateError.map { "\(model.t("extension.unknownHint"))\n\n\($0)" } ?? model.t("extension.open"))
    }

    private var statistics: some View {
        let recent = model.recentCount

        return HStack(spacing: 14) {
            StatTile(
                value: model.totalRecipes.map(String.init) ?? "—",
                label: model.t("dashboard.total"),
                symbol: "book.closed"
            )
            StatTile(
                value: recent.capped ? "\(recent.value)+" : String(recent.value),
                label: model.t("dashboard.recent"),
                symbol: "sparkles"
            )
            StatTile(
                value: String(model.distinctTags),
                label: model.t("dashboard.tags"),
                symbol: "tag"
            )
        }
    }
}

private struct StatTile: View {
    let value: String
    let label: String
    let symbol: String

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: symbol)
                .font(.system(size: 17))
                .foregroundStyle(Brand.accent)
                .frame(width: 26)

            VStack(alignment: .leading, spacing: 0) {
                Text(value).font(.system(size: 21, weight: .semibold))
                Text(label).font(.caption).foregroundStyle(.secondary)
            }
            Spacer(minLength: 0)
        }
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: 11, style: .continuous)
                .fill(Color.secondary.opacity(0.08))
        )
    }
}

private struct RecipeCard: View {
    @EnvironmentObject private var model: AppModel
    let recipe: MealieRecipe

    var body: some View {
        Button {
            if let url = model.url(for: recipe) { NSWorkspace.shared.open(url) }
        } label: {
            VStack(alignment: .leading, spacing: 0) {
                RecipeThumbnail(recipeId: recipe.id, client: model.client, height: 112)

                VStack(alignment: .leading, spacing: 4) {
                    Text(recipe.name)
                        .font(.system(size: 13, weight: .medium))
                        .lineLimit(2, reservesSpace: true)
                        .multilineTextAlignment(.leading)

                    HStack(spacing: 6) {
                        if let rating = recipe.rating, rating > 0 {
                            Label(String(format: "%.0f", rating), systemImage: "star.fill")
                                .labelStyle(.titleAndIcon)
                        }
                        if let first = recipe.tags.first {
                            Text(first).lineLimit(1)
                        }
                        Spacer(minLength: 0)
                    }
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                }
                .padding(10)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .background(
                RoundedRectangle(cornerRadius: 11, style: .continuous)
                    .fill(Color(nsColor: .controlBackgroundColor))
            )
            .clipShape(RoundedRectangle(cornerRadius: 11, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 11, style: .continuous)
                    .stroke(Color.secondary.opacity(0.18))
            )
        }
        .buttonStyle(.plain)
        .help(recipe.summary.isEmpty ? recipe.name : recipe.summary)
    }
}

private struct SettingsSheet: View {
    @EnvironmentObject private var model: AppModel
    @State private var armed = false
    @State private var notice: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            Text(model.t("settings.title")).font(.system(size: 17, weight: .semibold))

            VStack(alignment: .leading, spacing: 7) {
                Text(model.t("settings.language")).font(.callout).foregroundStyle(.secondary)
                Picker("", selection: Binding(get: { model.language }, set: model.setLanguage)) {
                    Text("Français").tag(AppLanguage.french)
                    Text("English").tag(AppLanguage.english)
                    Text(model.t("language.system")).tag(AppLanguage.system)
                }
                .pickerStyle(.segmented)
                .labelsHidden()
            }

            VStack(alignment: .leading, spacing: 7) {
                Text(model.t("settings.instance")).font(.callout).foregroundStyle(.secondary)
                Text(model.config.mealieUrl)
                    .font(.system(size: 12, design: .monospaced))
                    .textSelection(.enabled)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 7)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(
                        RoundedRectangle(cornerRadius: 8, style: .continuous)
                            .fill(Color.secondary.opacity(0.1))
                    )
            }

            if let notice {
                WarningBanner(message: notice)
            }

            Text(model.t("settings.disconnectHint"))
                .font(.caption)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)

            Divider()

            // La version et les liens vivaient dans le popup, qui n'a plus
            // d'écran de réglages : ils reviennent ici, avec le reste.
            HStack(spacing: 14) {
                Text("\(model.t("settings.version")) \(model.appVersion)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Spacer()
                Link(model.t("settings.repo"), destination: Links.repository)
                Link(model.t("settings.web"), destination: Links.website)
            }
            .font(.callout)

            HStack {
                Button(armed ? model.t("settings.disconnectArmed") : model.t("settings.disconnect"), role: .destructive) {
                    guard armed else {
                        armed = true
                        return
                    }
                    Task {
                        let revoked = await model.disconnect()
                        if !revoked { notice = model.t("error.revoke") }
                    }
                }
                Spacer()
                Button(model.t("common.close")) { model.showsSettings = false }
                    .keyboardShortcut(.cancelAction)
            }
        }
        .padding(22)
        .frame(width: 400)
    }
}

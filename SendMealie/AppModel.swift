//
//  AppModel.swift
//  SendMealie
//

import Foundation
import SwiftUI

@MainActor
final class AppModel: ObservableObject {
    enum Stage: Equatable {
        case loading
        case language
        case server
        case login
        case safariHandoff
        case success
        case dashboard
    }

    @Published private(set) var stage: Stage = .loading
    @Published private(set) var config = SharedConfig()
    @Published private(set) var groupAvailable = true

    @Published var serverDraft = ""
    @Published var serverError: String?
    @Published var loginStatus: String = ""
    @Published var loginError: String?

    @Published private(set) var account: MealieAccount?
    @Published private(set) var recipes: [MealieRecipe] = []
    @Published private(set) var totalRecipes: Int?
    @Published private(set) var isRefreshing = false
    @Published var dashboardError: String?

    @Published private(set) var extensionEnabled: Bool?
    /// Pourquoi Safari n'a pas su répondre. Presque toujours la même cause :
    /// l'app n'est pas là où Safari a enregistré l'extension.
    @Published private(set) var extensionStateError: String?
    @Published var showsSettings = false

    private var handoffPoll: Task<Void, Never>?

    var language: AppLanguage { AppLanguage(rawValue: config.language) ?? .system }
    func t(_ key: String, _ vars: [String: String] = [:]) -> String { AppStrings.value(key, language, vars) }

    var client: MealieClient? {
        config.isConfigured ? MealieClient(baseUrl: config.mealieUrl, token: config.token) : nil
    }

    // MARK: - Démarrage

    /// La roue de chargement n'est pas décorative : elle couvre la lecture du
    /// conteneur partagé et l'interrogation de Safari sur l'état de l'extension.
    func bootstrap() async {
        groupAvailable = SharedStore.isAvailable
        config = SharedStore.load()
        serverDraft = config.mealieUrl

        async let extensionState: Void = refreshExtensionState()
        async let minimumSpin: Void = pause(seconds: 0.8)
        _ = await (extensionState, minimumSpin)

        if config.isConfigured {
            stage = .dashboard
            await refresh()
        } else if config.language.isEmpty {
            stage = .language
        } else {
            stage = .server
        }
    }

    private func pause(seconds: Double) async {
        try? await Task.sleep(nanoseconds: UInt64(seconds * 1_000_000_000))
    }

    // MARK: - Étapes

    func choose(language: AppLanguage) {
        config.language = language.rawValue
        persist()
        stage = config.isConfigured ? .dashboard : .server
    }

    func submitServer() {
        guard let url = validatedServer() else { return }

        serverError = nil
        loginError = nil
        loginStatus = t("login.waiting")
        config.mealieUrl = url
        serverDraft = url
        stage = .login
    }

    private func validatedServer() -> String? {
        let trimmed = serverDraft.trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: "/+$", with: "", options: .regularExpression)

        guard trimmed.range(of: "^https?://.+", options: .regularExpression) != nil else {
            serverError = t("server.invalid")
            return nil
        }
        return trimmed
    }

    func handle(outcome: LoginOutcome) {
        switch outcome {
        case .anonymous:
            // Une réponse propre après un incident passager : l'alerte n'a plus lieu d'être.
            loginError = nil
            loginStatus = t("login.waiting")
        case .unreachable:
            loginError = t("login.unreachable")
        case .stalled(let detail):
            loginError = t("login.script", ["detail": detail])
        case .timedOut:
            loginError = t("login.timeout")
        case .missingScript:
            loginError = t("login.missingScript")
        case .noKey:
            loginError = t("login.noKey")
        case .keyRefused(let status, let detail):
            loginError = t("login.keyRefused", ["status": String(status), "detail": detail])
        case .granted(let token):
            loginError = nil
            loginStatus = t("login.creating")
            config.token = token.value
            config.tokenId = token.id
            persist()
            stage = .success
            Task { await refresh() }
        }
    }

    func backToServer() {
        loginError = nil
        stopHandoff()
        stage = .server
    }

    // MARK: - Connexion depuis Safari

    /// Parcours alternatif : la connexion se fait dans Safari, pas ici. L'app ne
    /// peut pas observer cette session — le bac à sable lui interdit les cookies
    /// de Safari — mais l'extension le peut, et dépose la clé dans le conteneur
    /// partagé. On se contente donc de guetter ce conteneur.
    func handOffToSafari() {
        guard let url = validatedServer() else { return }

        serverError = nil
        loginError = nil
        config.mealieUrl = url
        serverDraft = url
        // L'extension n'a plus d'écran à elle : c'est cette demande horodatée
        // qui lui dit de surveiller la page Mealie et d'en tirer la clé.
        config.connectRequestedAt = Date().timeIntervalSince1970 * 1000
        persist()

        SafariLink.open(url + "/login")
        stage = .safariHandoff
        startHandoffPolling()
    }

    func openMealieInSafari() {
        SafariLink.open(config.mealieUrl + "/login")
    }

    private func startHandoffPolling() {
        handoffPoll?.cancel()
        handoffPoll = Task { @MainActor in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 2_000_000_000)
                guard !Task.isCancelled else { return }

                await refreshExtensionState()

                let shared = SharedStore.reload()
                guard shared.isConfigured else { continue }

                config = shared
                stage = .success
                stopHandoff()
                await refresh()
                return
            }
        }
    }

    private func stopHandoff() {
        handoffPoll?.cancel()
        handoffPoll = nil
    }

    func enterDashboard() {
        stopHandoff()
        stage = .dashboard
    }

    // MARK: - Tableau de bord

    func refresh() async {
        guard let client else { return }
        isRefreshing = true
        defer { isRefreshing = false }

        do {
            async let profile = client.account()
            async let listing = client.recipes()
            let (fetchedAccount, fetchedRecipes) = try await (profile, listing)

            account = fetchedAccount
            recipes = fetchedRecipes.items
            totalRecipes = fetchedRecipes.total ?? fetchedRecipes.items.count
            dashboardError = nil
        } catch {
            dashboardError = error.localizedDescription
        }

        await refreshExtensionState()
    }

    /// Recettes ajoutées dans les 30 derniers jours, parmi celles qu'on a
    /// chargées. Le compteur est donc plafonné par la taille de la page.
    var recentCount: (value: Int, capped: Bool) {
        let cutoff = Date().addingTimeInterval(-30 * 86400)
        let count = recipes.filter { ($0.dateAdded ?? .distantPast) >= cutoff }.count
        return (count, count == recipes.count && !recipes.isEmpty)
    }

    var distinctTags: Int {
        Set(recipes.flatMap(\.tags)).count
    }

    func url(for recipe: MealieRecipe) -> URL? {
        client?.recipeURL(slug: recipe.slug)
    }

    var instanceURL: URL? { URL(string: config.mealieUrl) }

    var appVersion: String {
        Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "—"
    }

    // MARK: - Extension Safari

    var extensionIdentifier: String { SafariLink.extensionIdentifier }

    func refreshExtensionState() async {
        do {
            extensionEnabled = try await SafariLink.extensionIsEnabled()
            extensionStateError = nil
        } catch {
            extensionEnabled = nil
            extensionStateError = "\(SafariLink.extensionIdentifier) — \(error.localizedDescription)"
        }
    }

    func openSafariSettings() {
        SafariLink.showExtensionSettings()
    }

    /// L'extension n'a plus d'écran de réglages : son bouton nous appelle, par
    /// le schéma `sendmealie://` que Safari confie à LaunchServices.
    func handle(url: URL) {
        NSApp.activate()

        let route = url.host ?? url.path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        guard route == "settings" else { return }

        // Les réglages n'ont de sens qu'une fois connecté ; sinon l'onboarding
        // est déjà ce que l'utilisateur venait chercher.
        if stage == .dashboard { showsSettings = true }
    }

    // MARK: - Réglages

    func setLanguage(_ language: AppLanguage) {
        config.language = language.rawValue
        persist()
    }

    /// Révoque d'abord, efface ensuite : une fois la clé perdue, plus rien ne
    /// permet de s'authentifier pour la supprimer.
    func disconnect() async -> Bool {
        let revoked = await client?.revokeToken(id: config.tokenId) ?? false

        config = SharedConfig(dictionary: ["language": config.language])
        SharedStore.clear()
        persist()

        account = nil
        recipes = []
        totalRecipes = nil
        dashboardError = nil
        serverDraft = ""
        showsSettings = false
        stage = .server
        return revoked
    }

    private func persist() {
        SharedStore.save(config)
        groupAvailable = SharedStore.isAvailable
        config = SharedStore.load()
    }
}

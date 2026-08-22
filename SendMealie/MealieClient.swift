//
//  MealieClient.swift
//  SendMealie
//

import Foundation

struct MealieAccount: Equatable {
    var name: String
    var email: String
}

struct MealieRecipe: Identifiable, Hashable {
    let id: String
    let name: String
    let slug: String
    let summary: String
    let rating: Double?
    let dateAdded: Date?
    let tags: [String]
}

enum MealieError: LocalizedError {
    case badResponse(Int)
    case transport(String)
    case malformed

    var errorDescription: String? {
        switch self {
        case .badResponse(let code) where code == 401 || code == 403:
            return "Clé refusée par Mealie (\(code))."
        case .badResponse(let code):
            return "Mealie a répondu \(code)."
        case .transport(let detail):
            return detail
        case .malformed:
            return "Réponse illisible de Mealie."
        }
    }
}

/// Lecture seule sur l'instance de l'utilisateur, avec la clé « SendMealie ».
///
/// Le décodage passe par `JSONSerialization` plutôt que `Codable` : les champs
/// de Mealie changent de type d'une version à l'autre (`rating` entier ou
/// flottant, `tags` absent ou nul), et un `Codable` strict ferait échouer tout
/// l'écran pour une clé inattendue.
struct MealieClient {
    let baseUrl: String
    let token: String

    private var root: String { baseUrl.replacingOccurrences(of: "/+$", with: "", options: .regularExpression) }

    private func get(_ path: String) async throws -> Any {
        guard let url = URL(string: root + path) else { throw MealieError.malformed }
        var request = URLRequest(url: url)
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.timeoutInterval = 20

        let (data, response): (Data, URLResponse)
        do {
            (data, response) = try await URLSession.shared.data(for: request)
        } catch {
            throw MealieError.transport(error.localizedDescription)
        }

        let code = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(code) else { throw MealieError.badResponse(code) }
        guard let json = try? JSONSerialization.jsonObject(with: data) else { throw MealieError.malformed }
        return json
    }

    func account() async throws -> MealieAccount {
        guard let me = try await get("/api/users/self") as? [String: Any] else { throw MealieError.malformed }
        let name = (me["username"] as? String)
            ?? (me["fullName"] as? String)
            ?? (me["email"] as? String)
            ?? ""
        return MealieAccount(name: name, email: me["email"] as? String ?? "")
    }

    func recipes(limit: Int = 30) async throws -> (items: [MealieRecipe], total: Int?) {
        // Le nom de colonne accepté par `orderBy` a bougé entre les versions de
        // Mealie ; un tri refusé renvoie 4xx et emporterait tout l'écran. On
        // retombe alors sur l'ordre par défaut et on trie nous-mêmes.
        var payload: Any
        do {
            payload = try await get("/api/recipes?page=1&perPage=\(limit)&orderBy=created_at&orderDirection=desc")
        } catch MealieError.badResponse(let code) where (400..<500).contains(code) && code != 401 && code != 403 {
            payload = try await get("/api/recipes?page=1&perPage=\(limit)")
        }

        guard let root = payload as? [String: Any] else { throw MealieError.malformed }
        let raw = root["items"] as? [[String: Any]] ?? []
        let total = (root["total"] as? Int) ?? (root["total_items"] as? Int)

        let items = raw.compactMap(Self.recipe(from:))
            .sorted { ($0.dateAdded ?? .distantPast) > ($1.dateAdded ?? .distantPast) }
        return (items, total)
    }

    /// Les vignettes passent par la même clé que le reste : selon la version et
    /// la visibilité du groupe, `/api/media` peut exiger l'en-tête.
    func imageData(recipeId: String) async throws -> Data {
        guard let url = URL(string: "\(root)/api/media/recipes/\(recipeId)/images/min-original.webp") else {
            throw MealieError.malformed
        }
        var request = URLRequest(url: url)
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.timeoutInterval = 20

        let (data, response) = try await URLSession.shared.data(for: request)
        let code = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(code) else { throw MealieError.badResponse(code) }
        return data
    }

    func recipeURL(slug: String) -> URL? { URL(string: "\(root)/g/home/r/\(slug)") }

    /// Retire la clé « SendMealie » du profil. Même stratégie que l'extension :
    /// l'identifiant retenu à la création, sinon la recherche par nom.
    func revokeToken(id: Int?) async -> Bool {
        func delete(_ tokenId: Int) async -> Int {
            guard let url = URL(string: "\(root)/api/users/api-tokens/\(tokenId)") else { return 0 }
            var request = URLRequest(url: url)
            request.httpMethod = "DELETE"
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            let response = try? await URLSession.shared.data(for: request)
            return (response?.1 as? HTTPURLResponse)?.statusCode ?? 0
        }

        if let id {
            let status = await delete(id)
            if (200..<300).contains(status) { return true }
            if status != 404 { return false }
        }

        guard let me = try? await get("/api/users/self") as? [String: Any],
              let tokens = me["tokens"] as? [[String: Any]]
        else { return false }

        let ids = tokens.filter { $0["name"] as? String == "SendMealie" }.compactMap { $0["id"] as? Int }
        guard !ids.isEmpty else { return false }

        for tokenId in ids {
            guard (200..<300).contains(await delete(tokenId)) else { return false }
        }
        return true
    }

    private static func recipe(from raw: [String: Any]) -> MealieRecipe? {
        guard let id = raw["id"] as? String, let name = raw["name"] as? String else { return nil }
        let tags = (raw["tags"] as? [[String: Any]] ?? []).compactMap { $0["name"] as? String }

        var rating: Double?
        if let number = raw["rating"] as? Double { rating = number }
        else if let number = raw["rating"] as? Int { rating = Double(number) }

        return MealieRecipe(
            id: id,
            name: name,
            slug: raw["slug"] as? String ?? id,
            summary: raw["description"] as? String ?? "",
            rating: rating,
            dateAdded: date(from: raw["dateAdded"] ?? raw["createdAt"]),
            tags: tags
        )
    }

    /// `dateAdded` est une date seule, `createdAt` un horodatage ISO — parfois
    /// avec fraction de seconde, parfois sans.
    private static func date(from value: Any?) -> Date? {
        guard let text = value as? String else { return nil }

        if text.count == 10 {
            let formatter = DateFormatter()
            formatter.calendar = Calendar(identifier: .iso8601)
            formatter.locale = Locale(identifier: "en_US_POSIX")
            formatter.dateFormat = "yyyy-MM-dd"
            return formatter.date(from: text)
        }

        let parser = ISO8601DateFormatter()
        parser.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let parsed = parser.date(from: text) { return parsed }
        parser.formatOptions = [.withInternetDateTime]
        return parser.date(from: text)
    }
}

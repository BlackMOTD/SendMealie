//
//  SharedConfig.swift
//  Partagé par SendMealie et SendMealie Extension.
//

import Foundation
import Security

/// Réglages communs à l'app et à l'extension.
///
/// Les deux sont sandboxées et ne partagent rien par défaut. Le conteneur App
/// Group est le seul terrain commun : l'app y écrit, l'extension le lit à
/// travers `browser.runtime.sendNativeMessage()`, qui réveille
/// `SafariWebExtensionHandler` — le seul pont que Safari expose entre du
/// JavaScript d'extension et du code natif.
struct SharedConfig: Equatable {
    var mealieUrl = ""
    var token = ""
    var tokenId: Int?
    /// « fr », « en », ou vide tant que l'utilisateur n'a pas choisi.
    var language = ""
    /// Millisecondes epoch. Départage l'app et l'extension quand les deux écrivent.
    var updatedAt: Double = 0
    /// Millisecondes epoch. Posée par l'app quand elle envoie l'utilisateur
    /// s'identifier dans Safari : l'extension y voit l'ordre de surveiller la
    /// page Mealie et de créer la clé. Remise à zéro une fois la clé obtenue.
    var connectRequestedAt: Double = 0

    var isConfigured: Bool { !mealieUrl.isEmpty && !token.isEmpty }

    var host: String {
        guard let url = URL(string: mealieUrl), let host = url.host else { return mealieUrl }
        return host
    }
}

extension SharedConfig {
    /// Représentation traversant le pont natif, telle que la lit `background.js`,
    /// et telle qu'elle est stockée dans le conteneur partagé.
    ///
    /// Une clé absente plutôt qu'un `NSNull` : ce dernier traverse très bien le
    /// pont vers JavaScript, mais `UserDefaults` n'accepte que des objets
    /// property-list et lève `NSInvalidArgumentException` à l'insertion.
    /// Côté JavaScript, `undefined` et `null` se lisent pareil (`?? null`).
    var dictionary: [String: Any] {
        var payload: [String: Any] = [
            "mealieUrl": mealieUrl,
            "token": token,
            "language": language,
            "updatedAt": updatedAt,
            "connectRequestedAt": connectRequestedAt
        ]
        if let tokenId { payload["tokenId"] = tokenId }
        return payload
    }

    init(dictionary: [String: Any]) {
        mealieUrl = dictionary["mealieUrl"] as? String ?? ""
        token = dictionary["token"] as? String ?? ""
        language = dictionary["language"] as? String ?? ""
        updatedAt = dictionary["updatedAt"] as? Double ?? 0
        connectRequestedAt = dictionary["connectRequestedAt"] as? Double ?? 0

        // Mealie type `id` en entier, mais un jeton relu depuis le stockage de
        // l'extension peut revenir en chaîne. Les deux formes sont acceptées.
        if let number = dictionary["tokenId"] as? Int {
            tokenId = number
        } else if let text = dictionary["tokenId"] as? String {
            tokenId = Int(text)
        } else {
            tokenId = nil
        }
    }
}

/// Ce que le pont sait faire d'un magasin de réglages. L'abstraction n'existe
/// que pour que le protocole natif soit testable sans écrire dans le conteneur
/// partagé réel — celui de l'utilisateur, avec sa vraie clé dedans.
protocol SharedConfigStore {
    var isAvailable: Bool { get }
    func load() -> SharedConfig
    /// Horodate à l'instant de l'écriture.
    func save(_ config: SharedConfig)
    /// Écrit tel quel : réservé aux réglages venant de l'extension, qui portent
    /// déjà leur propre horodatage.
    func saveVerbatim(_ config: SharedConfig)
    func clear()
}

struct AppGroupStore: SharedConfigStore {
    /// Suffixe fixe du groupe ; le préfixe est l'identifiant d'équipe, qui change
    /// à chaque fork. On le relit donc dans nos propres entitlements plutôt que
    /// de le figer ici.
    static let groupSuffix = "group.fr.warneford.sendmealie"
    private static let configKey = "config"

    /// Trois sources, de la plus fiable à la plus désespérée. La première est
    /// écrite à la compilation dans l'Info.plist des deux cibles ; la deuxième
    /// relit les entitlements du processus, ce qui marche dans l'app mais n'est
    /// garanti nulle part ; la dernière ne peut que rater, et c'est voulu —
    /// mieux vaut un conteneur introuvable qu'un conteneur silencieusement vide.
    static let groupIdentifier: String = {
        if let declared = Bundle.main.object(forInfoDictionaryKey: "SMAppGroupIdentifier") as? String,
           declared.hasSuffix(groupSuffix), declared != groupSuffix {
            return declared
        }

        if let task = SecTaskCreateFromSelf(nil),
           let entitlement = SecTaskCopyValueForEntitlement(
             task, "com.apple.security.application-groups" as CFString, nil
           ) as? [String],
           let match = entitlement.first(where: { $0.hasSuffix(groupSuffix) }) {
            return match
        }

        return groupSuffix
    }()

    /// `true` quand l'identifiant porte bien un préfixe d'équipe. Sans lui,
    /// `UserDefaults` ouvre une suite parfaitement valide qui n'est reliée à
    /// rien : la panne la plus difficile à voir.
    static var groupIsResolved: Bool { groupIdentifier != groupSuffix }

    private var defaults: UserDefaults? {
        UserDefaults(suiteName: Self.groupIdentifier)
    }

    /// `false` quand le conteneur partagé est hors d'atteinte — capability App
    /// Groups absente de la signature, typiquement. L'app doit le signaler
    /// plutôt que d'enregistrer dans le vide.
    var isAvailable: Bool { defaults != nil && Self.groupIsResolved }

    /// L'app et l'extension sont deux processus, et `UserDefaults` sert
    /// volontiers une copie en cache. Toute lecture resynchronise donc d'abord,
    /// sans quoi chacun peut ignorer ce que l'autre vient d'écrire.
    func load() -> SharedConfig {
        CFPreferencesAppSynchronize(Self.groupIdentifier as CFString)
        guard let stored = defaults?.dictionary(forKey: Self.configKey) else { return SharedConfig() }
        return SharedConfig(dictionary: stored)
    }

    func reload() -> SharedConfig { load() }

    func save(_ config: SharedConfig) {
        var updated = config
        updated.updatedAt = Date().timeIntervalSince1970 * 1000
        defaults?.set(updated.dictionary, forKey: Self.configKey)
    }

    func saveVerbatim(_ config: SharedConfig) {
        defaults?.set(config.dictionary, forKey: Self.configKey)
    }

    func clear() {
        defaults?.removeObject(forKey: Self.configKey)
    }
}

/// Façade conservée pour l'app, qui n'a qu'un seul magasin possible.
enum SharedStore {
    static let group = AppGroupStore()

    static var groupIdentifier: String { AppGroupStore.groupIdentifier }
    static var isAvailable: Bool { group.isAvailable }
    static func load() -> SharedConfig { group.load() }
    static func reload() -> SharedConfig { group.reload() }
    static func save(_ config: SharedConfig) { group.save(config) }
    static func saveVerbatim(_ config: SharedConfig) { group.saveVerbatim(config) }
    static func clear() { group.clear() }
}

/// Le protocole que parle `browser.runtime.sendNativeMessage()`.
///
/// Vit ici plutôt que dans `SafariWebExtensionHandler` pour être exercé par les
/// tests : Safari transporte le message, mais c'est ce code qui décide quoi en
/// faire, et c'est le seul chemin par lequel l'extension écrit dans le
/// conteneur partagé.
struct SharedBridge {
    let store: SharedConfigStore

    func handle(message: [String: Any]?) -> [String: Any] {
        guard store.isAvailable else {
            return [
                "ok": false,
                "error": "Conteneur partagé inaccessible (App Group absent de la signature).",
                "available": false,
                "group": AppGroupStore.groupIdentifier
            ]
        }

        switch message?["type"] as? String {
        case "get-config":
            return [
                "ok": true,
                "available": true,
                "group": AppGroupStore.groupIdentifier,
                "config": store.load().dictionary
            ]

        case "set-config":
            guard let raw = message?["config"] as? [String: Any] else {
                return ["ok": false, "error": "Réglages manquants."]
            }
            // L'extension horodate elle-même : c'est ce qui permet à l'app de
            // savoir laquelle des deux copies est la plus récente.
            store.saveVerbatim(SharedConfig(dictionary: raw))
            return ["ok": true, "available": true]

        case "clear-config":
            store.clear()
            return ["ok": true, "available": true]

        default:
            return ["ok": false, "error": "Message natif inconnu."]
        }
    }
}

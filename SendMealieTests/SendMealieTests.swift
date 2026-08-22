//
//  SendMealieTests.swift
//  SendMealieTests
//
//  Created by Bastien on 20/08/2026.
//

import Foundation
import Testing
@testable import SendMealie

/// Le conteneur partagé n'accepte que des objets property-list. Un `NSNull`
/// glissé dans le dictionnaire faisait lever `NSInvalidArgumentException` à
/// `UserDefaults` dès le premier enregistrement — au choix de la langue, donc
/// avant même que quoi que ce soit soit configuré.
struct SharedConfigTests {

    private func isPropertyList(_ config: SharedConfig) -> Bool {
        PropertyListSerialization.propertyList(config.dictionary, isValidFor: .binary)
    }

    @Test func vierge_estStockableTelQuel() {
        #expect(isPropertyList(SharedConfig()))
    }

    @Test func langueSeule_estStockable() {
        var config = SharedConfig()
        config.language = "fr"
        config.updatedAt = Date().timeIntervalSince1970 * 1000
        #expect(isPropertyList(config))
        #expect(config.dictionary["tokenId"] == nil)
    }

    @Test func configuree_estStockableEtConserveLaCle() {
        var config = SharedConfig()
        config.mealieUrl = "https://mealie.exemple.com"
        config.token = "abc.def.ghi"
        config.tokenId = 42
        #expect(isPropertyList(config))
        #expect(SharedConfig(dictionary: config.dictionary) == config)
    }

    /// `background.js` envoie `tokenId: null` quand il n'y a pas de clé : le
    /// `NSNull` correspondant doit être neutralisé avant tout stockage.
    @Test func nsnullVenantDuPont_estNeutralise() {
        let fromJavaScript: [String: Any] = [
            "mealieUrl": "https://mealie.exemple.com",
            "token": "",
            "language": "en",
            "tokenId": NSNull(),
            "updatedAt": 1_787_308_269_764.128
        ]
        let config = SharedConfig(dictionary: fromJavaScript)
        #expect(config.tokenId == nil)
        #expect(isPropertyList(config))
    }

    /// L'identifiant du groupe doit porter le préfixe d'équipe. Sans lui,
    /// `UserDefaults(suiteName:)` ouvre une suite parfaitement valide mais
    /// reliée à rien : l'app enregistre, l'extension lit du vide, et personne
    /// ne voit d'erreur.
    @Test func identifiantDeGroupe_porteLePrefixeDEquipe() {
        #expect(AppGroupStore.groupIdentifier.hasSuffix("group.fr.warneford.sendmealie"))
        #expect(AppGroupStore.groupIsResolved, "identifiant sans préfixe d'équipe : \(AppGroupStore.groupIdentifier)")
        #expect(AppGroupStore().isAvailable)
    }

    /// Mealie type `id` en entier, mais un jeton relu depuis le stockage de
    /// l'extension peut revenir en chaîne.
    @Test func tokenIdEnChaine_estRelu() {
        #expect(SharedConfig(dictionary: ["tokenId": "7"]).tokenId == 7)
        #expect(SharedConfig(dictionary: ["tokenId": "pas un nombre"]).tokenId == nil)
    }
}

/// Magasin en mémoire : les tests du pont ne doivent surtout pas écrire dans le
/// conteneur App Group réel, qui contient la vraie clé de l'utilisateur.
private final class MemoryStore: SharedConfigStore {
    var isAvailable = true
    private(set) var stored: [String: Any]?

    func load() -> SharedConfig {
        stored.map(SharedConfig.init(dictionary:)) ?? SharedConfig()
    }

    func save(_ config: SharedConfig) {
        var stamped = config
        stamped.updatedAt = Date().timeIntervalSince1970 * 1000
        stored = stamped.dictionary
    }

    func saveVerbatim(_ config: SharedConfig) {
        stored = config.dictionary
    }

    func clear() {
        stored = nil
    }

    /// Ce qu'`UserDefaults` accepterait réellement.
    var storedIsPropertyList: Bool {
        guard let stored else { return true }
        return PropertyListSerialization.propertyList(stored, isValidFor: .binary)
    }
}

/// Le protocole que parle `browser.runtime.sendNativeMessage()`.
///
/// C'est le seul chemin par lequel l'extension écrit dans le conteneur partagé,
/// et le seul par lequel l'app apprend qu'une clé a été créée dans Safari.
/// Safari transporte le message ; ce qui suit couvre tout le reste.
struct SharedBridgeTests {

    /// Exactement la forme produite par `toSharedShape()` dans background.js.
    private func extensionPayload(tokenId: Any = NSNull()) -> [String: Any] {
        [
            "mealieUrl": "https://mealie.exemple.com",
            "token": "cle.api.secrete",
            "tokenId": tokenId,
            "language": "fr",
            "updatedAt": 1_787_308_269_764.0
        ]
    }

    @Test func getConfig_renvoieLesReglagesStockes() {
        let store = MemoryStore()
        var config = SharedConfig()
        config.mealieUrl = "https://mealie.exemple.com"
        config.token = "cle"
        store.saveVerbatim(config)

        let reply = SharedBridge(store: store).handle(message: ["type": "get-config"])

        #expect(reply["ok"] as? Bool == true)
        let payload = reply["config"] as? [String: Any]
        #expect(payload?["mealieUrl"] as? String == "https://mealie.exemple.com")
        #expect(payload?["token"] as? String == "cle")
    }

    /// Le sens extension → app : la clé créée dans Safari doit atterrir intacte.
    @Test func setConfig_deposeLaCleDeLExtension() {
        let store = MemoryStore()

        let reply = SharedBridge(store: store).handle(
            message: ["type": "set-config", "config": extensionPayload(tokenId: 7)]
        )

        #expect(reply["ok"] as? Bool == true)
        #expect(store.storedIsPropertyList)

        let landed = store.load()
        #expect(landed.isConfigured)
        #expect(landed.token == "cle.api.secrete")
        #expect(landed.tokenId == 7)
        #expect(landed.language == "fr")
        // L'horodatage de l'extension survit : c'est lui qui arbitre entre les
        // deux copies, le réécrire ferait gagner la mauvaise.
        #expect(landed.updatedAt == 1_787_308_269_764.0)
    }

    @Test func setConfig_sansCle_resteStockable() {
        let store = MemoryStore()
        _ = SharedBridge(store: store).handle(
            message: ["type": "set-config", "config": extensionPayload()]
        )
        #expect(store.storedIsPropertyList)
        #expect(store.load().tokenId == nil)
    }

    @Test func setConfig_sansCharge_estRefuse() {
        let store = MemoryStore()
        let reply = SharedBridge(store: store).handle(message: ["type": "set-config"])
        #expect(reply["ok"] as? Bool == false)
        #expect(store.stored == nil)
    }

    @Test func clearConfig_videLeConteneur() {
        let store = MemoryStore()
        _ = SharedBridge(store: store).handle(
            message: ["type": "set-config", "config": extensionPayload(tokenId: 7)]
        )
        let reply = SharedBridge(store: store).handle(message: ["type": "clear-config"])

        #expect(reply["ok"] as? Bool == true)
        #expect(!store.load().isConfigured)
    }

    @Test func messageInconnu_estRefuseSansEcrire() {
        let store = MemoryStore()
        #expect(SharedBridge(store: store).handle(message: ["type": "danser"])["ok"] as? Bool == false)
        #expect(SharedBridge(store: store).handle(message: nil)["ok"] as? Bool == false)
        #expect(store.stored == nil)
    }

    /// Capability App Groups absente de la signature : l'extension doit
    /// l'apprendre plutôt que de croire ses réglages enregistrés.
    @Test func conteneurIndisponible_estAnnonce() {
        let store = MemoryStore()
        store.isAvailable = false

        let reply = SharedBridge(store: store).handle(
            message: ["type": "set-config", "config": extensionPayload(tokenId: 7)]
        )

        #expect(reply["ok"] as? Bool == false)
        #expect(reply["available"] as? Bool == false)
        #expect(store.stored == nil)
    }

    /// Aller-retour complet : ce que l'extension dépose est ce que l'app relit.
    @Test func allerRetour_conserveTout() {
        let store = MemoryStore()
        let bridge = SharedBridge(store: store)

        _ = bridge.handle(message: ["type": "set-config", "config": extensionPayload(tokenId: 7)])
        let readBack = bridge.handle(message: ["type": "get-config"])["config"] as? [String: Any]

        #expect(SharedConfig(dictionary: readBack ?? [:]) == store.load())
    }
}

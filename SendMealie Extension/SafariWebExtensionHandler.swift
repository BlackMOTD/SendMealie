//
//  SafariWebExtensionHandler.swift
//  SendMealie Extension
//
//  Created by Bastien on 20/08/2026.
//

import AppKit
import SafariServices
import os.log

/// Guichet entre `browser.runtime.sendNativeMessage()` et le conteneur App Group.
///
/// Safari n'offre aucun autre chemin : l'app ne peut pas écrire dans
/// `browser.storage.local`, et l'extension ne peut pas lire les `UserDefaults`
/// de l'app. Ce fichier ne fait que déballer et remballer ; la décision est
/// dans `SharedBridge`, où les tests peuvent l'atteindre.
class SafariWebExtensionHandler: NSObject, NSExtensionRequestHandling {

    func beginRequest(with context: NSExtensionContext) {
        let request = context.inputItems.first as? NSExtensionItem

        let message = request?.userInfo?[SFExtensionMessageKey]

        let payload = message as? [String: Any]

        // Safari ne sait pas lancer d'application ; LaunchServices, si. C'est le
        // seul chemin dont dispose l'extension pour ouvrir les réglages, qui
        // vivent désormais uniquement dans l'app.
        if payload?["type"] as? String == "open-app" {
            respond(to: context, with: ["ok": openContainerApp(route: payload?["route"] as? String ?? "")])
            return
        }

        let reply = SharedBridge(store: SharedStore.group).handle(message: payload)
        // Sans trace, une synchronisation qui rend un conteneur vide est
        // indiscernable d'une application jamais configurée.
        os_log(.default, "SendMealie: %{public}@ → groupe %{public}@, configuré %{public}@, %{public}@",
               payload?["type"] as? String ?? "sans type",
               AppGroupStore.groupIdentifier,
               SharedStore.load().isConfigured ? "oui" : "non",
               reply["ok"] as? Bool == true ? "ok" : (reply["error"] as? String ?? "refusé"))

        respond(to: context, with: reply)
    }

    /// Le schéma d'URL d'abord, parce que lui seul transporte la destination.
    /// À défaut, on ouvre l'app conteneur par son chemin : on la connaît, elle
    /// est deux niveaux au-dessus de cet appex.
    private func openContainerApp(route: String) -> Bool {
        if let url = URL(string: "sendmealie://\(route)"), NSWorkspace.shared.open(url) {
            return true
        }

        let container = Bundle.main.bundleURL
            .deletingLastPathComponent()  // PlugIns
            .deletingLastPathComponent()  // Contents
            .deletingLastPathComponent()  // SendMealie.app
        guard container.pathExtension == "app" else { return false }

        NSWorkspace.shared.openApplication(at: container, configuration: NSWorkspace.OpenConfiguration())
        return true
    }

    private func respond(to context: NSExtensionContext, with payload: [String: Any]) {
        let response = NSExtensionItem()
        response.userInfo = [SFExtensionMessageKey: payload]
        context.completeRequest(returningItems: [response], completionHandler: nil)
    }
}

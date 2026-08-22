//
//  SafariLink.swift
//  SendMealie
//

import AppKit
import SafariServices

/// Tout ce que l'application demande à Safari.
///
/// Rassemblé ici parce que ces appels partagent les mêmes chausse-trapes :
/// l'identifiant de l'extension doit être dérivé et non écrit en dur, et Safari
/// ne se met pas au premier plan de lui-même quand on lui ouvre un volet.
enum SafariLink {
    private static let bundleIdentifier = "com.apple.Safari"

    /// Dérivé de l'identifiant de l'app : un fork qui change de bundle garde un
    /// couple cohérent, là où une constante en dur pointait dans le vide.
    static var extensionIdentifier: String {
        (Bundle.main.bundleIdentifier ?? "fr.warneford.sendmealie") + ".Extension"
    }

    static func extensionIsEnabled() async throws -> Bool {
        try await SFSafariExtensionManager
            .stateOfSafariExtension(withIdentifier: extensionIdentifier)
            .isEnabled
    }

    /// Ouvre le volet des extensions. `showPreferencesForExtension` s'en charge
    /// mais laisse Safari derrière la fenêtre de l'app : de l'extérieur, cliquer
    /// semblait ne rien faire.
    static func showExtensionSettings() {
        SFSafariApplication.showPreferencesForExtension(withIdentifier: extensionIdentifier) { error in
            Task { @MainActor in
                if error != nil { launch() }
                bringForward()
            }
        }
    }

    /// L'extension n'existe que dans Safari : ouvrir le navigateur par défaut
    /// enverrait l'utilisateur là où rien ne peut l'aider.
    static func open(_ address: String) {
        guard let url = URL(string: address) else { return }
        guard let safari = applicationURL else {
            NSWorkspace.shared.open(url)
            return
        }
        NSWorkspace.shared.open([url], withApplicationAt: safari, configuration: NSWorkspace.OpenConfiguration())
    }

    static func bringForward() {
        NSRunningApplication
            .runningApplications(withBundleIdentifier: bundleIdentifier)
            .first?
            .activate(options: .activateAllWindows)
    }

    private static var applicationURL: URL? {
        NSWorkspace.shared.urlForApplication(withBundleIdentifier: bundleIdentifier)
    }

    private static func launch() {
        guard let safari = applicationURL else { return }
        NSWorkspace.shared.openApplication(at: safari, configuration: NSWorkspace.OpenConfiguration())
    }
}

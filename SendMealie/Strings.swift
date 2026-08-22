//
//  Strings.swift
//  SendMealie
//

import Foundation

enum AppLanguage: String, CaseIterable, Identifiable {
    case system = ""
    case french = "fr"
    case english = "en"

    var id: String { rawValue }

    /// Langue réellement utilisée pour l'affichage.
    var resolved: AppLanguage {
        guard self == .system else { return self }
        let preferred = Locale.preferredLanguages.first ?? "en"
        return preferred.hasPrefix("fr") ? .french : .english
    }

    var nativeName: String {
        switch self {
        case .french: return "Français"
        case .english: return "English"
        case .system: return ""
        }
    }
}

/// Table plate plutôt que des `.strings` localisés : l'utilisateur choisit la
/// langue dans l'app, indépendamment de celle du système, et cette même valeur
/// traverse l'App Group pour piloter le popup de l'extension.
enum AppStrings {
    static func value(_ key: String, _ language: AppLanguage, _ vars: [String: String] = [:]) -> String {
        guard let entry = table[key] else { return key }
        var text = language.resolved == .french ? entry.fr : entry.en
        for (name, value) in vars {
            text = text.replacingOccurrences(of: "{\(name)}", with: value)
        }
        return text
    }

    private static let table: [String: (fr: String, en: String)] = [
        "loading.title": ("Préparation…", "Getting ready…"),

        "language.title": ("Bienvenue", "Welcome"),
        "language.subtitle": ("Choisissez la langue de SendMealie. Elle s'applique aussi au popup de l'extension.",
                              "Pick the language for SendMealie. It applies to the extension popup too."),
        "language.system": ("Suivre le système", "Follow the system"),

        "server.title": ("Votre instance Mealie", "Your Mealie instance"),
        "server.subtitle": ("Collez l'adresse complète, https:// compris.", "Paste the full address, https:// included."),
        "server.invalid": ("L'adresse doit commencer par http:// ou https://.", "The address must start with http:// or https://."),
        "server.viaSafari": ("Plutôt me connecter depuis Safari", "Rather sign in from Safari"),

        "handoff.title": ("Connexion depuis Safari", "Signing in from Safari"),
        "handoff.subtitle": ("Safari s'est ouvert sur votre Mealie. Identifiez-vous comme d'habitude : l'extension s'occupe du reste, et cette fenêtre prend le relais dès que la clé est créée.",
                             "Safari has opened your Mealie. Sign in as you normally would: the extension handles the rest, and this window takes over as soon as the key exists."),
        "handoff.waiting": ("En attente de la clé…", "Waiting for the key…"),
        "handoff.needExtension": ("Ce parcours passe par l'extension : activez-la dans Safari, et autorisez-la sur le site de votre Mealie.",
                                  "This route goes through the extension: enable it in Safari, and allow it on your Mealie site."),
        "handoff.reopen": ("Rouvrir Mealie dans Safari", "Reopen Mealie in Safari"),
        "handoff.back": ("Me connecter dans l'app finalement", "Sign in inside the app after all"),

        "login.title": ("Connexion à Mealie", "Sign in to Mealie"),
        "login.hint": ("Identifiez-vous comme d'habitude : SendMealie crée ensuite sa clé API tout seul.",
                       "Sign in as you normally would — SendMealie then creates its own API key."),
        "login.waiting": ("En attente de votre identification…", "Waiting for you to sign in…"),
        "login.creating": ("Session détectée, création de la clé…", "Session found, creating the key…"),
        "login.unreachable": ("Instance injoignable à cette adresse.", "No instance reachable at that address."),
        "login.keyRefused": ("Création de la clé refusée par Mealie ({status}). {detail}",
                             "Mealie refused to create the key ({status}). {detail}"),
        "login.noKey": ("Mealie n'a pas renvoyé de clé API.", "Mealie returned no API key."),
        "login.timeout": ("Délai dépassé : aucune identification détectée sur Mealie.",
                          "Timed out: no sign-in detected on Mealie."),
        "login.script": ("La page ne répond pas comme prévu : {detail}",
                         "The page is not answering as expected: {detail}"),
        "login.missingScript": ("Ressource claim-token.js absente de l'app — build incomplet.",
                                "claim-token.js is missing from the app bundle — incomplete build."),

        "success.title": ("Tout est prêt", "You're all set"),
        "success.subtitle": ("La clé « SendMealie » est enregistrée. L'extension Safari s'en sert automatiquement.",
                             "The “SendMealie” key is stored. The Safari extension picks it up automatically."),
        "success.continue": ("Voir mes recettes", "See my recipes"),

        "dashboard.total": ("Recettes", "Recipes"),
        "dashboard.recent": ("Ce mois-ci", "This month"),
        "dashboard.tags": ("Étiquettes", "Tags"),
        "dashboard.latest": ("Dernières recettes", "Latest recipes"),
        "dashboard.empty": ("Aucune recette pour l'instant.", "No recipes yet."),
        "dashboard.openMealie": ("Ouvrir Mealie", "Open Mealie"),

        "extension.enabled": ("Extension Safari active", "Safari extension enabled"),
        "extension.disabled": ("Extension Safari désactivée", "Safari extension disabled"),
        "extension.unknown": ("État de l'extension inconnu", "Extension state unknown"),
        "extension.unknownHint": ("Safari ne reconnaît pas cette copie de SendMealie. Placez l'application dans /Applications, lancez-la depuis là, puis relancez Safari — une app déplacée ou supprimée laisse son extension rattachée à un chemin qui n'existe plus.",
                                  "Safari does not recognise this copy of SendMealie. Move the app to /Applications, launch it from there, then restart Safari — a moved or deleted app leaves its extension bound to a path that no longer exists."),
        "extension.open": ("Réglages Safari", "Safari settings"),

        "settings.title": ("Réglages", "Settings"),
        "settings.language": ("Langue", "Language"),
        "settings.instance": ("Instance", "Instance"),
        "settings.version": ("Version", "Version"),
        "settings.repo": ("GitHub", "GitHub"),
        "settings.web": ("Site", "Website"),
        "settings.disconnect": ("Déconnecter", "Disconnect"),
        "settings.disconnectArmed": ("Confirmer la déconnexion", "Confirm disconnect"),
        "settings.disconnectHint": ("La clé « SendMealie » sera révoquée sur le serveur, puis effacée ici et dans l'extension.",
                                    "The “SendMealie” key will be revoked on the server, then cleared here and in the extension."),

        "common.continue": ("Continuer", "Continue"),
        "common.back": ("Retour", "Back"),
        "common.refresh": ("Actualiser", "Refresh"),
        "common.close": ("Fermer", "Close"),

        "error.group": ("Conteneur partagé indisponible : l'extension ne recevra pas ces réglages. Vérifiez la capability App Groups sur les deux cibles.",
                        "Shared container unavailable: the extension will not receive these settings. Check the App Groups capability on both targets."),
        "error.revoke": ("Réglages effacés, mais la clé reste sur le serveur — à retirer depuis votre profil Mealie.",
                         "Settings cleared, but the key is still on the server — remove it from your Mealie profile.")
    ]
}

//
//  SendMealieApp.swift
//  SendMealie
//

import Combine
import SwiftUI

/// Adresses publiques du projet.
enum Links {
    static let repository = URL(string: "https://github.com/BlackMOTD/SendMealie")!
    static let website = URL(string: "https://sendmealie.warneford.fr")!
}

enum Brand {
    /// Même orange que l'icône de barre d'outils de l'extension.
    static let accent = Color(red: 0.898, green: 0.514, blue: 0.145)
    static let deep = Color(red: 0.153, green: 0.357, blue: 0.294)
}

@main
struct SendMealieApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var delegate
    @StateObject private var model = AppModel()

    var body: some Scene {
        // `Window` et non `WindowGroup` : la scène n'existe qu'en un seul
        // exemplaire. Une ouverture par `sendmealie://` alors que l'app tourne
        // déjà se contente d'activer cette fenêtre, au lieu d'en ouvrir une
        // deuxième — et le menu perd « Nouvelle fenêtre », qui en ouvrirait une.
        Window("SendMealie", id: "main") {
            RootView()
                .environmentObject(model)
                .frame(minWidth: 680, minHeight: 520)
                .task { await model.bootstrap() }
                .onOpenURL { model.handle(url: $0) }
        }
        .defaultSize(width: 900, height: 660)
        .commands {
            CommandGroup(replacing: .newItem) {}
        }
    }
}

/// Fermer la fenêtre quitte l'application.
///
/// Sans cela, une app sans fenêtre continuerait de tourner : « Ouvrir
/// SendMealie » depuis l'extension activerait un processus qui n'affiche rien,
/// et il n'y aurait aucun moyen de faire revenir la fenêtre.
final class AppDelegate: NSObject, NSApplicationDelegate {
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        true
    }
}

struct RootView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        ZStack {
            switch model.stage {
            case .loading: LoadingStep()
            case .language: LanguageStep()
            case .server: ServerStep()
            case .login: LoginStep()
            case .safariHandoff: SafariHandoffStep()
            case .success: SuccessStep()
            case .dashboard: DashboardView()
            }
        }
        .animation(.easeInOut(duration: 0.25), value: model.stage)
        .background(Color(nsColor: .windowBackgroundColor))
        // L'utilisateur revient d'un aller-retour dans les réglages de Safari :
        // la pastille doit refléter ce qu'il vient d'y faire.
        .onReceive(NotificationCenter.default.publisher(for: NSApplication.didBecomeActiveNotification)) { _ in
            Task { await model.refreshExtensionState() }
        }
    }
}

/// Cartouche commun aux étapes d'installation : marque, titre, sous-titre.
struct OnboardingShell<Content: View>: View {
    let title: String
    let subtitle: String
    @ViewBuilder var content: Content

    var body: some View {
        VStack(spacing: 24) {
            Spacer(minLength: 0)

            Image("LargeIcon")
                .resizable()
                .interpolation(.high)
                .frame(width: 84, height: 84)
                .clipShape(RoundedRectangle(cornerRadius: 19, style: .continuous))
                .shadow(color: .black.opacity(0.18), radius: 12, y: 5)

            VStack(spacing: 7) {
                Text(title)
                    .font(.system(size: 25, weight: .semibold))
                Text(subtitle)
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: 420)
            }

            content

            Spacer(minLength: 0)
        }
        .padding(40)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

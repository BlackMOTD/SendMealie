//
//  LoginWebView.swift
//  SendMealie
//

import SwiftUI
import WebKit

struct MealieToken: Equatable {
    let value: String
    let id: Int?
    let user: String
}

enum LoginOutcome: Equatable {
    /// L'instance répond, mais personne n'est identifié pour l'instant.
    case anonymous
    case unreachable
    case granted(MealieToken)
    case keyRefused(status: Int, detail: String)
    case noKey
    case timedOut
    /// Diagnostic passager : la sonde a échoué, la surveillance continue.
    case stalled(String)
    case missingScript
}

/// Page de connexion Mealie affichée telle quelle.
///
/// Aucun mot de passe ne transite par SendMealie : c'est la page de Mealie qui
/// l'encaisse. On se contente d'interroger `/api/users/self` depuis cette page
/// jusqu'à ce que la session existe, puis on crée la clé API avec elle — par le
/// même script que l'extension, `Shared/claim-token.js`.
struct LoginWebView: NSViewRepresentable {
    let baseUrl: String
    let onOutcome: (LoginOutcome) -> Void

    func makeNSView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = context.coordinator

        if let url = URL(string: baseUrl.hasSuffix("/") ? baseUrl + "login" : baseUrl + "/login") {
            webView.load(URLRequest(url: url))
        }

        context.coordinator.start(webView)
        return webView
    }

    func updateNSView(_ webView: WKWebView, context: Context) {
        context.coordinator.parent = self
    }

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    static func dismantleNSView(_ webView: WKWebView, coordinator: Coordinator) {
        coordinator.stop()
    }

    @MainActor
    final class Coordinator: NSObject, WKNavigationDelegate {
        var parent: LoginWebView
        private var poll: Task<Void, Never>?
        private var finished = false
        private var failures = 0
        private let startedAt = Date()

        private static let timeout: TimeInterval = 240
        private static let intervalNanoseconds: UInt64 = 1_500_000_000
        /// Deux ou trois sondes ratées pendant une navigation sont normales ;
        /// au-delà, l'erreur mérite d'être montrée plutôt que d'être avalée.
        private static let failuresBeforeReporting = 6

        /// Le script est embarqué dans les deux bundles depuis `Shared/`. Le lire
        /// plutôt que le recopier ici est le seul moyen qu'il ne diverge plus de
        /// celui de l'extension.
        private static let claimSource: String? = {
            guard let url = Bundle.main.url(forResource: "claim-token", withExtension: "js"),
                  let source = try? String(contentsOf: url, encoding: .utf8)
            else { return nil }
            return source + "\nreturn JSON.stringify(await sendMealieClaimToken());"
        }()

        init(_ parent: LoginWebView) { self.parent = parent }

        func start(_ webView: WKWebView) {
            poll?.cancel()
            poll = Task { @MainActor [weak webView] in
                while !Task.isCancelled {
                    try? await Task.sleep(nanoseconds: Self.intervalNanoseconds)
                    guard !Task.isCancelled, !finished, let webView else { return }
                    await self.probe(webView)
                }
            }
        }

        func stop() {
            poll?.cancel()
            poll = nil
        }

        /// Ne sonde que sur l'origine de l'instance : un fournisseur d'identité
        /// externe (SSO) affiche ses propres pages, où ces requêtes n'ont
        /// aucun sens.
        private func probe(_ webView: WKWebView) async {
            guard let source = Self.claimSource else {
                deliver(.missingScript)
                return
            }
            guard Date().timeIntervalSince(startedAt) < Self.timeout else {
                deliver(.timedOut)
                return
            }
            guard let current = webView.url?.absoluteString, current.hasPrefix(parent.baseUrl) else { return }

            do {
                let raw = try await webView.callAsyncJavaScript(
                    source, arguments: [:], in: nil, contentWorld: .page
                )
                failures = 0

                guard let json = raw as? String,
                      let data = json.data(using: .utf8),
                      let payload = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
                else { return }

                report(payload)
            } catch {
                failures += 1
                if failures == Self.failuresBeforeReporting {
                    parent.onOutcome(.stalled(error.localizedDescription))
                }
            }
        }

        private func report(_ payload: [String: Any]) {
            switch payload["state"] as? String {
            case "granted":
                deliver(.granted(MealieToken(
                    value: payload["token"] as? String ?? "",
                    id: payload["tokenId"] as? Int,
                    user: payload["user"] as? String ?? ""
                )))
            case "refused" where payload["reason"] as? String == "no-token":
                deliver(.noKey)
            case "refused":
                deliver(.keyRefused(
                    status: payload["status"] as? Int ?? 0,
                    detail: payload["detail"] as? String ?? ""
                ))
            case "unreachable":
                parent.onOutcome(.unreachable)
            default:
                parent.onOutcome(.anonymous)
            }
        }

        private func deliver(_ outcome: LoginOutcome) {
            guard !finished else { return }
            finished = true
            stop()
            parent.onOutcome(outcome)
        }
    }
}

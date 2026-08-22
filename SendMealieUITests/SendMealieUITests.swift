//
//  SendMealieUITests.swift
//  SendMealieUITests
//
//  Created by Bastien on 20/08/2026.
//

import XCTest

final class SendMealieUITests: XCTestCase {

    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    /// Choisir une langue enregistre les réglages dans le conteneur partagé, et
    /// c'est là que l'app gelait en 0.0.2 : `UserDefaults` levait
    /// `NSInvalidArgumentException` sur le `NSNull` d'un `tokenId` non renseigné,
    /// AppKit encaissait l'exception, et l'interface ne répondait plus.
    ///
    /// Le test passe l'étape et vérifie que la suivante s'affiche : une app gelée
    /// n'y arriverait pas.
    @MainActor
    func testChoixDeLangueMeneALEtapeSuivante() throws {
        let app = XCUIApplication()
        app.launch()

        let systemChoice = app.buttons["language-system"]
        XCTAssertTrue(systemChoice.waitForExistence(timeout: 20), "L'étape « langue » ne s'est pas affichée.")
        systemChoice.click()

        app.buttons["language-continue"].click()

        XCTAssertTrue(
            app.textFields["server-url"].waitForExistence(timeout: 20),
            "L'app n'a pas atteint l'étape « instance » : l'enregistrement des réglages a échoué."
        )
    }

    @MainActor
    func testLaunchPerformance() throws {
        measure(metrics: [XCTApplicationLaunchMetric()]) {
            XCUIApplication().launch()
        }
    }
}

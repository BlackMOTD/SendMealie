//
//  RecipeThumbnail.swift
//  SendMealie
//

import SwiftUI

/// `AsyncImage` ne sait pas poser d'en-tête d'autorisation, et selon la version
/// de Mealie et la visibilité du groupe, `/api/media` peut l'exiger. D'où ce
/// chargeur minimal, avec un cache mémoire pour ne pas retélécharger à chaque
/// défilement.
struct RecipeThumbnail: View {
    let recipeId: String
    let client: MealieClient?
    let height: CGFloat

    @State private var image: NSImage?
    @State private var failed = false

    private static let cache: NSCache<NSString, NSImage> = {
        let cache = NSCache<NSString, NSImage>()
        cache.countLimit = 120
        return cache
    }()

    /// L'ordre compte : la hauteur est imposée **avant** le rognage. Une photo
    /// en `.fill` déborde son cadre par construction ; rogner d'abord, puis
    /// cadrer, laissait l'image déborder sur le titre de la carte.
    var body: some View {
        Rectangle()
            .fill(Color.secondary.opacity(0.12))
            .frame(height: height)
            .overlay {
                if let image {
                    Image(nsImage: image)
                        .resizable()
                        .aspectRatio(contentMode: .fill)
                } else {
                    Image(systemName: failed ? "fork.knife" : "photo")
                        .font(.system(size: 22))
                        .foregroundStyle(.tertiary)
                }
            }
            .clipped()
            .task(id: recipeId) { await load() }
    }

    private func load() async {
        if let cached = Self.cache.object(forKey: recipeId as NSString) {
            image = cached
            return
        }
        guard let client else { return }

        do {
            let data = try await client.imageData(recipeId: recipeId)
            guard let decoded = NSImage(data: data) else {
                failed = true
                return
            }
            Self.cache.setObject(decoded, forKey: recipeId as NSString)
            image = decoded
        } catch {
            failed = true
        }
    }
}

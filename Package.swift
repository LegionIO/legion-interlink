// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "LegionInterlink",
    platforms: [.macOS(.v13)],
    targets: [
        .executableTarget(
            name: "LegionInterlink",
            path: "Sources",
            resources: [
                .copy("Resources")
            ]
        )
    ]
)

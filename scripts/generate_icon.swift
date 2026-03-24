import AppKit
import Foundation

struct Palette {
    static let void = NSColor(calibratedRed: 7/255, green: 6/255, blue: 15/255, alpha: 1)
    static let deep = NSColor(calibratedRed: 18/255, green: 16/255, blue: 41/255, alpha: 1)
    static let mid = NSColor(calibratedRed: 61/255, green: 56/255, blue: 138/255, alpha: 1)
    static let cardinal = NSColor(calibratedRed: 95/255, green: 87/255, blue: 196/255, alpha: 1)
    static let node = NSColor(calibratedRed: 127/255, green: 119/255, blue: 221/255, alpha: 1)
    static let inner = NSColor(calibratedRed: 160/255, green: 154/255, blue: 232/255, alpha: 1)
    static let light = NSColor(calibratedRed: 197/255, green: 194/255, blue: 245/255, alpha: 1)
}

let gridPoints: [(CGFloat, CGFloat)] = [
    (0.34, 0.66), (0.50, 0.66), (0.66, 0.66),
    (0.34, 0.50), (0.50, 0.50), (0.66, 0.50),
    (0.34, 0.34), (0.50, 0.34), (0.66, 0.34),
]

let gridConnections: [(Int, Int)] = [
    (0, 1), (1, 2), (3, 4), (4, 5), (6, 7), (7, 8),
    (0, 3), (3, 6), (1, 4), (4, 7), (2, 5), (5, 8),
    (1, 3), (1, 5), (3, 7), (5, 7)
]

// Lit nodes and edges trace an "I" glyph across the 3x3 network.
let litNodes: Set<Int> = [0, 1, 2, 4, 6, 7, 8]
let litEdges: Set<String> = ["0-1", "1-2", "1-4", "4-7", "6-7", "7-8"]
// Keep the tile inset for a standard Dock silhouette, but scale the internal
// motif up slightly so it doesn't feel undersized inside the tile.
let iconScale: CGFloat = 1.42
let tileScale: CGFloat = 0.84

func edgeKey(_ a: Int, _ b: Int) -> String {
    a < b ? "\(a)-\(b)" : "\(b)-\(a)"
}

func rect(_ size: CGFloat, _ x: CGFloat, _ y: CGFloat, _ w: CGFloat, _ h: CGFloat) -> NSRect {
    NSRect(x: x * size, y: y * size, width: w * size, height: h * size)
}

func point(_ size: CGFloat, _ x: CGFloat, _ y: CGFloat) -> NSPoint {
    NSPoint(x: x * size, y: y * size)
}

func roundedTile(size: CGFloat) -> NSBezierPath {
    NSBezierPath(roundedRect: NSRect(x: 0, y: 0, width: size, height: size), xRadius: size * 0.23, yRadius: size * 0.23)
}

func scaleValue(_ value: CGFloat) -> CGFloat {
    0.5 + (value - 0.5) * iconScale
}

func scaledGridPoint(_ size: CGFloat, index: Int) -> NSPoint {
    let coords = gridPoints[index]
    return point(size, scaleValue(coords.0), scaleValue(coords.1))
}

func fillCircle(center: NSPoint, radius: CGFloat, color: NSColor) {
    color.setFill()
    NSBezierPath(ovalIn: NSRect(x: center.x - radius, y: center.y - radius, width: radius * 2, height: radius * 2)).fill()
}

func strokeLine(from: NSPoint, to: NSPoint, width: CGFloat, color: NSColor) {
    let path = NSBezierPath()
    path.move(to: from)
    path.line(to: to)
    path.lineWidth = width
    path.lineCapStyle = .round
    color.setStroke()
    path.stroke()
}

func drawIcon(size: CGFloat) throws -> Data {
    let image = NSImage(size: NSSize(width: size, height: size))
    image.lockFocus()
    guard let context = NSGraphicsContext.current?.cgContext else {
        throw NSError(domain: "IconGen", code: 1)
    }

    context.setAllowsAntialiasing(true)
    context.interpolationQuality = .high
    context.saveGState()

    let inset = (size - (size * tileScale)) / 2
    context.translateBy(x: inset, y: inset)
    context.scaleBy(x: tileScale, y: tileScale)

    let canvas = NSRect(x: 0, y: 0, width: size, height: size)
    roundedTile(size: size).addClip()

    let background = NSGradient(colorsAndLocations:
        (NSColor(calibratedRed: 18/255, green: 16/255, blue: 34/255, alpha: 1), 0.0),
        (NSColor(calibratedRed: 30/255, green: 24/255, blue: 63/255, alpha: 1), 0.38),
        (Palette.void, 1.0)
    )!
    background.draw(in: canvas, angle: -45)

    let frame = NSBezierPath(
        roundedRect: rect(size, scaleValue(0.23), scaleValue(0.23), 0.54 * iconScale, 0.54 * iconScale),
        xRadius: size * 0.12 * iconScale,
        yRadius: size * 0.12 * iconScale
    )
    frame.lineWidth = size * 0.022 * iconScale
    Palette.inner.withAlphaComponent(0.72).setStroke()
    frame.stroke()

    for (a, b) in gridConnections {
        let isLitPath = litEdges.contains(edgeKey(a, b))
        let color = isLitPath ? Palette.light.withAlphaComponent(0.58) : Palette.node.withAlphaComponent(0.24)
        strokeLine(
            from: scaledGridPoint(size, index: a),
            to: scaledGridPoint(size, index: b),
            width: size * (isLitPath ? 0.028 : 0.013) * iconScale,
            color: color
        )
    }

    for index in gridPoints.indices {
        let p = scaledGridPoint(size, index: index)
        let isLit = litNodes.contains(index)

        let outer = isLit ? Palette.light.withAlphaComponent(1.0) : Palette.inner.withAlphaComponent(0.84)
        let inner = isLit ? Palette.cardinal : Palette.node
        let radius = size * (isLit ? 0.038 : 0.024) * iconScale

        fillCircle(center: p, radius: radius * 1.35, color: isLit ? Palette.light.withAlphaComponent(0.08) : .clear)
        fillCircle(center: p, radius: radius, color: outer)
        fillCircle(center: p, radius: radius * 0.58, color: inner)
    }

    context.restoreGState()

    image.unlockFocus()

    guard
        let tiff = image.tiffRepresentation,
        let bitmap = NSBitmapImageRep(data: tiff),
        let png = bitmap.representation(using: .png, properties: [:])
    else {
        throw NSError(domain: "IconGen", code: 2)
    }
    return png
}

func writeIcon(size: CGFloat, to destination: URL) throws {
    try drawIcon(size: size).write(to: destination)
}

func appendUInt16(_ value: UInt16, to data: inout Data) {
    var little = value.littleEndian
    data.append(Data(bytes: &little, count: MemoryLayout<UInt16>.size))
}

func appendUInt32(_ value: UInt32, to data: inout Data) {
    var little = value.littleEndian
    data.append(Data(bytes: &little, count: MemoryLayout<UInt32>.size))
}

func appendUInt32BE(_ value: UInt32, to data: inout Data) {
    var big = value.bigEndian
    data.append(Data(bytes: &big, count: MemoryLayout<UInt32>.size))
}

func createICO(from images: [(Int, Data)], to destination: URL) throws {
    var data = Data()
    appendUInt16(0, to: &data)
    appendUInt16(1, to: &data)
    appendUInt16(UInt16(images.count), to: &data)

    let headerSize = 6 + (16 * images.count)
    var offset = UInt32(headerSize)

    for (size, pngData) in images {
        data.append(UInt8(size == 256 ? 0 : size))
        data.append(UInt8(size == 256 ? 0 : size))
        data.append(0)
        data.append(0)
        appendUInt16(1, to: &data)
        appendUInt16(32, to: &data)
        appendUInt32(UInt32(pngData.count), to: &data)
        appendUInt32(offset, to: &data)
        offset += UInt32(pngData.count)
    }

    for (_, pngData) in images {
        data.append(pngData)
    }

    try data.write(to: destination)
}

func createICNS(from images: [Int: Data], to destination: URL) throws {
    let chunks: [(String, Data)] = [
        ("ic04", images[16]!),
        ("ic11", images[32]!),
        ("ic05", images[32]!),
        ("ic12", images[64]!),
        ("ic07", images[128]!),
        ("ic13", images[256]!),
        ("ic08", images[256]!),
        ("ic14", images[512]!),
        ("ic09", images[512]!)
    ]

    var body = Data()
    for (type, pngData) in chunks {
        body.append(type.data(using: .ascii)!)
        appendUInt32BE(UInt32(pngData.count + 8), to: &body)
        body.append(pngData)
    }

    var file = Data()
    file.append("icns".data(using: .ascii)!)
    appendUInt32BE(UInt32(body.count + 8), to: &file)
    file.append(body)
    try file.write(to: destination)
}

let fileManager = FileManager.default
let root = URL(fileURLWithPath: fileManager.currentDirectoryPath)
let buildDir = root.appendingPathComponent("build")
try fileManager.createDirectory(at: buildDir, withIntermediateDirectories: true)

let master = buildDir.appendingPathComponent("icon-master.png")
let iconPNG = buildDir.appendingPathComponent("icon.png")
let iconICO = buildDir.appendingPathComponent("icon.ico")
let iconICNS = buildDir.appendingPathComponent("icon.icns")
let iconset = buildDir.appendingPathComponent("icon.iconset")

if fileManager.fileExists(atPath: iconset.path) {
    try fileManager.removeItem(at: iconset)
}
try fileManager.createDirectory(at: iconset, withIntermediateDirectories: true)
defer {
    try? fileManager.removeItem(at: iconset)
}

let iconsetSpecs: [(String, CGFloat)] = [
    ("icon_16x16.png", 16),
    ("icon_16x16@2x.png", 32),
    ("icon_32x32.png", 32),
    ("icon_32x32@2x.png", 64),
    ("icon_128x128.png", 128),
    ("icon_128x128@2x.png", 256),
    ("icon_256x256.png", 256),
    ("icon_256x256@2x.png", 512),
    ("icon_512x512.png", 512)
]

var pngsBySize: [Int: Data] = [:]

for (name, size) in iconsetSpecs {
    let pngData = try drawIcon(size: size)
    try pngData.write(to: iconset.appendingPathComponent(name))
    pngsBySize[Int(size)] = pngData
}

try writeIcon(size: 1024, to: master)
try writeIcon(size: 512, to: iconPNG)

let icoSizes = [16, 24, 32, 48, 64, 128, 256]
let icoImages = try icoSizes.map { size in
    (size, try drawIcon(size: CGFloat(size)))
}
try createICO(from: icoImages, to: iconICO)
try createICNS(from: pngsBySize, to: iconICNS)

print(master.path)
print(iconPNG.path)
print(iconICO.path)
print(iconICNS.path)

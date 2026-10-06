// Native vector artwork for the Pixel Buddy desktop icon. No external image tools.
import Foundation
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers
let size = 1024
let space = CGColorSpaceCreateDeviceRGB()
let ctx = CGContext(data: nil, width: size, height: size, bitsPerComponent: 8, bytesPerRow: size * 4, space: space, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
func color(_ hex: UInt32) -> CGColor { CGColor(red: CGFloat((hex >> 16) & 255) / 255, green: CGFloat((hex >> 8) & 255) / 255, blue: CGFloat(hex & 255) / 255, alpha: 1) }
let ink: UInt32 = 0x173a2a
ctx.setFillColor(color(0xf5f4eb))
ctx.addPath(CGPath(roundedRect: CGRect(x: 0, y: 0, width: size, height: size), cornerWidth: 200, cornerHeight: 200, transform: nil)); ctx.fillPath()
ctx.translateBy(x: 56, y: 980); ctx.scaleBy(x: 3.8, y: -3.8)
ctx.setLineJoin(.round)
func polygon(_ points: [(CGFloat, CGFloat)], _ fill: UInt32, _ stroke: UInt32 = ink, _ width: CGFloat = 6) {
    ctx.beginPath(); ctx.move(to: CGPoint(x: points[0].0, y: points[0].1))
    for p in points.dropFirst() { ctx.addLine(to: CGPoint(x: p.0, y: p.1)) }
    ctx.closePath(); ctx.setFillColor(color(fill)); ctx.setStrokeColor(color(stroke)); ctx.setLineWidth(width); ctx.drawPath(using: .fillStroke)
}
func rect(_ x: CGFloat, _ y: CGFloat, _ w: CGFloat, _ h: CGFloat, _ fill: UInt32, _ stroke: Bool = false) {
    ctx.setFillColor(color(fill)); ctx.fill(CGRect(x: x, y: y, width: w, height: h))
    if stroke { ctx.setStrokeColor(color(ink)); ctx.setLineWidth(6); ctx.stroke(CGRect(x: x, y: y, width: w, height: h)) }
}
polygon([(71,174),(85,180),(85,215),(57,215),(57,195),(71,195)],0x326a4c)
polygon([(169,174),(155,180),(155,215),(183,215),(183,195),(169,195)],0x326a4c)
rect(27,112,22,57,0x88ae64,true); rect(191,112,22,57,0x88ae64,true)
polygon([(58,62),(182,62),(182,79),(200,79),(200,175),(182,175),(182,192),(58,192),(58,175),(40,175),(40,79),(58,79)],0xb9d989)
rect(60,84,120,65,0xeaf2bf,true); rect(77,103,14,20,ink); rect(149,103,14,20,ink)
ctx.setStrokeColor(color(ink)); ctx.setLineWidth(6); ctx.beginPath(); ctx.move(to: CGPoint(x: 107,y: 122)); ctx.addLine(to: CGPoint(x: 107,y: 130));ctx.addLine(to: CGPoint(x: 133,y: 130));ctx.addLine(to: CGPoint(x: 133,y: 122));ctx.strokePath()
ctx.setStrokeColor(color(0x7b9f59));ctx.beginPath();ctx.move(to: CGPoint(x:83,y:162));ctx.addLine(to: CGPoint(x:156,y:162));ctx.strokePath()
ctx.setStrokeColor(color(ink));ctx.beginPath();ctx.move(to: CGPoint(x:120,y:61));ctx.addLine(to: CGPoint(x:120,y:30));ctx.strokePath()
ctx.beginPath();ctx.move(to: CGPoint(x:120,y:17));ctx.addCurve(to: CGPoint(x:146,y:17),control1:CGPoint(x:128,y:-1),control2:CGPoint(x:149,y:5));ctx.addCurve(to: CGPoint(x:120,y:39),control1:CGPoint(x:143,y:27),control2:CGPoint(x:128,y:34));ctx.addCurve(to: CGPoint(x:94,y:17),control1:CGPoint(x:112,y:34),control2:CGPoint(x:97,y:27));ctx.addCurve(to: CGPoint(x:120,y:17),control1:CGPoint(x:91,y:5),control2:CGPoint(x:112,y:-1));ctx.closePath();ctx.setFillColor(color(0xf49b80));ctx.setLineWidth(4);ctx.drawPath(using:.fillStroke)
let image = ctx.makeImage()!
for output in ["build/icon.png", "resources/icon.png"] {
 let destination = CGImageDestinationCreateWithURL(URL(fileURLWithPath: output) as CFURL, UTType.png.identifier as CFString, 1, nil)!
 CGImageDestinationAddImage(destination,image,nil)
 precondition(CGImageDestinationFinalize(destination))
}

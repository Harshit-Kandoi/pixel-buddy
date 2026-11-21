// mic-in-use: prints 1 if any app is using a microphone right now, else 0, then exits.
//
// Pixel Buddy's "Quiet during calls" on macOS runs this every 20 seconds. It only asks Core Audio
// whether input is running; it never opens the microphone or records anything, so it needs no
// microphone permission.
//
// macOS 14.2+: asks each audio client process whether it's capturing input (the same signal as
// the orange microphone dot). Older macOS: whether any physical input-only device (built-in, USB,
// Bluetooth mic) is running. Virtual and aggregate devices are ignored, so loopback drivers and
// a headset that's only playing music don't count.
//
// Build: scripts/build-mac-helper.sh (universal arm64 + x86_64, macOS 12+).

import CoreAudio

func address(_ selector: AudioObjectPropertySelector, _ scope: AudioObjectPropertyScope = kAudioObjectPropertyScopeGlobal) -> AudioObjectPropertyAddress {
  AudioObjectPropertyAddress(mSelector: selector, mScope: scope, mElement: kAudioObjectPropertyElementMain)
}

func readUInt32(_ object: AudioObjectID, _ selector: AudioObjectPropertySelector, _ scope: AudioObjectPropertyScope = kAudioObjectPropertyScopeGlobal) -> UInt32? {
  var addr = address(selector, scope)
  var value: UInt32 = 0
  var size = UInt32(MemoryLayout<UInt32>.size)
  return AudioObjectGetPropertyData(object, &addr, 0, nil, &size, &value) == noErr ? value : nil
}

func readObjects(_ object: AudioObjectID, _ selector: AudioObjectPropertySelector, _ scope: AudioObjectPropertyScope = kAudioObjectPropertyScopeGlobal) -> [AudioObjectID] {
  var addr = address(selector, scope)
  var size: UInt32 = 0
  guard AudioObjectGetPropertyDataSize(object, &addr, 0, nil, &size) == noErr, size > 0 else { return [] }
  var objects = [AudioObjectID](repeating: 0, count: Int(size) / MemoryLayout<AudioObjectID>.size)
  guard AudioObjectGetPropertyData(object, &addr, 0, nil, &size, &objects) == noErr else { return [] }
  return objects
}

let system = AudioObjectID(kAudioObjectSystemObject)

func anyProcessCapturing() -> Bool? {
  guard #available(macOS 14.2, *) else { return nil }
  let processes = readObjects(system, kAudioHardwarePropertyProcessObjectList)
  if processes.isEmpty { return nil }
  return processes.contains { readUInt32($0, kAudioProcessPropertyIsRunningInput) == 1 }
}

func anyMicrophoneRunning() -> Bool {
  readObjects(system, kAudioHardwarePropertyDevices).contains { device in
    let transport = readUInt32(device, kAudioDevicePropertyTransportType) ?? 0
    if transport == kAudioDeviceTransportTypeVirtual || transport == kAudioDeviceTransportTypeAggregate { return false }
    let hasInput = !readObjects(device, kAudioDevicePropertyStreams, kAudioObjectPropertyScopeInput).isEmpty
    let hasOutput = !readObjects(device, kAudioDevicePropertyStreams, kAudioObjectPropertyScopeOutput).isEmpty
    // A device that also plays sound (a headset) runs for music too, so only input-only devices count here.
    guard hasInput && !hasOutput else { return false }
    return readUInt32(device, kAudioDevicePropertyDeviceIsRunningSomewhere) == 1
  }
}

print((anyProcessCapturing() ?? anyMicrophoneRunning()) ? "1" : "0")

import AVFoundation
import React

@objc(CallSounds)
class CallSoundsModule: NSObject {
  private var activeKey: String?
  private var engine: AVAudioEngine?
  private var player: AVAudioPlayerNode?
  private var savedCategory: AVAudioSession.Category?
  private var savedMode: AVAudioSession.Mode = .default
  private var savedOptions: AVAudioSession.CategoryOptions = []
  private var timeout: DispatchWorkItem?

  @objc
  static func requiresMainQueueSetup() -> Bool { false }

  @objc(start:incoming:speaker:resolver:rejecter:)
  func start(
    _ key: String,
    incoming: Bool,
    speaker: Bool,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.main.async {
      do {
        self.stopInternal()
        let session = AVAudioSession.sharedInstance()
        self.savedCategory = session.category
        self.savedMode = session.mode
        self.savedOptions = session.categoryOptions
        try session.setCategory(.ambient, mode: .default, options: [])
        try session.setActive(true)

        let audioEngine = AVAudioEngine()
        let audioPlayer = AVAudioPlayerNode()
        let format = AVAudioFormat(standardFormatWithSampleRate: 44100, channels: 1)!
        let buffer = try self.makeRingBuffer(incoming: incoming, format: format)
        audioEngine.attach(audioPlayer)
        audioEngine.connect(audioPlayer, to: audioEngine.mainMixerNode, format: format)
        try audioEngine.start()
        audioPlayer.scheduleBuffer(buffer, at: nil, options: .loops)
        audioPlayer.play()

        self.activeKey = key
        self.engine = audioEngine
        self.player = audioPlayer
        let stopAfterTimeout = DispatchWorkItem { [weak self] in
          if self?.activeKey == key { self?.stopInternal() }
        }
        self.timeout = stopAfterTimeout
        DispatchQueue.main.asyncAfter(deadline: .now() + 60, execute: stopAfterTimeout)
        resolve(true)
      } catch {
        self.stopInternal()
        reject("CALL_SOUND", "Unable to play the call sound", error)
      }
    }
  }

  @objc(stop:resolver:rejecter:)
  func stop(
    _ key: String,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.main.async {
      if self.activeKey == key { self.stopInternal() }
      resolve(nil)
    }
  }

  private func makeRingBuffer(incoming: Bool, format: AVAudioFormat) throws -> AVAudioPCMBuffer {
    let sampleRate = format.sampleRate
    let duration = incoming ? 4.5 : 6.0
    let frameCount = AVAudioFrameCount(sampleRate * duration)
    guard let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frameCount),
      let samples = buffer.floatChannelData?[0] else {
      throw NSError(domain: "CallSounds", code: 1)
    }
    buffer.frameLength = frameCount

    for frame in 0..<Int(frameCount) {
      let time = Double(frame) / sampleRate
      let toneTime: Double?
      if incoming && time < 0.5 {
        toneTime = time
      } else if incoming && time >= 0.8 && time < 1.3 {
        toneTime = time - 0.8
      } else if !incoming && time < 1.7 {
        toneTime = time
      } else {
        toneTime = nil
      }

      guard let toneTime else {
        samples[frame] = 0
        continue
      }
      let edge = min(toneTime, 0.5 - toneTime)
      let envelope = min(1, max(0, edge / 0.025))
      samples[frame] = Float(
        (sin(2 * .pi * 440 * toneTime) + sin(2 * .pi * 480 * toneTime)) * 0.09 * envelope
      )
    }
    return buffer
  }

  private func stopInternal() {
    timeout?.cancel()
    timeout = nil
    player?.stop()
    player = nil
    engine?.stop()
    engine = nil
    activeKey = nil

    guard let savedCategory else { return }
    let session = AVAudioSession.sharedInstance()
    try? session.setActive(false, options: .notifyOthersOnDeactivation)
    try? session.setCategory(savedCategory, mode: savedMode, options: savedOptions)
    self.savedCategory = nil
  }
}
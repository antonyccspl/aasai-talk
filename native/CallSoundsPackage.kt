package com.anonymous.aasaitalk

import android.content.Context
import android.media.*
import android.os.Build
import android.os.Handler
import android.os.Looper
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.*
import com.facebook.react.uimanager.ViewManager

class CallSoundsPackage : ReactPackage {
  override fun createNativeModules(context: ReactApplicationContext): List<NativeModule> = listOf(CallSoundsModule(context))
  override fun createViewManagers(context: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}

@Suppress("DEPRECATION")
class CallSoundsModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context), LifecycleEventListener {
  private val handler = Handler(Looper.getMainLooper())
  private val audio = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
  private var owner: String? = null
  private var tone: ToneGenerator? = null
  private var ringtone: Ringtone? = null
  private var savedMode: Int? = null
  private var savedSpeaker = false
  private var focus: AudioFocusRequest? = null
  private val focusListener = AudioManager.OnAudioFocusChangeListener { change ->
    if (change < 0) handler.post { stopInternal() }
  }
  init { context.addLifecycleEventListener(this) }
  override fun getName() = "CallSounds"

  private fun stopInternal() {
    handler.removeCallbacksAndMessages(null)
    ringtone?.stop(); ringtone = null
    tone?.stopTone(); tone?.release(); tone = null
    if (Build.VERSION.SDK_INT >= 26) focus?.let { audio.abandonAudioFocusRequest(it) }
    else audio.abandonAudioFocus(focusListener)
    focus = null
    savedMode?.let {
      if (Build.VERSION.SDK_INT >= 31) audio.clearCommunicationDevice()
      else audio.isSpeakerphoneOn = savedSpeaker
      audio.mode = it
    }
    savedMode = null
    owner = null
  }

  @ReactMethod
  fun start(key: String, incoming: Boolean, speaker: Boolean, promise: Promise) {
    handler.post {
      try {
        stopInternal()
        owner = key
        val usage = if (incoming) AudioAttributes.USAGE_NOTIFICATION_RINGTONE else AudioAttributes.USAGE_VOICE_COMMUNICATION_SIGNALLING
        val attrs = AudioAttributes.Builder().setUsage(usage).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build()
        val granted = if (Build.VERSION.SDK_INT >= 26) {
          val request = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
            .setAudioAttributes(attrs).setOnAudioFocusChangeListener(focusListener, handler).build()
          focus = request
          audio.requestAudioFocus(request)
        } else audio.requestAudioFocus(focusListener, if (incoming) AudioManager.STREAM_RING else AudioManager.STREAM_VOICE_CALL, AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
        if (granted != AudioManager.AUDIOFOCUS_REQUEST_GRANTED) {
          stopInternal(); promise.resolve(false); return@post
        }
        if (incoming) {
          // Never override silent mode, user-selected silent ringtone, or ring volume.
          if (audio.ringerMode != AudioManager.RINGER_MODE_NORMAL || audio.getStreamVolume(AudioManager.STREAM_RING) == 0) {
            stopInternal(); promise.resolve(false); return@post
          }
          val uri = RingtoneManager.getActualDefaultRingtoneUri(context, RingtoneManager.TYPE_RINGTONE)
          if (uri == null) { stopInternal(); promise.resolve(false); return@post }
          ringtone = RingtoneManager.getRingtone(context, uri)
          ringtone?.audioAttributes = attrs
          if (Build.VERSION.SDK_INT >= 28) ringtone?.isLooping = true
          ringtone?.play()
          if (Build.VERSION.SDK_INT < 28) {
            val repeat = object : Runnable {
              override fun run() {
                if (owner != key) return
                if (ringtone?.isPlaying == false) ringtone?.play()
                handler.postDelayed(this, 1000)
              }
            }
            handler.postDelayed(repeat, 1000)
          }
        } else {
          savedMode = audio.mode; savedSpeaker = audio.isSpeakerphoneOn
          audio.mode = AudioManager.MODE_IN_COMMUNICATION
          if (Build.VERSION.SDK_INT >= 31) {
            val target = if (speaker) AudioDeviceInfo.TYPE_BUILTIN_SPEAKER else AudioDeviceInfo.TYPE_BUILTIN_EARPIECE
            audio.availableCommunicationDevices.firstOrNull { it.type == target }?.let { audio.setCommunicationDevice(it) }
          } else audio.isSpeakerphoneOn = speaker
          tone = ToneGenerator(AudioManager.STREAM_VOICE_CALL, 70)
          tone?.startTone(ToneGenerator.TONE_SUP_RINGTONE)
        }
        // Safety cutoff even if JavaScript disconnects during development.
        handler.postDelayed({ if (owner == key) stopInternal() }, 60000)
        promise.resolve(true)
      } catch (error: Exception) {
        stopInternal(); promise.reject("CALL_SOUND", "Unable to play call sound", error)
      }
    }
  }

  @ReactMethod
  fun stop(key: String, promise: Promise) {
    handler.post { if (owner == key) stopInternal(); promise.resolve(null) }
  }
  override fun onHostResume() {}
  override fun onHostPause() { handler.post { stopInternal() } }
  override fun onHostDestroy() { handler.post { stopInternal() } }
  override fun invalidate() {
    context.removeLifecycleEventListener(this)
    handler.post { stopInternal() }
    super.invalidate()
  }
}

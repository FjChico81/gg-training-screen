// Countdown cues use the ambient audio session so other apps can keep playing.
globalThis.countdownAudio = {
 prepare() {
  try {
   if (navigator.audioSession && navigator.audioSession.type !== 'ambient') {
    navigator.audioSession.type = 'ambient';
   }
  } catch { /* Some browsers do not expose an audio session. */ }
 }
};

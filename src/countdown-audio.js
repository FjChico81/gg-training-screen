// Let the platform mix other media between cues and prioritize each countdown tone.
globalThis.countdownAudio = (() => {
 let activeTones = 0;
 function setType(type) {
  try {
   if (navigator.audioSession) navigator.audioSession.type = type;
  } catch { /* Browsers can decline optional audio session types. */ }
 }
 return {
  prepare() {
   if (!activeTones) setType('ambient');
  },
  prioritize(oscillator) {
   activeTones++;
   setType('transient');
   oscillator.addEventListener('ended', () => {
    if (--activeTones === 0) setType('ambient');
   }, {once: true});
  }
 };
})();

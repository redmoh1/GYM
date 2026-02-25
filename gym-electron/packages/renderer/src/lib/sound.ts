export function playCheckinTone(result: 'ALLOW' | 'DENY' | 'UNKNOWN'): void {
  const AudioCtx = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return;
  const context = new AudioCtx();
  const now = context.currentTime;

  const beep = (offset: number, frequency: number, duration: number) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, now + offset);
    gain.gain.exponentialRampToValueAtTime(0.15, now + offset + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + duration);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(now + offset);
    oscillator.stop(now + offset + duration);
  };

  if (result === 'ALLOW') {
    beep(0, 860, 0.16);
  } else if (result === 'DENY') {
    beep(0, 280, 0.16);
    beep(0.2, 240, 0.18);
  } else {
    beep(0, 520, 0.12);
  }

  window.setTimeout(() => {
    void context.close();
  }, 700);
}


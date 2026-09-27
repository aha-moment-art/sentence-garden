// Short press/release transients and a low body tone give each key a mechanical click.
// Generated locally: no downloads, microphone access, or speech-generation calls.
export class KeyboardSound {
  private context: AudioContext | null = null;
  private noise: AudioBuffer | null = null;
  play() {
    try {
      const ctx = (this.context ??= new AudioContext());
      if (ctx.state === "suspended") void ctx.resume().catch(() => {});
      if (!this.noise) {
        this.noise = ctx.createBuffer(
          1,
          Math.ceil(ctx.sampleRate * 0.045),
          ctx.sampleRate,
        );
        const samples = this.noise.getChannelData(0);
        for (let i = 0; i < samples.length; i++)
          samples[i] = Math.random() * 2 - 1;
      }
      const now = ctx.currentTime,
        pitch = 0.9 + Math.random() * 0.2;
      const master = ctx.createGain();
      master.gain.value = 0.22;
      master.connect(ctx.destination);
      for (const [offset, level, length] of [
        [0, 0.75, 0.022],
        [0.027, 0.3, 0.018],
      ]) {
        const source = ctx.createBufferSource(),
          filter = ctx.createBiquadFilter(),
          gain = ctx.createGain();
        source.buffer = this.noise;
        source.playbackRate.value = pitch;
        filter.type = "bandpass";
        filter.frequency.value = offset ? 2900 : 1800;
        filter.Q.value = 0.7;
        gain.gain.setValueAtTime(level, now + offset);
        gain.gain.exponentialRampToValueAtTime(0.001, now + offset + length);
        source.connect(filter);
        filter.connect(gain);
        gain.connect(master);
        source.start(now + offset);
        source.stop(now + offset + length);
        source.onended = () => {
          source.disconnect();
          filter.disconnect();
          gain.disconnect();
        };
      }
      const body = ctx.createOscillator(),
        envelope = ctx.createGain();
      body.type = "triangle";
      body.frequency.setValueAtTime(190 * pitch, now);
      body.frequency.exponentialRampToValueAtTime(85, now + 0.035);
      envelope.gain.setValueAtTime(0.35, now);
      envelope.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
      body.connect(envelope);
      envelope.connect(master);
      body.start(now);
      body.stop(now + 0.055);
      body.onended = () => {
        body.disconnect();
        envelope.disconnect();
        master.disconnect();
      };
    } catch {
      /* Typing remains available if Web Audio is unavailable. */
    }
  }
  close() {
    void this.context?.close().catch(() => {});
    this.context = null;
    this.noise = null;
  }
}

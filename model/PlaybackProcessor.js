// @ts-check

const FRAMES_PER_QUANTUM = 128;

/**
 * An AudioWorkletProcessor that plays back a given audio buffer in a loop.
 * The loop region can be controlled by k-rate AudioParams.
 *
 * @class PlaybackProcessor
 * @extends AudioWorkletProcessor
 */
class PlaybackProcessor extends AudioWorkletProcessor {
  /** @type {Float32Array} */
  #leftBuffer = new Float32Array(0);
  /** @type {Float32Array} */
  #rightBuffer = new Float32Array(0);

  /** @type {number} The `currentFrame` when playback should start. */
  #startFrame = -1;
  /** @type {number} The current position within our source audio buffer, in frames. */
  #playheadFrame = 0;

  constructor() {
    super();
    this.port.onmessage = this.#handleMessage.bind(this);
  }

  static get parameterDescriptors() {
    return [
      {
        name: 'loopStart',
        defaultValue: 0,
        minValue: 0,
        automationRate: 'k-rate'
      },
      {
        name: 'loopDuration',
        defaultValue: 0,
        minValue: 0,
        automationRate: 'k-rate'
      }
    ];
  }

  /**
   * @param {MessageEvent} event
   */
  #handleMessage(event) {
    const { type, data } = event.data;
    if (type === 'set_buffers') {
      this.#leftBuffer = data.left;
      this.#rightBuffer = data.right;
    } else if (type === 'start') {
      this.#startFrame = data.startFrame;
      this.#playheadFrame = 0; // Reset playhead on start
    }
  }

  /**
   * @param {Float32Array[][]} inputs
   * @param {Float32Array[][]} outputs
   * @param {Record<string, Float32Array>} parameters
   * @returns {boolean}
   */
  process(inputs, outputs, parameters) {
    // Don't run if we haven't been started or have no buffers.
    if (this.#startFrame === -1 || this.#leftBuffer.length === 0) {
      return true;
    }

    // Wait until it's time to start.
    if (currentFrame < this.#startFrame) {
      return true;
    }

    const loopStartSeconds = parameters.loopStart[0];
    const loopDurationSeconds = parameters.loopDuration[0];

    const loopStartFrame = Math.floor(loopStartSeconds * sampleRate);
    let loopEndFrame;

    if (loopDurationSeconds > 0) {
      loopEndFrame = loopStartFrame + Math.floor(loopDurationSeconds * sampleRate);
    } else {
      // If loop duration is 0, use the full buffer length.
      loopEndFrame = this.#leftBuffer.length;
    }

    // Ensure loop points are within buffer bounds.
    const effectiveLoopStart = Math.max(0, Math.min(loopStartFrame, this.#leftBuffer.length));
    const effectiveLoopEnd = Math.max(effectiveLoopStart, Math.min(loopEndFrame, this.#leftBuffer.length));
    const effectiveLoopDuration = effectiveLoopEnd - effectiveLoopStart;

    if (effectiveLoopDuration <= 0) return true; // Nothing to play.

    for (const output of outputs) {
      const leftChannel = output[0];
      const rightChannel = output.length > 1 ? output[1] : null;

      for (let i = 0; i < FRAMES_PER_QUANTUM; i++) {
        const bufferFrameIndex = effectiveLoopStart + (this.#playheadFrame % effectiveLoopDuration);

        leftChannel[i] = this.#leftBuffer[bufferFrameIndex] || 0;
        if (rightChannel) {
          rightChannel[i] = this.#rightBuffer[bufferFrameIndex] || 0;
        }
        this.#playheadFrame++;
      }
    }

    return true;
  }
}

registerProcessor('playback-processor', PlaybackProcessor);
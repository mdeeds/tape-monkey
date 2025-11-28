// @ts-check

const FIVE_MINUTES_IN_SECONDS = 5 * 60;

/**
 * Represents a single audio track with pre-allocated buffers and analysis capabilities.
 */
export class Track {
  /** @type {Float32Array[]} */
  #buffers;
  /** @type {number} */
  #sampleRate;
  /** @type {number} */
  #bufferLength;

  // Analysis properties
  /** @type {number} */
  rms = 0;
  /** @type {number} */
  peak = 0;
  /** @type {number} */
  crossChannelCorrelation = 0;

  /**
   * @param {number} sampleRate The sample rate of the audio context.
   */
  constructor(sampleRate) {
    this.#sampleRate = sampleRate;
    this.#bufferLength = sampleRate * FIVE_MINUTES_IN_SECONDS;

    // Pre-allocate buffers for 5 minutes of stereo audio
    this.#buffers = [
      new Float32Array(this.#bufferLength),
      new Float32Array(this.#bufferLength),
    ];
  }

  /**
   * Writes audio data into the track's buffers at a specific frame offset.
   * @param {Float32Array} leftData The left channel audio data.
   * @param {Float32Array} rightData The right channel audio data.
   * @param {number} startFrame The frame number where the write should begin.
   */
  write(leftData, rightData, startFrame) {
    if (startFrame < 0) {
      console.warn('Attempted to write with a negative startFrame.');
      return;
    }

    const endFrame = startFrame + leftData.length;
    if (endFrame > this.#bufferLength) {
      console.warn('Recording exceeds the 5-minute track limit. Truncating data.');
      const framesToWrite = this.#bufferLength - startFrame;
      if (framesToWrite <= 0) return;

      this.#buffers[0].set(leftData.subarray(0, framesToWrite), startFrame);
      this.#buffers[1].set(rightData.subarray(0, framesToWrite), startFrame);
    } else {
      this.#buffers[0].set(leftData, startFrame);
      this.#buffers[1].set(rightData, startFrame);
    }

    this.#analyze(leftData, rightData);
  }

  /**
   * Performs analysis on the incoming chunk of audio data.
   * @private
   * @param {Float32Array} leftData
   * @param {Float32Array} rightData
   */
  #analyze(leftData, rightData) {
    let sumOfSquares = 0;
    let peak = this.peak;
    let crossCorrelationSum = 0;

    const n = leftData.length;
    if (n === 0) return;

    for (let i = 0; i < n; i++) {
      const leftSample = leftData[i];
      const rightSample = rightData[i];

      sumOfSquares += leftSample * leftSample + rightSample * rightSample;

      const absLeft = Math.abs(leftSample);
      const absRight = Math.abs(rightSample);

      if (absLeft > peak) peak = absLeft;
      if (absRight > peak) peak = absRight;

      crossCorrelationSum += leftSample * rightSample;
    }

    // Update RMS. This is a running average of the power of the new chunk, not the whole track.
    // For a simple level meter, this is often sufficient.
    this.rms = Math.sqrt(sumOfSquares / (2 * n));

    // Update peak
    this.peak = peak;

    // Update Cross-Channel Correlation
    this.crossChannelCorrelation = crossCorrelationSum / n;
  }

  /**
   * @returns {Float32Array[]} The stereo audio buffers.
   */
  get buffers() {
    return this.#buffers;
  }

  /**
   * Creates an AudioBufferSourceNode for a specific time range of the track.
   * @param {AudioContext} audioContext The audio context to create the node in.
   * @param {number} startTime The start time in seconds within the track.
   * @param {number} endTime The end time in seconds within the track.
   * @param {boolean} loop Whether the created source node should loop.
   * @returns {AudioBufferSourceNode | null} An AudioBufferSourceNode or null if the track is empty in that range.
   */
  createSourceNode(audioContext, startTime, endTime, loop) {
    const startFrame = Math.floor(startTime * this.#sampleRate);
    const endFrame = Math.ceil(endTime * this.#sampleRate);
    const durationFrames = endFrame - startFrame;

    if (durationFrames <= 0) {
      return null;
    }

    const audioBuffer = audioContext.createBuffer(2, durationFrames, this.#sampleRate);
    audioBuffer.copyToChannel(this.#buffers[0].subarray(startFrame, endFrame), 0);
    audioBuffer.copyToChannel(this.#buffers[1].subarray(startFrame, endFrame), 1);

    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.loop = loop;

    return source;
  }
}
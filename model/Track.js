// @ts-check

const FIVE_MINUTES_IN_SECONDS = 5 * 60;

/**
 * Represents a single audio track with pre-allocated buffers and analysis capabilities.
 */
export class Track {
  /** @type {AudioBuffer} */
  #audioBuffer;
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
   * @param {AudioContext} audioContext The audio context.
   * @param {number} sampleRate The sample rate of the audio context.
   */
  constructor(audioContext, sampleRate) {
    this.#sampleRate = sampleRate;
    this.#bufferLength = sampleRate * FIVE_MINUTES_IN_SECONDS;

    // Pre-allocate buffers for 5 minutes of stereo audio
    this.#audioBuffer =
      audioContext.createBuffer(2, this.#bufferLength, this.#sampleRate);
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

      // Create a new Float32Array to satisfy the strict type checking for copyToChannel.
      this.#audioBuffer.copyToChannel(new Float32Array(leftData.subarray(0, framesToWrite)), 0, startFrame);
      this.#audioBuffer.copyToChannel(new Float32Array(rightData.subarray(0, framesToWrite)), 1, startFrame);
    } else {
      // Create a new Float32Array to satisfy the strict type checking for copyToChannel.
      this.#audioBuffer.copyToChannel(new Float32Array(leftData), 0, startFrame);
      this.#audioBuffer.copyToChannel(new Float32Array(rightData), 1, startFrame);
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
   * Creates an AudioBufferSourceNode that is ready to play the track's content.
   * The caller is responsible for calling `start(when, offset, duration)`.
   * @param {AudioContext} audioContext The audio context to create the node in.
   * @param {boolean} loop Whether the created source node should loop.
   * @returns {AudioBufferSourceNode} An AudioBufferSourceNode.
   */
  createSourceNode(audioContext, loop) {
    const source = audioContext.createBufferSource();
    source.buffer = this.#audioBuffer;
    source.loop = loop;

    if (loop) {
      // If looping, we need to specify the loop start and end points in seconds.
      source.loopStart = 0;
      source.loopEnd = this.#bufferLength / this.#sampleRate;
    }
    return source;
  }
}
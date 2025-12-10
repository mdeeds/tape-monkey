// @ts-check

const PLAYBACK_PROCESSOR_PATH = 'model/PlaybackProcessor.js';
const FIVE_MINUTES_IN_SECONDS = 5 * 60;

/**
 * Represents a single audio track with pre-allocated buffers and analysis capabilities.
 */
export class Track {
  /** @type {AudioBuffer} */
  #audioBuffer;
  /** @type {AudioContext} */
  #audioContext;
  /** @type {number} */
  #sampleRate;
  /** @type {number} */
  #bufferLength;
  /** @type {AudioWorkletNode} */
  #playbackNode;
  /** @type {GainNode} */
  #outputNode;

  // Analysis properties
  /** @type {number} RMS for left channel in dB. */
  rmsLeftDb = -Infinity;
  /** @type {number} Peak for left channel in dB. */
  peakLeftDb = -Infinity;
  /** @type {number} RMS for right channel in dB. */
  rmsRightDb = -Infinity;
  /** @type {number} Peak for right channel in dB. */
  peakRightDb = -Infinity;
  /** @type {number} */
  crossChannelCorrelation = 0;
  /** @type {Worker} */
  #statsWorker;
  /** @type {number} */
  #statsMinFrame = Infinity;
  /** @type {number} */
  #statsMaxFrame = -Infinity;
  /** @type {((value: any) => void) | null} */
  #statsPromiseResolver = null;

  /**
   * Asynchronously creates and initializes a Track instance.
   * @param {AudioContext} audioContext The audio context.
   * @returns {Promise<Track>}
   */
  static async create(audioContext) {
    await audioContext.audioWorklet.addModule(PLAYBACK_PROCESSOR_PATH);
    return new Track(audioContext);
  }

  /**
   * @private
   * @param {AudioContext} audioContext The audio context.
   */
  constructor(audioContext) {
    this.#audioContext = audioContext;
    this.#sampleRate = audioContext.sampleRate;
    this.#bufferLength = this.#sampleRate * FIVE_MINUTES_IN_SECONDS;

    // Pre-allocate buffers for 5 minutes of stereo audio
    this.#audioBuffer =
      this.#audioContext.createBuffer(2, this.#bufferLength, this.#sampleRate);

    this.#playbackNode = new AudioWorkletNode(this.#audioContext, 'playback-processor', {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [2]
    });
    this.#outputNode = this.#audioContext.createGain();
    this.#playbackNode.connect(this.#outputNode);

    // Initialize the web worker for track statistics
    this.#statsWorker = new Worker(new URL('./TrackStats.js', import.meta.url), { type: 'module' });
    this.#statsWorker.onmessage = this.#handleStatsWorkerMessage.bind(this);
    this.#statsWorker.onerror = this.#handleStatsWorkerError.bind(this);
  }

  /**
   * Connects the track's output to another AudioNode.
   * @param {AudioNode} destination 
   */
  connect(destination) {
    this.#outputNode.connect(destination);
  }

  /**
  * Asynchronously creates and initializes a Track instance.
   * @param {AudioContext} audioContext The audio context.
   * @returns {Promise<Track>}
   */
  static async create(audioContext) {
    await audioContext.audioWorklet.addModule(PLAYBACK_PROCESSOR_PATH);
    return new Track(audioContext);
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

    // Mark the written region as dirty for the next stats calculation.
    this.#statsMinFrame = Math.min(this.#statsMinFrame, startFrame);
    this.#statsMaxFrame = Math.max(this.#statsMaxFrame, endFrame);
  }

  /**
   * Sends the current audio buffer to the playback processor.
   */
  update() {
    // We need to send copies because the AudioWorkletProcessor will take ownership
    const left = this.#audioBuffer.getChannelData(0).slice();
    const right = this.#audioBuffer.getChannelData(1).slice();

    this.#playbackNode.port.postMessage({
      type: 'set_buffers',
      data: { left, right }
    }, [left.buffer, right.buffer]);
  }

  /**
   * Starts playback at a specific time.
   * @param {number} startFrame The audio context frame to start playback.
   * @param {number} tapeStartTime The offset within the track to start playing from.
   * @param {number} tapeEndTime The offset within the track to start playing from.
   * @param {boolean} loop Whether to loop playback.
   */
  play(startFrame, tapeStartTime, tapeEndTime, loop) {
    this.#playbackNode.parameters.get('loopStart').value = tapeStartTime;
    // If not looping, set duration to a very large number to play to the end.
    // A value of 0 means use the full buffer.
    this.#playbackNode.parameters.get('loopDuration').value = tapeEndTime - tapeStartTime;

    this.#playbackNode.port.postMessage({ type: 'start', data: { startFrame, loop } });
  }

  /**
   * Sets the latency compensation for the track.
   * @param {number} seconds The latency compensation in seconds.
   */
  setLatencyCompensation(seconds) {
    const latencyParam = this.#playbackNode.parameters.get('latencyCompensation');
    if (latencyParam) {
      latencyParam.value = seconds;
    }
  }

  /**
   * Stops playback.
   */
  stop() {
    this.#playbackNode.port.postMessage({ type: 'stop' });
  }

  /**
   * Calculates and returns the latest track statistics for the modified regions.
   * @returns {Promise<{rmsLeftDb: number, peakLeftDb: number, rmsRightDb: number, peakRightDb: number, crossChannelCorrelation: number}>}
   */
  async getStats() {
    if (this.#statsMinFrame > this.#statsMaxFrame) {
      // No new data, return current stats
      return {
        rmsLeftDb: this.rmsLeftDb,
        peakLeftDb: this.peakLeftDb,
        rmsRightDb: this.rmsRightDb,
        peakRightDb: this.peakRightDb,
        crossChannelCorrelation: this.crossChannelCorrelation,
      };
    }

    const statsLength = this.#statsMaxFrame - this.#statsMinFrame;
    if (statsLength <= 0) {
      return this; // Should not happen, but good practice
    }

    // Extract the dirty region from the audio buffer
    const leftData = this.#audioBuffer.getChannelData(0).subarray(this.#statsMinFrame, this.#statsMaxFrame);
    const rightData = this.#audioBuffer.getChannelData(1).subarray(this.#statsMinFrame, this.#statsMaxFrame);

    // Reset dirty region trackers
    this.#statsMinFrame = Infinity;
    this.#statsMaxFrame = -Infinity;

    return new Promise((resolve) => {
      this.#statsPromiseResolver = resolve;
      // Post data to worker for calculation. We need to copy the data because it's being transferred.
      const leftDataForWorker = new Float32Array(leftData);
      const rightDataForWorker = new Float32Array(rightData);
      this.#statsWorker.postMessage({
        left: leftDataForWorker,
        right: rightDataForWorker
      }, [leftDataForWorker.buffer, rightDataForWorker.buffer]);
    });
  }

  /**
   * Handles messages received from the stats web worker.
   * @private
   * @param {MessageEvent<{rmsLeftDb: number, peakLeftDb: number, rmsRightDb: number, peakRightDb: number, crossChannelCorrelation: number}>} event
   */
  #handleStatsWorkerMessage(event) {
    const { rmsLeftDb, peakLeftDb, rmsRightDb, peakRightDb, crossChannelCorrelation } = event.data;
    this.rmsLeftDb = rmsLeftDb;
    this.peakLeftDb = peakLeftDb;
    this.rmsRightDb = rmsRightDb;
    this.peakRightDb = peakRightDb;
    this.crossChannelCorrelation = crossChannelCorrelation;

    if (this.#statsPromiseResolver) {
      this.#statsPromiseResolver(event.data);
      this.#statsPromiseResolver = null;
    }
  }

  /**
   * Handles errors from the stats web worker.
   * @private
   * @param {ErrorEvent} event
   */
  #handleStatsWorkerError(event) {
    console.error('TrackStats Worker error:', event);
  }

  /**
   * Terminates the web worker associated with this track.
   */
  terminateWorker() {
    this.#statsWorker.terminate();
  }
}
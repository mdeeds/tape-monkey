// @ts-check

import { Track } from './Track.js';
import { ToolHandler } from '../controller/ToolHandler.js';

/**
 * Manages audio recording from an input stream into multiple tracks using an Audio Worklet.
 * @implements {ToolHandler}
 */
export class TapeDeckEngine extends ToolHandler {
  /** @type {AudioContext} */
  #audioContext;
  /** @type {MediaStream} */
  #audioStream;
  /** @type {AudioWorkletNode | null} */
  #workletNode = null;
  /** @type {Track[]} */
  #tracks = [];
  /** @type {number} */
  #activeTrack = 0;
  /** @type {boolean} */
  #isRecording = false;
  /** @type {number | null} */
  #recordingStartFrame = null;

  /**
   * The path to the audio worklet processor.
   * @type {string}
   */
  static WORKLET_PROCESSOR_PATH = 'recorder-worklet-processor.js';

  /**
   * Asynchronously creates and initializes a TapeDeckEngine instance.
   * @param {AudioContext} audioContext The global audio context.
   * @param {MediaStream} audioStream The user's audio input stream.
   * @returns {Promise<TapeDeckEngine>}
   */
  static async create(audioContext, audioStream) {
    const engine = new TapeDeckEngine(audioContext, audioStream);
    await engine.#initialize();
    return engine;
  }

  /**
   * @private
   * @param {AudioContext} audioContext The global audio context.
   * @param {MediaStream} audioStream The user's audio input stream.
   */
  constructor(audioContext, audioStream) {
    super();
    this.#audioContext = audioContext;
    this.#audioStream = audioStream;
    // Note: The constructor is private. Use the static `create` method instead.

    // Initialize 16 stereo tracks
    for (let i = 0; i < 16; i++) {
      this.#tracks.push(new Track(this.#audioContext.sampleRate));
    }
  }

  /**
   * @private
   * Loads the worklet and sets up the audio graph.
   */
  async #initialize() {
    try {
      await this.#audioContext.audioWorklet.addModule(TapeDeckEngine.WORKLET_PROCESSOR_PATH);
    } catch (e) {
      console.error(`Failed to load audio worklet at ${TapeDeckEngine.WORKLET_PROCESSOR_PATH}`, e);
      throw e;
    }

    const source = this.#audioContext.createMediaStreamSource(this.#audioStream);
    this.#workletNode = new AudioWorkletNode(this.#audioContext, 'recorder-worklet-processor');

    this.#workletNode.port.onmessage = (event) => {
      if (this.#isRecording) {
        this.#handleWorkletMessage(event);
      }
    };

    source.connect(this.#workletNode);
    // The worklet node does not need to be connected to the destination
    // if we are only using it for analysis/recording and not playback.
  }

  /**
   * Handles incoming sample data from the audio worklet.
   * @param {MessageEvent} event
   */
  #handleWorkletMessage(event) {
    if (!this.#isRecording || this.#recordingStartFrame === null) {
      return;
    }

    const { left, right, frameNumber } = event.data;
    const messageEndFrame = frameNumber + left.length;

    // Ignore messages that are entirely before our scheduled start time
    if (messageEndFrame < this.#recordingStartFrame) {
      return;
    }

    // Determine the precise start and end points for writing the data
    const writeStartFrameInMessage = Math.max(0, this.#recordingStartFrame - frameNumber);
    const writeEndFrameInMessage = left.length;

    // The frame in the track's buffer where we start writing
    const trackStartFrame = Math.max(0, frameNumber - this.#recordingStartFrame) + writeStartFrameInMessage;

    // Extract the relevant slice of the audio data
    const leftToWrite = left.subarray(writeStartFrameInMessage, writeEndFrameInMessage);
    const rightToWrite = right.subarray(writeStartFrameInMessage, writeEndFrameInMessage);

    const track = this.#tracks[this.#activeTrack];
    track.write(leftToWrite, rightToWrite, trackStartFrame);
  }

  /**
   * Starts recording on the currently active track.
   */
  startRecording() {
    const startDelayInSeconds = 0.050; // 50ms
    this.#recordingStartFrame = Math.round(this.#audioContext.currentTime * this.#audioContext.sampleRate) + Math.round(startDelayInSeconds * this.#audioContext.sampleRate);
    this.#isRecording = true;
  }

  /**
   * Checks if this handler can process the given tool.
   * @override
   * @param {string} toolName The name of the tool.
   * @returns {boolean} True if the tool can be handled, false otherwise.
   */
  canHandle(toolName) {
    return ['arm', 'play', 'record'].includes(toolName);
  }

  /**
   * Calls the specified tool with the given arguments.
   * @override
   * @param {string} toolName The name of the tool to call.
   * @param {object} args The arguments for the tool.
   * @returns {Promise<string|void>} A string result from the tool execution, or nothing.
   */
  async callTool(toolName, args) {
    switch (toolName) {
      case 'arm':
        this.#arm(args.track_number);
        break;
      case 'play':
        this.#play(args.sections);
        break;
      case 'record':
        this.#record(args.sections);
        break;
    }
  }

  #arm(trackNumber) {
    console.log(`Arming track ${trackNumber}`);
  }
  #play(sections) {
    console.log(`Playing sections: ${sections.join(', ')}`);
  }
  #record(sections) {
    console.log(`Recording sections: ${sections.join(', ')}`);
  }
}
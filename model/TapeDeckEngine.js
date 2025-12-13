// @ts-check

import { Track } from './Track.js';
import { ToolHandler } from '../controller/ToolHandler.js';
import { SongState } from './SongState.js';
import { MixerEngine } from './MixerEngine.js';
import { MetronomeEngine } from './MetronomeEngine.js';

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
  /** @type {SongState} */
  #songState;
  /** @type {MixerEngine} */
  #mixerEngine;
  /** @type {MetronomeEngine} */
  #metronomeEngine;

  /**
   * The path to the audio worklet processor.
   * @type {string}
   */
  static WORKLET_PROCESSOR_PATH = 'model/RecordingProcessor.js';

  /**
   * Asynchronously creates and initializes a TapeDeckEngine instance.
   * @param {AudioContext} audioContext The global audio context.
   * @param {MediaStream} audioStream The user's audio input stream.
   * @param {SongState} songState The application's song state.
   * @param {MixerEngine} mixerEngine The mixer engine.
   * @param {MetronomeEngine} metronomeEngine The metronome engine.
   * @returns {Promise<TapeDeckEngine>}
   */
  static async create(audioContext, audioStream, songState, mixerEngine, metronomeEngine) {
    const engine = new TapeDeckEngine(audioContext, audioStream, songState, mixerEngine, metronomeEngine);
    await engine.#initialize();
    return engine;
  }

  /**
   * @private
   * @param {AudioContext} audioContext The global audio context.
   * @param {MediaStream} audioStream The user's audio input stream.
   * @param {SongState} songState The application's song state.
   * @param {MixerEngine} mixerEngine The mixer engine.
   * @param {MetronomeEngine} metronomeEngine The metronome engine.
   */
  constructor(audioContext, audioStream, songState, mixerEngine, metronomeEngine) {
    if (!metronomeEngine) {
      throw new Error('Metronome engine is required.');
    }
    super();
    this.#audioContext = audioContext;
    this.#audioStream = audioStream;
    this.#songState = songState;
    this.#mixerEngine = mixerEngine;
    this.#metronomeEngine = metronomeEngine;
    // Note: The constructor is private. Use the static `create` method instead.
  }

  get tracks() {
    // Needed for UI to get track stats
    return this.#tracks;
  }

  /**
   * Loads the worklet and sets up the audio graph.
   */
  async #initialize() {
    try {
      // Initialize 16 stereo tracks
      const trackPromises = [];
      for (let i = 0; i < 16; i++) {
        trackPromises.push(Track.create(this.#audioContext));
      }
      this.#tracks = await Promise.all(trackPromises);
      this.#tracks.forEach((track, i) => track.connect(this.#mixerEngine.getChannelInput(i)));

      await this.#audioContext.audioWorklet.addModule(
        TapeDeckEngine.WORKLET_PROCESSOR_PATH);
    } catch (e) {
      console.error(
        `Failed to load audio worklet at ${TapeDeckEngine.WORKLET_PROCESSOR_PATH}`, e);
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
   * Stops recording on the currently active track.
   */
  stop() {
    if (this.#isRecording) {
      const activeTrack = this.#tracks[this.#activeTrack];
      activeTrack.update();
      this.#tracks[this.#activeTrack || 0].getStats()
        .then((stats) => { console.log(stats) });
    }

    this.#isRecording = false;
    this.#metronomeEngine.stop();
    this.#recordingStartFrame = null;
    for (const track of this.#tracks) {
      track.stop();
    }
  }

  /**
   * Checks if this handler can process the given tool.
   * @override
   * @param {string} toolName The name of the tool.
   * @returns {boolean} True if the tool can be handled, false otherwise.
   */
  canHandle(toolName) {
    return ['arm', 'play', 'record', 'stop', 'set_latency_compensation'].includes(toolName);
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
        this.#play(args.start_section, args.last_section, args.loop || false);
        break;
      case 'record':
        this.#record(args.start_section, args.last_section);
        break;
      case 'stop':
        this.stop();
        break;
      case 'set_latency_compensation':
        this.#setLatencyCompensation(args.seconds);
        break;
    }
  }

  /**
   * Calculates the start and end time for a range of song sections.
   * @param {string} startSectionName The name of the first section.
   * @param {string} [endSectionName] The name of the last section. If not provided, only the start section is used.
   * @returns {{startTime: number, endTime: number} | null} An object with the 
   * start and end times in seconds, or null if no valid sections are found.
   */
  #getSectionsTimeInterval(startSectionName, endSectionName) {
    if (!startSectionName) {
      return null;
    }

    const allSectionNames = this.#songState.sections.map(s => s.name);
    const startIndex = allSectionNames.indexOf(startSectionName);
    const endIndex = endSectionName ? allSectionNames.indexOf(endSectionName) : startIndex;

    if (startIndex === -1 || endIndex === -1 || startIndex > endIndex) {
      console.warn(`Invalid section range: from "${startSectionName}" to "${endSectionName}".`);
      return null;
    }

    const sectionsInRange = allSectionNames.slice(startIndex, endIndex + 1);

    const minStartTime = this.#songState.getSectionStartTime(sectionsInRange[0]);

    if (minStartTime === -1) {
      return null;
    }

    let maxEndTime = minStartTime;
    let currentEndTime = minStartTime;
    for (const sectionName of sectionsInRange) {
      const duration = this.#songState.getSectionDuration(sectionName);
      currentEndTime += duration;
    }
    maxEndTime = currentEndTime;

    return { startTime: minStartTime, endTime: maxEndTime };
  }

  /**
   * 
   * @param {number} trackNumber 
   */
  #arm(trackNumber) {
    console.log(`Arming track ${trackNumber}`);
    this.#activeTrack = trackNumber - 1;
  }

  /**
   * Sets the latency compensation for all tracks.
   * @param {number} seconds
   */
  #setLatencyCompensation(seconds) {
    for (const track of this.#tracks) {
      track.setLatencyCompensation(seconds);
    }
  }

  /**
   * 
   * @param {string} startSection 
   * @param {string | undefined} lastSection 
   * @param {boolean} loop 
   * @returns 
   */
  #play(startSection, lastSection, loop = false) {
    const startTime = this.#audioContext.currentTime + 0.05; // 50ms delay
    const startFrame = Math.round(startTime * this.#audioContext.sampleRate);
    this.#metronomeEngine.start(startFrame);

    const tapeInterval = this.#getSectionsTimeInterval(startSection, lastSection)
      || { startTime: 0, endTime: null };
    const tapeStartTime = tapeInterval.startTime;
    const tapeEndTime = tapeInterval.endTime;

    console.log(`Playing from ${startSection || 'start'} to ${lastSection || startSection} (${tapeStartTime}s to ${tapeEndTime}s)`);

    for (let i = 0; i < this.#tracks.length; i++) {
      const track = this.#tracks[i];
      track.play(startFrame, tapeStartTime, tapeEndTime, loop);
    }
  }

  /**
   * 
   * @param {string} startSection 
   * @param {string | undefined} lastSection 
   */
  #record(startSection, lastSection) {
    this.#play(startSection, lastSection);
    this.startRecording();
  }
}
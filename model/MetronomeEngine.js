// @ts-check

import { ToolHandler } from '../controller/ToolHandler.js';

/**
 * Manages the MetronomeProcessor, controlling its state and volume.
 * @implements {ToolHandler}
 */
export class MetronomeEngine extends ToolHandler {
  /** @type {AudioContext} */
  #audioContext;
  /** @type {import('./SongState.js').SongState} */
  #songState;
  /** @type {AudioWorkletNode | null} */
  #workletNode = null;
  /** @type {GainNode | null} */
  #gainNode = null;

  /**
   * The path to the audio worklet processor.
   * @type {string}
   */
  static WORKLET_PROCESSOR_PATH = 'model/MetronomeProcessor.js';

  /**
   * Asynchronously creates and initializes a MetronomeEngine instance.
   * @param {AudioContext} audioContext The global audio context.
   * @param {import('./SongState.js').SongState} songState The application's song state.
   * @returns {Promise<MetronomeEngine>}
   */
  static async create(audioContext, songState) {
    const engine = new MetronomeEngine(audioContext, songState);
    await engine.#initialize();
    return engine;
  }

  /**
   * @private
   * @param {AudioContext} audioContext The global audio context.
   * @param {import('./SongState.js').SongState} songState The application's song state.
   */
  constructor(audioContext, songState) {
    super();
    this.#audioContext = audioContext;
    this.#songState = songState;

    this.#songState.addEventListener('song-state-changed', this.#handleSongStateChange.bind(this));
  }

  /**
   * @private
   * Loads the worklet and sets up the audio graph.
   */
  async #initialize() {
    try {
      await this.#audioContext.audioWorklet.addModule(MetronomeEngine.WORKLET_PROCESSOR_PATH);
    } catch (e) {
      console.error(`Failed to load audio worklet at ${MetronomeEngine.WORKLET_PROCESSOR_PATH}`, e);
      throw e;
    }

    this.#workletNode = new AudioWorkletNode(this.#audioContext, 'metronome-processor');
    this.#gainNode = this.#audioContext.createGain();
    this.#gainNode.gain.value = 0; // Start with metronome off

    this.#workletNode.connect(this.#gainNode);
    this.#gainNode.connect(this.#audioContext.destination);

    this.#handleSongStateChange(); // Initial sync
  }

  /**
   * Updates the metronome processor with the latest song state.
   * @private
   */
  #handleSongStateChange() {
    console.log('Handling song state change.')
    if (!this.#workletNode) return;

    const bpm = this.#songState.bpm ?? 120;
    const beatsPerMeasure = this.#songState.beatsPerBar ?? 4;

    this.#workletNode.port.postMessage({
      type: 'update',
      value: { bpm, beatsPerMeasure }
    });
  }

  /**
   * @override
   */
  canHandle(toolName) {
    return ['set_metronome_properties'].includes(toolName);
  }

  /**
   * @override
   * @param {string} toolName
   * @param {object} args
   */
  async callTool(toolName, args) {
    switch (toolName) {
      case 'set_metronome_properties':
        this.#setVolume(args.volumeDB);
        break;
    }
  }

  /**
   * @param {number | undefined} volumeDB
   */
  #setVolume(volumeDB) {
    if (!this.#gainNode) throw new Error('Gain node is not initialized.');
    if (volumeDB === undefined) return;
    const gain = Math.pow(10, volumeDB / 20);
    this.#gainNode.gain.setValueAtTime(gain, this.#audioContext.currentTime);
  }

  start() {
    if (!this.#gainNode || !this.#workletNode) throw new Error('Gain node or worklet node is not initialized.');
    console.log('Starting metronome...');
    // If gain is 0, set it to a default value.
    if (this.#gainNode.gain.value === 0) {
      this.#gainNode.gain.setValueAtTime(0.5, this.#audioContext.currentTime); // Default volume
    }
    this.#workletNode.port.postMessage({ 
      type: 'update', 
      value: { startFrame: this.#audioContext.currentTime * this.#audioContext.sampleRate } });
  }

  stop() {
    if (!this.#gainNode) return;
    console.log('Stopping metronome.');
    this.#gainNode.gain.setValueAtTime(0, this.#audioContext.currentTime);
  }
}
// @ts-check

import { ToolHandler } from '../controller/ToolHandler.js';

/**
 * @class Channel
 * @description Represents a single channel strip in the mixer, holding state and AudioNodes.
 */
class Channel {
  /** @type {AudioContext} */
  #audioContext;

  // Nodes
  /** @type {GainNode} The entry point for audio into this channel. */
  inputNode;
  /** @type {GainNode} For controlling the preamp gain. */
  #gainNode;
  /** @type {WaveShaperNode} For applying soft clipping/saturation. */
  #softClipNode;
  /** @type {GainNode} Used to sum stereo to mono. */
  #monoSumNode;
  /** @type {StereoPannerNode} For panning the audio. */
  #pannerNode;
  /** @type {GainNode} For muting the channel. */
  #muteNode;
  /** @type {GainNode} For controlling the channel's level (fader). */
  #levelNode;
  /** @type {GainNode} The exit point for audio from this channel. */
  outputNode;

  // State
  #inputIsMono = false;
  #pan = 0;
  #mute = false;
  #solo = false;
  #gainDB = 0;
  #levelDB = 0;

  /**
   * @param {AudioContext} audioContext
   */
  constructor(audioContext) {
    this.#audioContext = audioContext;

    this.inputNode = this.#audioContext.createGain();
    this.#gainNode = this.#audioContext.createGain();
    this.#softClipNode = this.#audioContext.createWaveShaper();
    this.#softClipNode.curve = this.#createSoftClipCurve();
    this.#monoSumNode = this.#audioContext.createGain();
    this.#pannerNode = this.#audioContext.createStereoPanner();
    this.#muteNode = this.#audioContext.createGain();
    this.#levelNode = this.#audioContext.createGain();
    this.outputNode = this.#audioContext.createGain();

    // Initial signal path for stereo
    this.inputNode.connect(this.#gainNode);
    this.#gainNode.connect(this.#softClipNode);
    this.#softClipNode.connect(this.#pannerNode);
    this.#pannerNode.connect(this.#levelNode);
    this.#levelNode.connect(this.#muteNode);
    this.#muteNode.connect(this.outputNode);
  }

  /** @param {boolean} isMono */
  setInputIsMono(isMono) {
    if (this.#inputIsMono === isMono) return;
    this.#inputIsMono = isMono;

    this.#softClipNode.disconnect();
    if (isMono) {
      // Route both left and right to the mono sum node, then to panner
      this.#softClipNode.connect(this.#monoSumNode);
      this.#monoSumNode.connect(this.#pannerNode);
    } else {
      // Route directly to panner for stereo
      if (this.#monoSumNode.numberOfOutputs > 0)
        this.#monoSumNode.disconnect();
      this.#softClipNode.connect(this.#pannerNode);
    }
  }

  /** @param {number} panValue -1 to 1 */
  setPan(panValue) {
    this.#pan = panValue;
    this.#pannerNode.pan.setValueAtTime(panValue, this.#audioContext.currentTime);
  }

  /** @param {number} gainDB */
  setGainDB(gainDB) {
    this.#gainDB = gainDB;
    // Basic dB to linear conversion: gain = 10^(dB/20)
    const gain = Math.pow(10, gainDB / 20);
    this.#gainNode.gain.setValueAtTime(gain, this.#audioContext.currentTime);
  }

  /** @param {number} levelDB */
  setLevelDB(levelDB) {
    this.#levelDB = levelDB;
    // Basic dB to linear conversion: gain = 10^(dB/20)
    const gain = Math.pow(10, levelDB / 20);
    this.#levelNode.gain.setValueAtTime(gain, this.#audioContext.currentTime);
  }

  /**
   * Creates a curve for the WaveShaperNode to implement soft clipping.
   * This is a common tanh-based distortion formula.
   * @returns {Float32Array}
   */
  #createSoftClipCurve() {
    const curve = new Float32Array(255);
    for (let i = 0; i < 256; i++) {
      const j = i - 127;  // Range is -127 to 127
      const x = i * 2 / 255 - 1;
      curve[i] = Math.tanh(x);
    }
    return curve;
  }

  setMuteLevel(level) {
    this.#muteNode.gain.value = level;
  }

  /** @param {boolean} isMuted */
  setMute(isMuted) {
    // Mute and Solo logic is handeld by MixerEngine.
    this.#mute = isMuted;
  }

  /** @param {boolean} isSoloed */
  setSolo(isSoloed) {
    // Mute and Solo logic is handeld by MixerEngine.
    this.#solo = isSoloed;
  }

  /**
   * @returns {boolean}
   */
  isSoloed() {
    return this.#solo;
  }

  /**
   * @returns {boolean}
   */
  isMuted() {
    return this.#mute;
  }
}

/**
 * Manages the audio mixer, including channel strips for volume, panning, and effects.
 * @implements {ToolHandler}
 */
export class MixerEngine extends ToolHandler {
  /** @type {AudioContext} */
  #audioContext;
  /** @type {Channel[]} */
  #channels = [];

  /**
   * @param {AudioContext} audioContext The global audio context.
   */
  constructor(audioContext) {
    super();
    this.#audioContext = audioContext;

    for (let i = 0; i < 16; i++) {
      const channel = new Channel(this.#audioContext);
      this.#channels.push(channel);
      // By default, connect each channel's output to the main destination
      channel.outputNode.connect(this.#audioContext.destination);
    }
  }

  /**
   * 
   * @param {number} channelIndex 
   * @returns {AudioNode}
   */
  getChannelInput(channelIndex) {
    return this.#channels[channelIndex].inputNode;
  }

  /**
   * @override
   */
  canHandle(toolName) {
    return toolName === 'update_mixer_channel';
  }

  /**
   * @override
   * @param {string} toolName
   * @param {object} args
   */
  async callTool(toolName, args) {
    if (toolName === 'update_mixer_channel') {
      const channelIndex = args.channel - 1;
      if (channelIndex < 0 || channelIndex >= this.#channels.length) {
        console.error(`Invalid channel number: ${args.channel}`);
        return;
      }
      const channel = this.#channels[channelIndex];

      if (args.gainDB !== undefined) {
        channel.setGainDB(args.gainDB);
      }
      if (args.levelDB !== undefined) {
        channel.setLevelDB(args.levelDB);
      }
      if (args.inputIsMono !== undefined) {
        channel.setInputIsMono(args.inputIsMono);
      }
      if (args.pan !== undefined) {
        channel.setPan(args.pan);
      }
      if (args.mute !== undefined) {
        channel.setMute(args.mute);
        this.#updateSoloStates();
      }
      if (args.solo !== undefined) {
        channel.setSolo(args.solo);
        this.#updateSoloStates();
      }
    }
  }

  /**
   * @private
   * Updates the output connections of all channels based on the current solo
   *  states. If any channel is soloed, only soloed channels are connected to
   *  the destination. Otherwise, all non-muted channels are connected.
   */
  #updateSoloStates() {
    const anySolo = this.#channels.some(ch => ch.isSoloed());

    for (const channel of this.#channels) {
      if (anySolo) {
        // Something is soloed, so we should hear everything soloed.
        if (!channel.isSoloed()) {
          channel.setMuteLevel(1.0);
        } else {
          channel.setMuteLevel(0.0);
        }
      } else {
        // Nothing is soloed, so only mute the muted channels
        if (channel.isMuted()) {
          channel.setMuteLevel(0.0);
        } else {
          channel.setMuteLevel(1.0);
        }
      }
    }
  }
}
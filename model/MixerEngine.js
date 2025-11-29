// @ts-check

import { ToolHandler } from '../controller/ToolHandler.js';

// Implements saturation using a tanh function.
class Saturator {
  /** @type {GainNode} */
  #gainNode;
  /** @type {WaveShaperNode} */
  #waveShaperNode;

  /**
   * 
   * @param {AudioContext} audioContext 
   */
  constructor(audioContext) {
    this.#gainNode = audioContext.createGain();
    const gainAtZero = 10.0;
    this.#gainNode.gain.value = 1 / gainAtZero;
    this.#waveShaperNode = audioContext.createWaveShaper();
    this.#waveShaperNode.curve = this.#createCurve(255, gainAtZero);

    this.#gainNode.connect(this.#waveShaperNode);
  }

  get inputNode() { return this.#gainNode; }

  /**
   * 
   * @param {AudioNode} node 
   */
  connect(node) {
    this.#waveShaperNode.connect(node);
  }

  /**
   * Creates a saturation curve using a tanh function.
   * The tanh function is scaled so that the slope in the
   * center of the curve is equal to `slopeAtZero` and 
   * such that the end points are -1 and +1.
   * `positiveSamples` is the number of samples greater than zero.
   * Because the curve is symetrical, there are the same number of
   * negative samples, and there is always a zero sample.
   * @param {number} positiveSamples 
   * @param {number} slopeAtZero
   */
  #createCurve(positiveSamples, slopeAtZero) {
    // Example: positiveSamples = 2
    // Example: curveSize = 5
    const curveSize = 2 * positiveSamples + 1;
    const curveData = new Float32Array(curveSize);
    const k = slopeAtZero;
    // Note: for practical purposes where k > 3.0, 
    // tanh(k) is 1.0, so we can assume that k = slopeAtZero
    // and maxTanh = 1.0;
    // Correctly solving for k requires finding k such that
    // slopeAtZero = k / tanh(k)
    // This is best done by an iterative approximation and not
    // worth the complexity it introduces in the code.
    const maxTanh = 1.0;

    for (let i = 0; i < curveSize; i++) {
      // Map the array index `i` to an input value `x` in the range [-1, 1]
      // Example i = 0; x = (0 * 2) / (5 - 1) - 1 = -1
      // Example i = 4; x = (4 * 2) / (5 - 1) - 1 = 1
      const x = (i * 2) / (curveSize - 1) - 1;

      // Apply the tanh function, scaled by `k` to control the slope at zero.
      curveData[i] = Math.tanh(k * x) / maxTanh;
    }

    return curveData;
  }
}


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
  /** @type {Saturator} For applying soft clipping/saturation. */
  #saturator;
  /** @type {StereoPannerNode} For panning the audio. */
  #pannerNode;
  /** @type {GainNode} For muting the channel. */
  #muteNode;
  /** @type {GainNode} For controlling the channel's level (fader). */
  #levelNode;
  /** @type {GainNode} The exit point for audio from this channel. */
  outputNode;

  // State
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
    this.#saturator = new Saturator(audioContext);

    this.#pannerNode = this.#audioContext.createStereoPanner();
    this.#muteNode = this.#audioContext.createGain();
    this.#levelNode = this.#audioContext.createGain();
    this.outputNode = this.#audioContext.createGain();

    // Initial signal path for stereo
    this.inputNode.connect(this.#gainNode);
    this.#gainNode.connect(this.#saturator.inputNode);
    this.#saturator.connect(this.#pannerNode);
    this.#pannerNode.connect(this.#levelNode);
    this.#levelNode.connect(this.#muteNode);
    this.#muteNode.connect(this.outputNode);
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

  /**
   * @param {boolean} muted 
   */
  setMuteLevel(muted) {
    this.#muteNode.gain.value = muted ? 0.0 : 1.0;
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
   * Updates the output connections of all channels based on the current solo
   * states. If any channel is soloed, only soloed channels are connected to
   * the destination. Otherwise, all non-muted channels are connected.
   */
  #updateSoloStates() {
    const anySolo = this.#channels.some(ch => ch.isSoloed());

    for (const channel of this.#channels) {
      if (anySolo) {
        // Something is soloed, so we should hear everything soloed.
        if (!channel.isSoloed()) {
          channel.setMuteLevel(true);
        } else {
          channel.setMuteLevel(false);
        }
      } else {
        // Nothing is soloed, so only mute the muted channels
        if (channel.isMuted()) {
          channel.setMuteLevel(true);
        } else {
          channel.setMuteLevel(false);
        }
      }
    }
  }
}
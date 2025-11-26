// @ts-check

import { ToolHandler } from '../controller/ToolHandler.js';

/**
 * @typedef {object} SongSection
 * @property {string} name
 * @property {number} bar_count
 * @property {string} body
 */

/**
 * @class SongParseError
 * @property {string} message
 * @property {number} line
 */
export class SongParseError {
  /**
   * @param {string} message The reason for the parse failure.
   * @param {number} line The line number where the error occurred.
   */
  constructor(message, line) { this.message = message; this.line = line; }
}

/**
 * @class SongState
 * @description Manages core song data, persistence, and the two-way parsing logic.
 * It also emits events when the song state changes.
 * @extends {EventTarget}
 * @implements {ToolHandler}
 */
export class SongState extends EventTarget {
  /** @type {string | null} */
  #title = null;
  /** @type {number | null} */
  #bpm = null;
  /** @type {number | null} */
  #beatsPerBar = null;
  /** @type {SongSection[]} */
  #sections = [];

  constructor() {
    super();
  }

  /**
   * @returns {string | null}
   */
  get title() {
    return this.#title;
  }

  /**
   * @returns {number | null}
   */
  get bpm() {
    return this.#bpm;
  }

  /**
   * @returns {number | null}
   */
  get beatsPerBar() {
    return this.#beatsPerBar;
  }

  /**
   * @returns {SongSection[]}
   */
  get sections() {
    return [...this.#sections];
  }

  /**
   * Attempts to parse the canonical song text.
   * @param {string} text The canonical song text.
   * @returns {SongParseError | null} A SongParseError if parsing fails, otherwise null.
   */
  parse(text) {
    const titleHeaderRegex = /#\s*(.*)\s*\((\d+)\s*BPM,\s*(\d+)\/\d+\)/i;
    const sectionHeaderRegex = /\[([^,]+),\s*Bars:\s*(\d+)\]/i;

    const lines = text.split('\n');
    const firstLine = lines[0] || '';
    const titleHeaderMatch = firstLine.match(titleHeaderRegex);

    if (!titleHeaderMatch) {
      return new SongParseError(
        'Missing or malformed song title/BPM/time signature header.'
        + 'Expected format: # My Song (120 BPM, 4/4)', 1);
    }

    const newTitle = titleHeaderMatch[1].trim();
    const newBpm = parseInt(titleHeaderMatch[2], 10);
    const newBeatsPerBar = parseInt(titleHeaderMatch[3], 10);

    const newSections = [];
    let currentSection = null;
    let currentSectionBodyLines = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      const sectionMatch = line.match(sectionHeaderRegex);

      if (sectionMatch) {
        if (currentSection) {
          currentSection.body = currentSectionBodyLines.join('\n');
          newSections.push(currentSection);
        }
        const sectionName = sectionMatch[1].trim();
        const barCount = parseInt(sectionMatch[2], 10);
        currentSection = { name: sectionName, bar_count: barCount, body: '' };
        currentSectionBodyLines = [];
      } else if (currentSection !== null) {
        currentSectionBodyLines.push(line);
      } else {
        if (!line) continue;
        return new SongParseError(`Line is not in a section: ${line}` +
          ' Example section header:[Chorus, Bars: 16]', i + 1);
      }
    }

    if (currentSection) {
      currentSection.body = currentSectionBodyLines.join('\n');
      newSections.push(currentSection);
    }

    this.#title = newTitle;
    this.#bpm = newBpm;
    this.#beatsPerBar = newBeatsPerBar;
    this.#sections = newSections;

    this.dispatchEvent(new CustomEvent('song-state-changed'));
    return null;
  }

  /**
   * Serializes the current song state into the canonical text format.
   * @returns {string}
   */
  serialize() {
    if (this.#title === null || this.#bpm === null || this.#beatsPerBar === null) {
      return '';
    }

    let text = `# ${this.#title} (${this.#bpm} BPM, ${this.#beatsPerBar}/4)\n\n`;

    for (const section of this.#sections) {
      text += `[${section.name}, Bars: ${section.bar_count}]\n`;
      text += `${section.body}\n`;
    }
    return text;
  }

  /**
   * Calculates the duration of a single bar in seconds.
   * Assumes a 4/4 time signature.
   * @returns {number} The duration of a bar in seconds, or 0 if BPM is not set.
   */
  getBarDuration() {
    if (!this.#bpm || !this.#beatsPerBar) {
      return 0;
    }
    const secondsPerBeat = 60 / this.#bpm;
    return secondsPerBeat * this.#beatsPerBar;
  }

  /**
   * Calculates the start time of a specific section in seconds.
   * @param {string} sectionName The name of the section.
   * @returns {number} The start time in seconds from the beginning of the song, or -1 if not found.
   */
  getSectionStartTime(sectionName) {
    const barDuration = this.getBarDuration();
    if (barDuration === 0) return -1;

    let totalBars = 0;
    for (const section of this.#sections) {
      if (section.name === sectionName) {
        return totalBars * barDuration;
      }
      totalBars += section.bar_count;
    }
    return -1; // Section not found
  }

  /**
   * Calculates the duration of a specific section in seconds.
   * @param {string} sectionName The name of the section.
   * @returns {number} The duration of the section in seconds, or -1 if not found.
   */
  getSectionDuration(sectionName) {
    const section = this.#sections.find(s => s.name === sectionName);
    const barDuration = this.getBarDuration();
    return section && barDuration > 0 ? section.bar_count * barDuration : -1;
  }

  /**
   * @override
   */
  canHandle(toolName) {
    return ['update_song_attributes'].includes(toolName);
  }

  /**
   * @override
   * @param {string} toolName
   * @param {object} args
   */
  async callTool(toolName, args) {
    if (toolName === 'update_song_attributes') {
      let changed = false;
      if (args.bpm && typeof args.bpm === 'number') {
        this.#bpm = args.bpm;
        changed = true;
      }
      if (args.beats_per_bar && typeof args.beats_per_bar === 'number') {
        this.#beatsPerBar = args.beats_per_bar;
        changed = true;
      }
      if (changed) this.dispatchEvent(new CustomEvent('song-state-changed'));
    }
  }
}
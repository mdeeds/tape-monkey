// @ts-check

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
 */
export class SongState extends EventTarget {
  /** @type {string | null} */
  #title = null;
  /** @type {number | null} */
  #bpm = null;
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
    const titleBpmRegex = /#\s*(.*)\s*\((\d+)\s*BPM\)/i;
    const sectionHeaderRegex = /\[([^,]+),\s*Bars:\s*(\d+)\]/i;

    const lines = text.split('\n');
    const firstLine = lines[0] || '';
    const titleBpmMatch = firstLine.match(titleBpmRegex);

    if (!titleBpmMatch) {
      return new SongParseError(
        'Missing or malformed song title/BPM header.'
        + 'Expected format: # My Song (120 BPM)', 1);
    }

    const newTitle = titleBpmMatch[1].trim();
    const newBpm = parseInt(titleBpmMatch[2], 10);

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
    this.#sections = newSections;

    this.dispatchEvent(new CustomEvent('song-state-changed'));
    return null;
  }

  /**
   * Serializes the current song state into the canonical text format.
   * @returns {string}
   */
  serialize() {
    if (this.#title === null || this.#bpm === null) {
      return '';
    }

    let text = `# ${this.#title} (${this.#bpm} BPM)\n\n`;

    for (const section of this.#sections) {
      text += `[${section.name}, Bars: ${section.bar_count}]\n`;
      text += `${section.body}\n`;
    }
    return text;
  }
}
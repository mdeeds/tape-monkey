// @ts-check

/**
 * @typedef {object} SongSection
 * @property {string} name
 * @property {number} bar_count
 * @property {string} body
 */

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
   * @returns {boolean} True if parsing was successful, false otherwise.
   */
  parse(text) {
    const titleBpmRegex = /#\s*(.*)\s*\((\d+)\s*BPM\)/i;
    const sectionHeaderRegex = /\[([^,]+),\s*Bars:\s*(\d+)\]/g;

    const lines = text.split('\n');
    const firstLine = lines[0] || '';
    const titleBpmMatch = firstLine.match(titleBpmRegex);

    if (!titleBpmMatch) {
      return false; // Parsing fails if title/BPM header is missing/malformed.
    }

    const newTitle = titleBpmMatch[1].trim();
    const newBpm = parseInt(titleBpmMatch[2], 10);

    const newSections = [];
    let currentSection = null;

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;
      const sectionMatch = line.match(sectionHeaderRegex);

      if (sectionMatch) {
        if (currentSection) {
          currentSection.body = currentSection.body.trim();
          newSections.push(currentSection);
        }
        const sectionName = line.match(/\[([^,]+)/)[1].trim();
        const barCount = parseInt(line.match(/Bars:\s*(\d+)/)[1], 10);
        currentSection = { name: sectionName, bar_count: barCount, body: '' };
      } else if (currentSection) {
        currentSection.body += line + '\n';
      }
    }

    if (currentSection) {
      currentSection.body = currentSection.body.trim();
      newSections.push(currentSection);
    }

    this.#title = newTitle;
    this.#bpm = newBpm;
    this.#sections = newSections;

    this.dispatchEvent(new CustomEvent('song-state-changed'));
    return true;
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
      if (section.body) {
        text += `${section.body}\n\n`;
      } else {
        text += '\n';
      }
    }

    return text.trim();
  }
}
// @ts-check

const LOCAL_STORAGE_KEY = 'tape-monkey-song-sheet';

/** @typedef {import('../model/SongState.js').SongState} SongState */

/**
 * @class SongUI
 * @description Renders the visual song timeline and highlights the current playing/recording section.
 */
export class SongUI {
  #songState;
  #container;
  #textArea;
  #displayContainer;

  /**
   * @param {HTMLElement} container The element to render the UI into.
   * @param {SongState} songState The application's song state.
   */
  constructor(container, songState) {
    if (!songState) {
      throw new Error('SongState is required.');
    }
    this.#container = container;
    this.#songState = songState;

    // Both views are created, but the display one is hidden by default.
    this.#container.innerHTML = `
      <div id="song-sheet-container">
        <textarea id="song-sheet" class="song-sheet" spellcheck="true"></textarea>
      </div>
      <div id="song-display-container" style="display: none;">
      </div>
    `;

    this.#textArea = /** @type {HTMLTextAreaElement} */ (this.#container.querySelector('#song-sheet'));
    this.#displayContainer = /** @type {HTMLElement} */ (this.#container.querySelector('#song-display-container'));

    this.#textArea.addEventListener('input', this.#handleTextInput.bind(this));
    this.#songState.addEventListener('song-state-changed', this.#handleStateChange.bind(this));

    const savedText = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (savedText) {
      this.#textArea.value = savedText;
      // Immediately parse the loaded text to populate the song state.
      this.#handleTextInput();
    } else {
      this.#handleStateChange();
    }
  }

  /**
   * Toggles between the editor and display views.
   * @param {'edit' | 'display'} mode The view mode to switch to.
   */
  setViewMode(mode) {
    const editView = this.#container.querySelector('#song-sheet-container');
    if (!editView || !this.#displayContainer) return;

    if (mode === 'edit') {
      editView.style.display = 'block';
      this.#displayContainer.style.display = 'none';
    } else {
      editView.style.display = 'none';
      this.#displayContainer.style.display = 'block';
      this.#renderDisplayView(); // Re-render to ensure it's up-to-date
    }
  }

  /**
   * Highlights a specific section in the display view.
   * @param {string | null} sectionName The name of the section to highlight. Pass null to clear all highlights.
   */
  highlightSection(sectionName) {
    const sections = this.#displayContainer.querySelectorAll('.song-display-section');
    sections.forEach(sec => {
      sec.classList.remove('highlighted');
    });

    if (sectionName) {
      const sectionToHighlight = this.#displayContainer.querySelector(`[data-section-name="${sectionName}"]`);
      if (sectionToHighlight) {
        sectionToHighlight.classList.add('highlighted');
      }
    }
  }

  #renderDisplayView() {
    // Implementation will be added in #handleStateChange, which calls this.
    // This method is kept for clarity and future use.
  }

  /**
   * Handles user input in the textarea, attempts to parse it, and provides visual feedback.
   * @private
   */
  #handleTextInput() {
    const text = this.#textArea.value;
    const parseError = this.#songState.parse(text);
    const success = !parseError;

    if (success) {
      this.#textArea.classList.remove('song-text-invalid');
      localStorage.setItem(LOCAL_STORAGE_KEY, text);
      console.log('Successful parse.');
    } else {
      this.#textArea.classList.add('song-text-invalid');
      console.log('Parsing failed.', parseError);
    }
  }

  /**
   * Handles the 'song-state-changed' event from SongState to update the UI.
   * @private
   */
  #handleStateChange() {
    console.log('Handling state change.')
    const currentText = this.#textArea.value;
    const serializedState = this.#songState.serialize();
    console.log('Serialized state:', serializedState);

    // Preserve cursor position
    const selectionStart = this.#textArea.selectionStart;
    const selectionEnd = this.#textArea.selectionEnd;

    // Only update if the text is different to avoid moving the cursor during typing.
    if (currentText !== serializedState) {
      this.#textArea.value = serializedState;
      // Restore cursor position
      this.#textArea.setSelectionRange(selectionStart, selectionEnd);
    }

    // A state change implies the state is valid.
    this.#textArea.classList.remove('song-text-invalid');

    // Also update the display view whenever the state changes.
    this.#updateDisplayView();
  }

  /**
   * Renders the structured `div` view from the current song state.
   * @private
   */
  #updateDisplayView() {
    this.#displayContainer.innerHTML = ''; // Clear previous content

    const headerDiv = document.createElement('div');
    headerDiv.className = 'song-display-header';
    headerDiv.textContent = `# ${this.#songState.title} (${this.#songState.bpm} BPM, ${this.#songState.beatsPerBar}/4)`;
    this.#displayContainer.appendChild(headerDiv);

    for (const section of this.#songState.sections) {
      const sectionDiv = document.createElement('div');
      sectionDiv.className = 'song-display-section';
      sectionDiv.dataset.sectionName = section.name;
      sectionDiv.textContent = `[${section.name}, Bars: ${section.bar_count}]\n${section.body}`;
      this.#displayContainer.appendChild(sectionDiv);
    }
  }
}
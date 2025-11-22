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

  /**
   * @param {HTMLElement} container The element to render the UI into.
   * @param {SongState} songState The application's song state.
   */
  constructor(container, songState) {
    this.#container = container;
    this.#songState = songState;

    this.#container.innerHTML = `
      <div id="song-sheet-container">
        <textarea id="song-sheet" class="song-sheet" spellcheck="true">
        </textarea>
      </div>
    `;

    this.#textArea = /** @type {HTMLTextAreaElement} */ (this.#container.querySelector('#song-sheet'));

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
    const currentText = this.#textArea.value;
    const serializedState = this.#songState.serialize();

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
  }
}
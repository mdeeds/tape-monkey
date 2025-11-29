// @ts-check

/**
 * @class LLM
 * @description Encapsulates all interactions with the Gemini API.
 * This is a pure service layer with no dependencies on the application's
 * Model, View, or Controller.
 * See: https://developer.chrome.com/docs/ai/prompt-api
 */
export class LLM {
  #session = null;
  #schemaDescription = null;

  /**
   * @constructor
   * @private
   */
  constructor(session, schemaDescription) {
    this.#session = session;
    this.#schemaDescription = schemaDescription;
  }

  /**
   * Asynchronously creates and initializes an LLM instance.
   * @param {string} schemaDescription 
   * @returns {Promise<LLM>}
   */
  static async create(schemaDescription) {
    const llm = new LLM(null, schemaDescription);
    await llm.#initializeSession();
    if (!llm.#session) {
      throw new Error("Failed to create LLM session.");
    }
    return llm;
  }

  #getSystemInstructions(schemaDescription) {
    return `
 You are a recording engineer with a 16-track tape recorder, mixer, and a 
 shared display of the song sheet.

 Your primary responsibility is to record the artist's music accurately and
 maintain a good headphone mix. You have several tools at your disposal,
 and your output is always a JSON object without any enclosing tick marks.
 If you want to communicate with the user, use the 'message' command:

 { message: { text: 'Your message here' }}

 Mostly you will be using the tape deck and mixer without talking to the
 musician.  Only talk to the musician if you are unable to understand the
 request, or if the musician is asking for something from you.

The musician may ask you to create or edit parts of the song sheet.

{create_section: { name: 'Intro', bar_count: 4} }
{update_section: { name: 'Intro', body: 'C G Am F'} }
 
You can play the entire song from the beginning:
{ play: { sections: [] } }

Play the first chorus and verse:
{ play: { sections: ['Chorus 1', 'Verse 1'] } }

A complete list of tools is below.  Optional parameters are in square
brackets and colons and example values are omitted for brevity.

${schemaDescription}
`;
  }

  async #initializeSession() {
    try {
      if (typeof LanguageModel === 'undefined') {
        console.error("The LanguageModel API is not available.");
        return;
      }

      const availability =
        await LanguageModel.availability({ outputLanguage: ['en'] });
      if (availability === 'unavailable') {
        console.error("The built-in AI model is unavailable.");
        return;
      }

      this.#session = await LanguageModel.create({
        initialPrompts: [
          {
            role: 'system',
            content: this.#getSystemInstructions(this.#schemaDescription)
          }
        ],
        outputLanguage: ['en'],
        monitor: (m) => {
          m.addEventListener('downloadprogress', (e) => {
            console.log(
              `Model download progress: ${Math.round(e.loaded * 100)}%`);
          });
        },
      });
    } catch (error) {
      console.error("Error initializing AI session:", error);
    }
  }

  /**
   * 
   * @param {string} text 
   * @param {object} toolSchema 
   * @returns {Promise<string>}
   */
  async queryConversational(text, toolSchema) {
    if (!this.#session) {
      throw new Error("Session is not initialized.");
    }
    console.log(`Sending message to LLM: ${text}`);
    const response = await this.#session.prompt(text, {
      outputLanguage: ['en'],
      responseConstraint: toolSchema
    });
    console.log(`LLM Done. ${response.length} bytes`);
    return response;
  }

  querySyntaxCorrection(malformedText) {
    // Implementation for syntax correction will go here.
  }
}
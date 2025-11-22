// @ts-check

/**
 * @class LLM
 * @description Encapsulates all interactions with the Gemini API.
 * This is a pure service layer with no dependencies on the application's
 * Model, View, or Controller.
 */
export class LLM {
  #session = null;

  /**
   * @constructor
   */
  constructor(schemaDescription) {
    this.#initializeSession(schemaDescription);
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

  async #initializeSession(schemaDescription) {
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
            content: this.#getSystemInstructions(schemaDescription)
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
   */
  async queryConversational(text, toolSchema) {
    if (!this.#session) {
      throw new Error("Session is not initialized.");
    }
    const response = await this.#session.prompt(text, { outputConstraints: toolSchema })
    return response;
  }

  querySyntaxCorrection(malformedText) {
    // Implementation for syntax correction will go here.
  }
}
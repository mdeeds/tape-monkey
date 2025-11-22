// @ts-check

/**
 * @typedef {import('./llm.js').LLM} LLM
 * @typedef {import('../view/ChatInterfaceUI.js').ChatInterfaceUI} ChatInterfaceUI
 */

export class ToolSchemas {

  constructor() {
    this._songSectionNames = new Set();
  }

  /**
   * 
   * @param {string} name 
   */
  addSongSectionName(name) {
    this._songSectionNames.add(name);
  }

  getSchema() {
    const sectionNames = Array.from(this._songSectionNames);
    return {
      type: "object",
      properties: {
        message: {
          type: "object",
          properties: {
            text: { type: "string" }
          },
          required: ["text"]
        },
        play: {
          type: "object",
          properties: {
            sections: {
              type: "array", items: { type: "string", enum: sectionNames }
            },
            loop: { type: "boolean" }
          },
          required: ["sections"]
        },
        create_section: {
          type: "object",
          properties: {
            name: { type: "string" },
            bar_count: { type: "number" },
            body: { type: "string" }
          },
          required: ["name", "bar_count"]
        },
        update_section: {
          type: "object",
          properties: {
            name: { type: "string", enum: sectionNames },
            bar_count: { type: "number" },
            body: { type: "string" }
          },
          required: ["name"]
        }
      }
    };
  }

  /**
   * @returns a string that describes the functions in getSchema.  For example
   * play{sections, [loop]}
   * update_section{name, [bar_count], [body]}
   * Optional parameters are in square brackets and colons and example values are omitted for brevity.
   */
  getSchemaSummary() {
    const schema = this.getSchema();
    const tools = schema.properties;
    const summaryLines = [];

    for (const toolName of Object.getOwnPropertyNames(tools)) {
      const tool = tools[toolName];
      if (tool.properties) {
        const requiredParams = new Set(tool.required || []);
        const paramNames = Object.keys(tool.properties);

        const paramsSummary = paramNames.map(param =>
          requiredParams.has(param) ? param : `[${param}]`
        ).join(', ');
        summaryLines.push(`${toolName}{${paramsSummary}}`);
      }
    }
    return summaryLines.join('\n');
  }
}

/**
 * @class MainController
 * @description Handles user input, executes tool calls, and coordinates updates.
 */
export class MainController {
  #llm;
  #chatUI;
  #songState;
  #toolSchemas;

  /**
   * @param {LLM} llm
   * @param {ChatInterfaceUI} chatUI
   * @param {ToolSchemas} toolSchemas
   * @param {import('../model/SongState.js').SongState} songState
   */
  constructor(llm, chatUI, toolSchemas, songState) {
    this.#llm = llm;
    this.#chatUI = chatUI;
    this.#songState = songState;
    this.#toolSchemas = toolSchemas;
  }

  /**
   * @param {string} userMessage
   */
  async handleUserMessage(userMessage) {
    const response =
      JSON.parse(
        await this.#llm.queryConversational(`${userMessage}\n\n${this.#songState.serialize()}`,
          this.#toolSchemas.getSchema())
      );
    for (const toolName in response) {
      if (Object.hasOwnProperty.call(response, toolName)) {
        const toolParams = response[toolName];
        console.log(`Tool call: ${toolName}`, toolParams);
        switch (toolName) {
          case 'message':
            this.#chatUI.addAgentMessage(toolParams.text);
            break;
          case 'create_section':
            console.log('Tool call: create_section', toolParams);
            if (toolParams.name) {
              this.#toolSchemas.addSongSectionName(toolParams.name);
            }
            break;
          default:
            console.error(`Unknown tool call: ${toolName}`);
            break;
        }
      }
    }
  }
}
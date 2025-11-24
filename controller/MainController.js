// @ts-check

import { ToolSchemas } from "./ToolSchemas.js";

/**
 * @typedef {import('./llm.js').LLM} LLM
 * @typedef {import('../view/ChatInterfaceUI.js').ChatInterfaceUI} ChatInterfaceUI
 */

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
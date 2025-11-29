// @ts-check

import { ToolSchemas } from "./ToolSchemas.js";
import { ToolHandler } from "./ToolHandler.js";

/**
 * @typedef {import('./llm.js').LLM} LLM
 * @typedef {import('../view/ChatInterfaceUI.js').ChatInterfaceUI} ChatInterfaceUI
 * @typedef {import('../model/SongState.js').SongState} SongState
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
  /** @type {ToolHandler[]} */
  #toolHandlers;

  /**
   * @param {LLM} llm
   * @param {ChatInterfaceUI} chatUI
   * @param {ToolSchemas} toolSchemas
   * @param {SongState} songState
   * @param {ToolHandler[]} toolHandlers
   */
  constructor(llm, chatUI, toolSchemas, songState, toolHandlers) {
    this.#llm = llm;
    this.#chatUI = chatUI;
    this.#songState = songState;
    this.#toolSchemas = toolSchemas;
    this.#toolHandlers = toolHandlers;
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
        await this.callTool(toolName, toolParams);
      }
    }
  }

  /**
   * @param {string} toolName
   * @param {object} args
   */
  async callTool(toolName, args) {
    for (const handler of this.#toolHandlers) {
      if (handler.canHandle(toolName)) {
        console.log(`Tool call: ${toolName} handled by ${handler.constructor.name}`, args);
        await handler.callTool(toolName, args);
        return;
      }
    }
    console.error(`Unknown tool call: ${toolName}`, args);
  }

  canHandle(toolName) {
    return ['message', 'create_section', 'update_section'].includes(toolName);
  }
}
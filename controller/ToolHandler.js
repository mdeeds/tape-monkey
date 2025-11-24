// @ts-check

/**
 * @interface
 * @description Defines a standard interface for handling tool calls from the LLM.
 */
export class ToolHandler {
  /**
   * Checks if this handler can process the given tool.
   * @param {string} toolName The name of the tool.
   * @returns {boolean} True if the tool can be handled, false otherwise.
   */
  canHandle(toolName) { throw new Error('Not implemented'); }

  /**
   * Calls the specified tool with the given arguments.
   * @param {string} toolName The name of the tool to call.
   * @param {object} args The arguments for the tool.
   * @returns {Promise<string|void>} A string result from the tool execution, or nothing.
   */
  async callTool(toolName, args) { throw new Error('Not implemented'); }
}
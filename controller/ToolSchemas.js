// @ts-check



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
        record: {
          type: "object",
          properties: {
            sections: {
              type: "array", items: { type: "string", enum: sectionNames }
            }
          },
          required: ["sections"]
        },
        arm: {
          type: "object",
          properties: {
            track_number: { type: "number", minimum: 1, maximum: 16 }
          },
          required: ["track_number"]
        },
        start_metronome: {
          type: "object",
          properties: {
            volume: { type: "number", minimum: 0, maximum: 1 }
          }
        },
        stop_metronome: {
          type: "object",
          properties: {}
        },
        update_song_attributes: {
          type: "object",
          properties: {
            bpm: { type: "number" },
            beats_per_bar: { type: "number" }
          }
        }
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
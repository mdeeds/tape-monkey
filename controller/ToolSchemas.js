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
          description: "Send a message to the user.",
          type: "object",
          properties: {
            text: { type: "string" }
          },
          required: ["text"]
        },
        play: {
          description: "Play a the specified song sessions in order as well as any sections in between.",
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
          description: "Record audio over a set of song sections.",
          type: "object",
          properties: {
            sections: {
              type: "array", items: { type: "string", enum: sectionNames }
            }
          },
          required: ["sections"]
        },
        stop: {
          description: "Stop playback or recording.",
          type: "object",
          properties: {}
        },
        arm: {
          description: "Arm a track for recording. The armed track is the one that will be recorded to.",
          type: "object",
          properties: {
            track_number: { type: "number", minimum: 1, maximum: 16 }
          },
          required: ["track_number"]
        },
        start_metronome: {
          description: "Start the metronome. Volume is in decibels.  -6 is normal.",
          type: "object",
          properties: {
            volumeDB: { type: "number" }
          }
        },
        stop_metronome: {
          description: "Stop the metronome.",
          type: "object",
          properties: {}
        },
        update_song_attributes: {
          description: "Update the song's attributes, like BPM or time signature.",
          type: "object",
          properties: {
            bpm: { type: "number" },
            beats_per_bar: { type: "number" }
          }
        },
        create_section: {
          description: "Create a new section in the song.",
          type: "object",
          properties: {
            name: { type: "string" },
            bar_count: { type: "number" },
            body: { type: "string" }
          },
          required: ["name", "bar_count"]
        },
        update_section: {
          description: "Update an existing section in the song.",
          type: "object",
          properties: {
            name: { type: "string", enum: sectionNames },
            bar_count: { type: "number" },
            body: { type: "string" }
          },
          required: ["name"]
        },
        update_mixer_channel: {
          description: "Update the settings for a mixer channel. The preamp " +
            "has soft clipping, so increase the gain with a corresponding " +
            "decrease in level to achieve saturation. Gain and level are " +
            "measured in decibels.",
          type: "object",
          properties: {
            channel: { type: "number", minimum: 1, maximum: 16 },
            gainDB: { type: "number" },
            levelDB: { type: "number" },
            inputIsMono: { type: "boolean" },
            pan: { type: "number", minimum: -1, maximum: 1 },
            mute: { type: "boolean" },
            solo: { type: "boolean" },
          },
          required: ["channel"]
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
        if (tool.description) {
          summaryLines.push(tool.description);
        }
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
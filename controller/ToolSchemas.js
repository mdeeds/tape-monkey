// @ts-check



export class ToolSchemas {
  /**
   * @param {string[]} sectionNames
   */
  getSchema(sectionNames) {
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
          description: "Plays the audio. Specify the sections to play.",
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
        set_metronome_properties: {
          description: "Set the metronome volume. Volume is in decibels. -6 is normal.",
          type: "object",
          properties: {
            volumeDB: { type: "number" }
          }
        },
        set_latency_compensation: {
          description: "Set the latency compensation for all tracks in seconds. This is used to align playback with the metronome.",
          type: "object",
          properties: {
            seconds: { type: "number", minimum: 0, maximum: 1}
          },
          required: ["seconds"]
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
        // This seems to be too complicated for the agent.
        // We need to do two things, I think
        // 1: Break up the various adjustments into different functions
        // 2: Have a single "knob" for saturation.
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
    const schema = this.getSchema([]);
    const tools = schema.properties;
    const summaryLines = [];

    for (const toolName of Object.getOwnPropertyNames(tools)) {
      const tool = tools[toolName];
      if (tool.properties) {
        let toolLine = "";
        if (tool.description) {
          toolLine += tool.description + ": ";
        }
        const requiredParams = new Set(tool.required || []);
        const paramNames = Object.keys(tool.properties);

        const paramsSummary = paramNames.map(param =>
          requiredParams.has(param) ? param : `[${param}]`
        ).join(', ');
        toolLine += `${toolName}{${paramsSummary}}`;
        summaryLines.push(toolLine);
      }
    }
    return summaryLines.join('\n');
  }
}
# Tape Monkey

## **1\. Motivation: The Conversational Recording Engineer**

This application is designed to remove the complex friction points associated with traditional Digital Audio Workstations (DAWs) during the creative process. The primary motivation is to empower the musician to maintain focus on performance and musicality, delegating the tedious and distracting tasks of a recording session—like transport control, mixing for monitoring, and basic file management—to the application, which is driven by the Large Language Model (LLM). In essence, the LLM functions as a dedicated, conversational recording engineer.

The core function is rapid idea capture and tracking. The musician conversationally lays down tracks, instructs playback, and makes decisions about arrangement and overdubbing by simply recording over existing audio or recording silence over unwanted sections (tape-style editing). The mixer controls are strictly for creating a quality headphone mix (using simple effects like reverb, saturation, and panning); there is **no automated mixing** intended. The final deliverable is a set of high-quality, pre-mixed stems, ready to be imported into a full DAW for final mixing and mastering, thus maintaining the focus on recording and avoiding the scope creep associated with building a full-featured DAW replacement.

## **2\. Introduction and Architectural Overview**

This application utilizes a specialized Model-View-Controller (MVC) architecture where a **Conversational Controller (MainController)** acts as the sole intermediary between the user's natural language intent and the core application engines (Tape Deck and Mixer). The architecture is defined by an **asymmetric flow**: the UI and internal engines are the authoritative state holders, and the LLM is a powerful, stateless planner dedicated to executing the musician's delegated commands. The LLM *never* directly reads or writes state; it receives the full, current song structure from the MainController with every query, ensuring it plans its actions based on the latest context. The core challenge of maintaining data coherence is solved via a continuous, LLM-powered synchronization loop.

## **3\. Component File Structure**

The application's logic is segregated into specialized files, organized into logical folders for clarity and modularity in a VS Code development environment.

| Logical Folder | File Name | Component Type | Primary Responsibility |
| :---- | :---- | :---- | :---- |
| **/model** | SongState.js | State Model | Manages core song data, persistence, and the two-way parsing logic. |
|  | TapeDeckEngine.js | Engine Model / Tool Handler | Implements playback, recording, and transport logic. Uses `SongState` for timing. |
|  | MixerEngine.js | Engine Model | Implements volume, pan, and mute logic for specific stems (monitoring mix only). |
|  | MetronomeEngine.js | Engine Model / Tool Handler | Manages the metronome, handling start/stop tools and syncing with `SongState`. |
|  | MetronomeProcessor.js | Audio Worklet | Generates the precise audio clicks for the metronome. |
| **/view** | SongUI.js | Rendering View | Renders the visual song timeline and highlights the current playing/recording section. |
|  | ChatInterfaceUI.js | Rendering View | Renders the user text input, STT button, and the conversation history. |
| **/controller** | MainController.js | Application Controller | Handles user input, delegates tool calls, and coordinates updates. |
|  | ToolHandler.js | Interface | Defines a standard contract for any component that can execute tool calls. |
|  | LLM.js | LLM Abstraction Service | Encapsulates all interactions with the Gemini API (conversational and correction calls). |
|  | ToolSchemas.js | Schema Service | Defines and generates the JSON schemas for all available tools. |
| **Root** | script.js | Entry Point | Application initialization, module imports, and initial setup. |

## **4\. Core Data Flow: Controller-Mediated Asymmetry**

The system operates on a loop where the Gemini LLM is the central decision-maker and execution planner. This asymmetric flow ensures the LLM is always contextually aware of the current UI state.

1. **User Input:** The user submits a command via the ChatInterfaceUI.js text box (or STT).  
2. **Controller Intercept & Context Injection:** MainController.js captures the text and queries SongState.js for the **current Canonical Song Text**. It then calls the LLM.js service's conversational query method, **injecting the song text into the LLM's system context/prompt.**  
3. **LLM API Call:** LLM.js constructs the API payload, including the user's text, the current song structure context, and the schemas for available **Tool Functions** from the Engine Models.  
4. **LLM Decision:** The LLM decides whether to execute a specific Tool Function (e.g., set\_volume) or return a conversational message via the **message tool**. The output is always a structured JSON object representing the chosen tool call.  
5. **Tool Execution:** MainController.js receives the structured JSON and iterates through a list of registered **Tool Handlers** (e.g., `MetronomeEngine`, `TapeDeckEngine`, `SongState`, and `ChatInterfaceUI`). It calls the first handler that reports it can execute the tool. If it's the `message` tool, the Controller displays the content to the user.  
6. **State Update & Feedback:** A tool handler (like `SongState` or `TapeDeckEngine`) updates its internal state. If `SongState` is modified, it broadcasts a `song-state-changed` event. Other components like `SongUI` and `MetronomeEngine` listen for this event to automatically update themselves.

## **5\. The Structural Coherence Solution**

The core design element is the synchronization between the free-form text input and the required internal data structure, handled proactively by the LLM to provide seamless editing without user-facing errors.

### **5.1. Canonical Song Text Format**

The user-facing text box requires a simple, parsable format to define song sections and timing, ensuring readability for the user and predictability for the parser.

**Format Rules:**

1. **Header (Global):** Must define the song title, tempo, and time signature (e.g., `# My Track (120 BPM, 4/4)`).  
2. **Section Header:** Sections must start with a consistent header pattern defining the bar count (e.g., \[Verse 1, Bars: 16\]).  
3. **Content:** Lyrical and chord content resides between headers.

### **5.2. Internal Structured Data Model**

The SongState.js converts the Canonical Text into a strict JavaScript array structure for use by the Engine Models and for time mapping calculations.

### **5.3. Proactive LLM Correction Flow**

The application eliminates distracting error messages (like red squiggles) by using a dedicated LLM call to automatically correct malformed text input.

1. **User Edits:** User modifies the text box.  
2. **Parsing Attempt:** SongState.js attempts to parse the raw text against the Canonical Format.  
3. **Failure Path (LLM Intervention):** If parsing fails due to a structural syntax error (e.g., missing bar count in a header):  
   * SongState.js holds the raw, unparsed text.  
   * It triggers the LLM.js service's specialized correction method.  
   * **Prompt to LLM:** The prompt sends the raw text and instructs the LLM to act strictly as a **Syntax Enforcer**: "Correct and reformat this text strictly into the Canonical Song Text format. Do not add any conversational remarks."  
   * The MainController.js receives the corrected text from the LLM and forces an update of the user-facing text box.  
   * This corrected text immediately triggers a successful parse (back to Step 2).  
4. **Success Path:** If parsing succeeds, SongState.js updates the internal structure, recalculates all time mappings, and broadcasts the song-state-changed event.

## **6\. LLM Abstraction and Tool Interface**

### **6.1. LLM Service Abstraction (LLM.js)**

The LLM.js file is a pure service layer, managing all communication with the Gemini API. It has **no dependencies** on the application's Model, View, or Controller.

* **Relationship:** The MainController.js calls methods on the LLM.js service.  
* **Methods Exposed by LLM.js (The Service API):**  
  1. queryConversational(text, toolSchemas): For user commands. **Returns a structured JSON object** representing the function call (either an engine tool, the message tool, or the no\_action tool).  
  2. querySyntaxCorrection(malformedText): For the proactive, non-conversational text correction loop. Returns only the corrected Canonical Song Text string.

### **6.2. Tool Interface Contract**

To ensure the LLM outputs executable commands in a scalable and decoupled way, the system uses a `ToolHandler` interface.

* **Tool Schema Definition:** The `ToolSchemas.js` component is responsible for defining the JSON schema for every available tool. In `script.js`, an instance of `ToolSchemas` is created, and its schema summary is passed to the `LLM` service upon initialization.  
* **JSON Output Constraint:** For the in-browser LLM, the API is constrained to return a structured JSON object representing the intended function call.  
* **ToolHandler Interface:** A component that can execute tools (like `TapeDeckEngine` or `MainController`) implements the `ToolHandler` interface, which consists of two methods: `canHandle(toolName)` and `callTool(toolName, args)`.
* **Delegation in MainController.js:** The `MainController` maintains a list of `ToolHandler` instances. When it receives a JSON object from the LLM, it iterates through its handlers, asking each one if it `canHandle` the tool. The first handler to return `true` is then asked to `callTool`, effectively delegating the execution. This decouples the `MainController` from knowing the implementation details of every tool.

## **7\. Engine Model APIs and Persistence**

### **7.1. Engine Model APIs (Tools)**

These methods are exposed to the LLM via tool definitions in the API payload. Note that these tools exclusively cover transport, monitoring mix, and structural arrangement, aligning with the goal of a recording assistant.

| Model/Component | Tool Function | Parameters | Description |
| :---- | :---- | :---- | :---- |
| **LLM Interface** | message | content: string | **(MANDATORY TOOL)** Sends a natural language text response back to the musician. Used when no engine action is required. |
| **LLM Interface** | no\_action | None | **(FUTURE TOOL)** Instructs the Controller that the received STT input does not contain a directed command and should be accumulated with subsequent speech for the next LLM call. |
| TapeDeckEngine | play | sections: string[], [loop: boolean] | Begins playback of specified sections. |
| TapeDeckEngine | record | sections: string[] | Records over the specified sections on the armed track. |
| TapeDeckEngine | stop\_playback | None | Stops playback or recording. |
| TapeDeckEngine | arm | track_number: number | Arms a specific track for recording. |
| MetronomeEngine | start\_metronome | [volume: number] | Starts the metronome click. |
| MetronomeEngine | stop\_metronome | None | Stops the metronome click. |
| MixerEngine | set\_channel\_volume | channel: number, level\_db: number | Sets the volume of a specific mixer channel (for monitoring mix only). |
| MixerEngine | set\_channel\_pan | channel: number, pan: number | Sets the pan for a mixer channel. -1 is hard left, 1 is hard right. |
| MixerEngine | toggle\_channel\_mute | channel: number | Mutes or unmutes a specific mixer channel. |
| MixerEngine | set\_channel\_saturation | channel: number, amount: number | Sets the saturation amount (0-100) for a mixer channel. |
| SongState | update\_song\_attributes | [bpm: number], [beats\_per\_bar: number] | Updates the song's tempo or time signature. |
| SongState | create\_section | name: string, bar_count: number, [body: string] | Adds a new song section to the internal data model. |
| SongState | update\_section | name: string, [bar_count: number], [body: string] | Updates an existing song section in the internal data model. |

### **7.2. Persistence and Export Strategy**

The SongState.js component manages all local data storage.

* **Persistence:**  
  * **localStorage:** Used for small configurations and user preferences.  
  * **IndexedDB:** Used for the primary, high-volume data storage, specifically the complex array structure of the stems and recorded audio parts.  
* **Export:** The MainController.js handles file download by retrieving the formatted stem data from SongState.js, creating a Blob, and programmatically triggering a file download (e.g., as JSON) to the user's device. This produces the final **mix-ready stems** as required by the project's goal.

## **8\. Future Work: Advanced Speech-to-Text Integration**

The next stage of development will focus on a seamless, hands-free conversational experience, eliminating the need for a trigger phrase like "Hey Gemini."

### **8.1. Problem: Command vs. Ambient Speech**

Because the musician may be singing, talking to collaborators, or commenting generally, raw STT output will contain many phrases not directed at the application. The system must intelligently filter these to maintain context without executing unwanted commands.

### **8.2. Solution: LLM as a Command Filter**

The LLM's role will be extended to act as a **primary intent filter** for all continuous STT input.

1. **STT Input Stream:** The STT engine streams text to the MainController.js in short bursts.  
2. **Controller Accumulation:** The MainController.js holds an internal buffer of potentially unfinished or non-directed speech.  
3. **LLM Call:** The Controller sends the accumulated buffer to the LLM via queryConversational() along with the current song context and tool schemas, including the new no\_action tool.  
4. **LLM Decision:**  
   * **Directed Command:** If the LLM identifies a clear, actionable command (e.g., "Mute the bass"), it calls the appropriate tool (MixerEngine.toggle\_mute). The Controller executes the command and clears the buffer.  
   * **Ambient/Non-Directed Speech:** If the LLM determines the input is ambient, singing, or conversational speech not requiring an application action, it returns the structured JSON for the **no\_action tool**.  
5. **Controller Response to no\_action:** When the MainController.js receives the no\_action response, it discards the current LLM response (preventing conversation history clutter) but **retains the current speech buffer**, appending new STT input to it for the next check. For example, if the first STT burst is "I think the bass..." (resulting in no\_action) and the second burst is "...is a little heavy. Can you bring it down?" (resulting in set\_volume), the Controller ensures the combined intent is executed.
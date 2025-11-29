// @ts-check

import { MainController } from "./controller/MainController.js";
import { ToolSchemas } from "./controller/ToolSchemas.js";
import { ChatInterfaceUI } from "./view/ChatInterfaceUI.js";
import { LLM } from "./controller/llm.js";
import { SongState } from "./model/SongState.js";
import { SongUI } from "./view/SongUI.js";
import { TapeDeckEngine } from "./model/TapeDeckEngine.js";
import { MetronomeEngine } from "./model/MetronomeEngine.js";

async function main() {
  // The main logic will go here
  console.log("Main function has been called.");

  const audioContext = createAudioContext();
  if (!audioContext) {
    console.error("Could not create AudioContext.");
    // You could show a message to the user here.
    return;
  }

  let audioStream;
  try {
    audioStream = await getAudioInputStream();
    console.log("Audio stream obtained.", audioStream);
  } catch (err) {
    console.error("Error obtaining audio stream:", err);
    throw new Error("Error obtaining audio stream");
  }

  const songState = new SongState();
  const mainContainer = document.getElementById('main-container');
  if (!mainContainer) {
    throw new Error('Main container not found');
  }
  const songUI = new SongUI(mainContainer, songState);

  const metronomeEngine = await MetronomeEngine.create(audioContext, songState);
  const tapeDeckEngine = await TapeDeckEngine.create(audioContext, audioStream, songState);

  const schema = new ToolSchemas();
  console.log(schema.getSchemaSummary());

  let chatUI;
  try {
    const [llm, newChatUI] = await Promise.all([
      LLM.create(schema.getSchemaSummary()),
      ChatInterfaceUI.create('Tape Monkey Chat'),
    ]);
    chatUI = newChatUI;

    const toolHandlers = [metronomeEngine, tapeDeckEngine, songState, chatUI];
    const mainController = new MainController(llm, chatUI, schema, songState, toolHandlers);

    // Listen for messages from the chat popup
    window.addEventListener('message', async (event) => {
      // Basic security check
      if (event.origin !== window.location.origin) {
        return;
      }
      try {
        await mainController.handleUserMessage(event.data);
      }
      catch (error) {
        console.log("Error from LLM:", error);
      }
    });

    // Close the chat popup when the main window is closed or refreshed.
    window.addEventListener('beforeunload', () => {
      chatUI?.close();
    });
  } catch (error) {
    console.error("Initialization failed:", error);
  }
}

/**
 * @returns {AudioContext | null}
 */
function createAudioContext() {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) {
    return null;
  }
  return new AudioContext({
    sampleRate: 48000, // Attempt to set preferred sample rate
  });
}

function init() {
  const startButton = document.createElement('button');
  const mainContainer = document.createElement('div');
  mainContainer.id = 'main-container';
  mainContainer.style.display = 'none'; // Hide until start

  startButton.textContent = 'Start';

  startButton.addEventListener('click', () => {
    startButton.remove();
    mainContainer.style.display = 'flex';
    main();
  }, { once: true });

  document.body.appendChild(mainContainer);
  document.body.appendChild(startButton);
}

/**
 * Gets the default audio input device with settings suitable for music recording.
 * @returns {Promise<MediaStream>}
 */
function getAudioInputStream() {
  const constraints = {
    audio: {
      // These settings are ideal for recording music, disabling processing
      // that can interfere with the quality of the recording.
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      sampleRate: { ideal: 48000 } // Prefer 48kHz sample rate
    }
  };
  return navigator.mediaDevices.getUserMedia(constraints);
}

window.addEventListener('DOMContentLoaded', init);
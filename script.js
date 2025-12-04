// @ts-check

import { MainController } from "./controller/MainController.js";
import { ToolSchemas } from "./controller/ToolSchemas.js";
import { ChatInterfaceUI } from "./view/ChatInterfaceUI.js";
import { LLM } from "./controller/llm.js";
import { SongState } from "./model/SongState.js";
import { SongUI } from "./view/SongUI.js";
import { TapeDeckEngine } from "./model/TapeDeckEngine.js";
import { MetronomeEngine } from "./model/MetronomeEngine.js";
import { MixerEngine } from "./model/MixerEngine.js";

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

  const schema = new ToolSchemas();
  const songState = new SongState();
  const mainContainer = document.getElementById('main-container');
  if (!mainContainer) {
    throw new Error('Main container not found');
  }
  const songUI = new SongUI(mainContainer, songState);

  const mixerEngine = new MixerEngine(audioContext);
  const metronomeEngine = await MetronomeEngine.create(audioContext, songState);
  const tapeDeckEngine = await TapeDeckEngine.create(
    audioContext, audioStream, songState, mixerEngine, metronomeEngine);

  const sectionNames = songState.sections.map(s => s.name);
  console.log(schema.getSchemaSummary(sectionNames));

  let chatUI;
  try {
    const [llm, newChatUI] = await Promise.all([ // TODO: This schema summary is stale
      LLM.create(schema.getSchemaSummary(sectionNames)),
      ChatInterfaceUI.create('Tape Monkey Chat'),
    ]);
    chatUI = newChatUI;

    const toolHandlers = [
      tapeDeckEngine, songState, chatUI, mixerEngine, metronomeEngine];
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
  const context = new AudioContext({
    sampleRate: 48000, // Attempt to set preferred sample rate
  });
  console.log("Audio context created, sample rate: " + 
    context.sampleRate);
  return context;
}

function init() {
  // Choose and set a random background image
  const images = [
    'images/light-background.png', 
    'images/natural-background.png',
    'images/dark-background.png'
  ];
  const chosenImage = images[Math.floor(Math.random() * images.length)];

  // Apply background styles to the body
  document.body.style.backgroundImage = `url('${chosenImage}')`;
  document.body.style.backgroundSize = 'cover';
  document.body.style.backgroundPosition = 'center';
  document.body.style.backgroundRepeat = 'no-repeat';
  document.body.style.backgroundAttachment = 'fixed';
  document.body.style.minHeight = '100vh';

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
async function getAudioInputStream() {
  // First, get permission and a temporary stream. This is necessary so that
  // enumerateDevices() will return the full list of devices with labels.
  const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  tempStream.getTracks().forEach(track => track.stop());

  const constraints = {
    audio: {
      // These settings are ideal for recording music, disabling processing
      // that can interfere with the quality of the recording.
      deviceId: { exact: 'default' }, // Explicitly request the default device
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      sampleRate: { ideal: 48000 } // Prefer 48kHz sample rate

    }
  };
  const stream = await navigator.mediaDevices.getUserMedia(constraints);
  const audioTrack = stream.getAudioTracks()[0];
  if (audioTrack) {
    const settings = audioTrack.getSettings();
    console.log(`Using audio input: ${audioTrack.label}`);
    if (settings.sampleRate) {
      console.log(`Sample rate: ${settings.sampleRate} Hz`);
    }
  }
  return stream;
}

window.addEventListener('DOMContentLoaded', init);
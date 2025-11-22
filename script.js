// @ts-check

import { ToolSchemas } from "./controller/MainController.js";
import { LLM } from "./controller/llm.js"

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
    // You could show an error message to the user here.
  }

  const schema = new ToolSchemas();
  console.log(schema.getSchemaSummary());

  const llm = new LLM();
  llm.queryConversational('Say hello', schema.getSchema());
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
  startButton.textContent = 'Start';

  startButton.addEventListener('click', () => {
    startButton.remove();
    main();
  }, { once: true });

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
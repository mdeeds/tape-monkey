// @ts-check

/**
 * Converts a linear amplitude value to decibels.
 * @param {number} linearAmplitude
 * @returns {number}
 */
function linearToDb(linearAmplitude) {
  if (linearAmplitude <= 0) {
    // A very small positive number to represent silence or very low levels.
    // -120 dB is often considered the threshold of human hearing or digital silence.
    return -120;
  }
  return 20 * Math.log10(linearAmplitude);
}

/**
 * Calculates the Root Mean Square (RMS) of an audio buffer.
 * @param {Float32Array} buffer
 * @returns {number} RMS value (linear)
 */
function calculateRms(buffer) {
  if (buffer.length === 0) return 0;
  let sumOfSquares = 0;
  for (let i = 0; i < buffer.length; i++) {
    sumOfSquares += buffer[i] * buffer[i];
  }
  return Math.sqrt(sumOfSquares / buffer.length);
}

/**
 * Calculates the true peak of an audio buffer.
 * @param {Float32Array} buffer
 * @returns {number} True peak value (linear)
 */
function calculateTruePeak(buffer) {
  let peak = 0;
  for (let i = 0; i < buffer.length; i++) {
    const absSample = Math.abs(buffer[i]);
    if (absSample > peak) {
      peak = absSample;
    }
  }
  return peak;
}

/**
 * Calculates the cross-channel correlation of two audio buffers.
 * @param {Float32Array} leftBuffer
 * @param {Float32Array} rightBuffer
 * @returns {number} Cross-channel correlation value
 */
function calculateCrossChannelCorrelation(leftBuffer, rightBuffer) {
  const n = leftBuffer.length;
  if (n === 0 || n !== rightBuffer.length) return 0;
  let crossCorrelationSum = 0;
  for (let i = 0; i < n; i++) {
    crossCorrelationSum += leftBuffer[i] * rightBuffer[i];
  }
  return crossCorrelationSum / n;
}

self.onmessage = function(event) {
  const { left, right } = event.data;

  self.postMessage({
    rmsLeftDb: linearToDb(calculateRms(left)),
    peakLeftDb: linearToDb(calculateTruePeak(left)),
    rmsRightDb: linearToDb(calculateRms(right)),
    peakRightDb: linearToDb(calculateTruePeak(right)),
    crossChannelCorrelation: calculateCrossChannelCorrelation(left, right),
  });
};
import { readFileSync } from "node:fs";

export interface WavFile {
  sampleRate: number;
  channels: number;
  samples: Float32Array; // mono mix in [-1, 1]
}

/**
 * Minimal WAV decoder. Handles PCM 16/24-bit and Float32, mono or stereo.
 * Stereo is averaged down to mono. Anything else throws.
 */
export function loadWav(path: string): WavFile {
  const buf = readFileSync(path);

  const readStr = (off: number, len: number) =>
    buf.toString("ascii", off, off + len);

  if (readStr(0, 4) !== "RIFF" || readStr(8, 4) !== "WAVE") {
    throw new Error(`Not a RIFF/WAVE file: ${path}`);
  }

  // Walk chunks to find 'fmt ' and 'data'
  let pos = 12;
  let format = 0;
  let channels = 0;
  let sampleRate = 0;
  let bitsPerSample = 0;
  let dataOffset = 0;
  let dataLength = 0;

  while (pos + 8 <= buf.length) {
    const chunkId = readStr(pos, 4);
    const chunkSize = buf.readUInt32LE(pos + 4);
    const body = pos + 8;

    if (chunkId === "fmt ") {
      format = buf.readUInt16LE(body);
      channels = buf.readUInt16LE(body + 2);
      sampleRate = buf.readUInt32LE(body + 4);
      bitsPerSample = buf.readUInt16LE(body + 14);
    } else if (chunkId === "data") {
      dataOffset = body;
      dataLength = chunkSize;
      break;
    }
    pos = body + chunkSize + (chunkSize & 1); // chunks pad to even
  }

  if (!dataOffset || !channels || !sampleRate || !bitsPerSample) {
    throw new Error(`Malformed WAV header: ${path}`);
  }

  const bytesPerSample = bitsPerSample / 8;
  const totalSamples = dataLength / bytesPerSample;
  const framesPerChannel = totalSamples / channels;
  const out = new Float32Array(framesPerChannel);

  if (format === 1 && bitsPerSample === 16) {
    // PCM 16-bit signed
    for (let i = 0; i < framesPerChannel; i++) {
      let sum = 0;
      for (let c = 0; c < channels; c++) {
        sum += buf.readInt16LE(dataOffset + (i * channels + c) * 2) / 32768;
      }
      out[i] = sum / channels;
    }
  } else if (format === 1 && bitsPerSample === 24) {
    // PCM 24-bit signed, little-endian
    for (let i = 0; i < framesPerChannel; i++) {
      let sum = 0;
      for (let c = 0; c < channels; c++) {
        const o = dataOffset + (i * channels + c) * 3;
        let v = buf[o] | (buf[o + 1] << 8) | (buf[o + 2] << 16);
        if (v & 0x800000) v |= 0xff000000; // sign-extend
        sum += v / 8388608;
      }
      out[i] = sum / channels;
    }
  } else if (format === 3 && bitsPerSample === 32) {
    // IEEE Float32
    for (let i = 0; i < framesPerChannel; i++) {
      let sum = 0;
      for (let c = 0; c < channels; c++) {
        sum += buf.readFloatLE(dataOffset + (i * channels + c) * 4);
      }
      out[i] = sum / channels;
    }
  } else {
    throw new Error(
      `Unsupported WAV format=${format} bits=${bitsPerSample} (${path})`
    );
  }

  return { sampleRate, channels, samples: out };
}

/**
 * Split a stereo WAV into two mono Float32Arrays. Used for MIR-1K which
 * stores accompaniment in the left channel and clean vocals in the right.
 */
export function loadWavStereo(path: string): {
  sampleRate: number;
  left: Float32Array;
  right: Float32Array;
} {
  const buf = readFileSync(path);
  const readStr = (off: number, len: number) =>
    buf.toString("ascii", off, off + len);

  if (readStr(0, 4) !== "RIFF" || readStr(8, 4) !== "WAVE") {
    throw new Error(`Not a RIFF/WAVE file: ${path}`);
  }

  let pos = 12;
  let channels = 0;
  let sampleRate = 0;
  let bitsPerSample = 0;
  let dataOffset = 0;
  let dataLength = 0;

  while (pos + 8 <= buf.length) {
    const chunkId = readStr(pos, 4);
    const chunkSize = buf.readUInt32LE(pos + 4);
    const body = pos + 8;
    if (chunkId === "fmt ") {
      channels = buf.readUInt16LE(body + 2);
      sampleRate = buf.readUInt32LE(body + 4);
      bitsPerSample = buf.readUInt16LE(body + 14);
    } else if (chunkId === "data") {
      dataOffset = body;
      dataLength = chunkSize;
      break;
    }
    pos = body + chunkSize + (chunkSize & 1);
  }

  if (channels !== 2 || bitsPerSample !== 16) {
    throw new Error(
      `Expected stereo 16-bit WAV, got channels=${channels} bits=${bitsPerSample}: ${path}`
    );
  }

  const frames = dataLength / 4;
  const left = new Float32Array(frames);
  const right = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    left[i] = buf.readInt16LE(dataOffset + i * 4) / 32768;
    right[i] = buf.readInt16LE(dataOffset + i * 4 + 2) / 32768;
  }
  return { sampleRate, left, right };
}

import CryptoJS from "crypto-js";

const ACRCLOUD_HOST = process.env.ACRCLOUD_HOST || "";
const ACRCLOUD_ACCESS_KEY = process.env.ACRCLOUD_ACCESS_KEY || "";
const ACRCLOUD_ACCESS_SECRET = process.env.ACRCLOUD_ACCESS_SECRET || "";

interface ACRCloudResult {
  title: string;
  artist: string;
  album: string;
  spotifyTrackId?: string;
  durationMs: number;
  playOffsetMs: number;
}

/**
 * Send an audio sample to ACRCloud for fingerprint recognition.
 */
export async function recognizeAudio(
  audioBuffer: Buffer
): Promise<ACRCloudResult | null> {
  if (!ACRCLOUD_HOST || !ACRCLOUD_ACCESS_KEY || !ACRCLOUD_ACCESS_SECRET) {
    throw new Error("ACRCloud credentials not configured");
  }

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const stringToSign = [
    "POST",
    "/v1/identify",
    ACRCLOUD_ACCESS_KEY,
    "audio",
    "1",
    timestamp,
  ].join("\n");

  const signature = CryptoJS.HmacSHA1(stringToSign, ACRCLOUD_ACCESS_SECRET).toString(
    CryptoJS.enc.Base64
  );

  const formData = new FormData();
  formData.append("sample", new Blob([new Uint8Array(audioBuffer)]), "sample.wav");
  formData.append("sample_bytes", audioBuffer.length.toString());
  formData.append("access_key", ACRCLOUD_ACCESS_KEY);
  formData.append("data_type", "audio");
  formData.append("signature", signature);
  formData.append("signature_version", "1");
  formData.append("timestamp", timestamp);

  const response = await fetch(`https://${ACRCLOUD_HOST}/v1/identify`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`ACRCloud request failed: ${response.status}`);
  }

  const data = await response.json();

  if (data.status?.code !== 0 || !data.metadata?.music?.length) {
    return null;
  }

  const music = data.metadata.music[0];

  return {
    title: music.title,
    artist: music.artists?.map((a: { name: string }) => a.name).join(", ") || "Unknown",
    album: music.album?.name || "Unknown",
    spotifyTrackId: music.external_metadata?.spotify?.track?.id,
    durationMs: music.duration_ms || 0,
    playOffsetMs: music.play_offset_ms || 0,
  };
}

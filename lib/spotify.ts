const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID || "";
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET || "";

let cachedToken: { token: string; expiresAt: number } | null = null;

/**
 * Get a Spotify access token using Client Credentials flow.
 * Caches the token until it expires.
 */
export async function getSpotifyToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.token;
  }

  if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET) {
    throw new Error("Spotify credentials not configured");
  }

  const basic = Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString("base64");

  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!response.ok) {
    throw new Error(`Spotify token request failed: ${response.status}`);
  }

  const data = await response.json();
  cachedToken = {
    token: data.access_token,
    // Expire 60s early to avoid edge cases
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  };

  return cachedToken.token;
}

/**
 * Get track details from Spotify by track ID.
 */
export async function getTrack(trackId: string) {
  const token = await getSpotifyToken();

  const response = await fetch(`https://api.spotify.com/v1/tracks/${trackId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    throw new Error(`Spotify track request failed: ${response.status}`);
  }

  return response.json();
}

/**
 * Search for tracks on Spotify.
 */
export async function searchTracks(query: string, limit = 5) {
  const token = await getSpotifyToken();

  const params = new URLSearchParams({
    q: query,
    type: "track",
    limit: limit.toString(),
  });

  const response = await fetch(
    `https://api.spotify.com/v1/search?${params.toString()}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!response.ok) {
    throw new Error(`Spotify search failed: ${response.status}`);
  }

  return response.json();
}

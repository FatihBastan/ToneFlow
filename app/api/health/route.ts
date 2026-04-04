import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    env: {
      acrcloud: !!process.env.ACRCLOUD_ACCESS_KEY,
      spotify: !!process.env.SPOTIFY_CLIENT_ID,
      musixmatch: !!process.env.MUSIXMATCH_API_KEY,
    },
  });
}

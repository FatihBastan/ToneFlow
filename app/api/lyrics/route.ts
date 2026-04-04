import { NextRequest, NextResponse } from "next/server";
import { getLyrics } from "@/lib/lyrics";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const artist = searchParams.get("artist");
  const track = searchParams.get("track");
  const duration = searchParams.get("duration");

  if (!artist || !track) {
    return NextResponse.json(
      { error: "Missing artist or track" },
      { status: 400 }
    );
  }

  try {
    const lyrics = await getLyrics(
      artist,
      track,
      duration ? parseFloat(duration) : undefined
    );

    return NextResponse.json({ lyrics });
  } catch (error) {
    console.error("Lyrics error:", error);
    return NextResponse.json(
      { error: "Failed to fetch lyrics" },
      { status: 500 }
    );
  }
}

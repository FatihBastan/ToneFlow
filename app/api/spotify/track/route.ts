import { NextRequest, NextResponse } from "next/server";
import { getTrack } from "@/lib/spotify";
import { extractColors } from "@/lib/colorExtract";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "Missing track id" }, { status: 400 });
  }

  try {
    const track = await getTrack(id);

    let albumColors: string[] = [];
    const albumArtUrl = track.album?.images?.[0]?.url;
    if (albumArtUrl) {
      albumColors = await extractColors(albumArtUrl);
    }

    return NextResponse.json({
      id: track.id,
      name: track.name,
      artists: track.artists.map((a: { name: string }) => a.name),
      album: {
        name: track.album.name,
        images: track.album.images,
      },
      duration_ms: track.duration_ms,
      albumArtUrl,
      albumColors,
    });
  } catch (error) {
    console.error("Spotify track error:", error);
    return NextResponse.json(
      { error: "Failed to fetch track" },
      { status: 500 }
    );
  }
}

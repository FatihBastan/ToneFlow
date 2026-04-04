import { NextRequest, NextResponse } from "next/server";
import { recognizeAudio } from "@/lib/acrcloud";
import { getTrack } from "@/lib/spotify";
import { extractColors } from "@/lib/colorExtract";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const audioFile = formData.get("audio") as File | null;

    if (!audioFile) {
      return NextResponse.json(
        { error: "No audio file provided" },
        { status: 400 }
      );
    }

    const arrayBuffer = await audioFile.arrayBuffer();
    const audioBuffer = Buffer.from(arrayBuffer);

    const result = await recognizeAudio(audioBuffer);

    if (!result) {
      return NextResponse.json({ song: null });
    }

    // If we have a Spotify track ID, fetch album art and colors
    let albumArtUrl: string | undefined;
    let albumColors: string[] | undefined;

    if (result.spotifyTrackId) {
      try {
        const track = await getTrack(result.spotifyTrackId);
        const images = track.album?.images;
        if (images?.length) {
          // Prefer 640px image, fall back to largest
          albumArtUrl =
            images.find((i: { width: number }) => i.width === 640)?.url ||
            images[0].url;

          if (albumArtUrl) {
            albumColors = await extractColors(albumArtUrl);
          }
        }
      } catch {
        // Spotify fetch failed — return song without artwork
      }
    }

    return NextResponse.json({
      song: {
        ...result,
        albumArtUrl,
        albumColors,
      },
    });
  } catch (error) {
    console.error("Recognition error:", error);
    return NextResponse.json(
      { error: "Recognition failed" },
      { status: 500 }
    );
  }
}

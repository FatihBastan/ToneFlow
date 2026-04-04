import { Vibrant } from "node-vibrant/node";

/**
 * Extract dominant colors from an image URL.
 * Returns an array of hex color strings.
 */
export async function extractColors(imageUrl: string): Promise<string[]> {
  try {
    const palette = await Vibrant.from(imageUrl).getPalette();

    const colors: string[] = [];
    const swatches = [
      palette.Vibrant,
      palette.DarkVibrant,
      palette.LightVibrant,
      palette.Muted,
      palette.DarkMuted,
      palette.LightMuted,
    ];

    for (const swatch of swatches) {
      if (swatch) {
        colors.push(swatch.hex);
      }
    }

    // Ensure we have at least 3 colors
    while (colors.length < 3) {
      colors.push("#1a1a2e");
    }

    return colors.slice(0, 6);
  } catch {
    return ["#1a1a2e", "#16213e", "#0f3460"];
  }
}

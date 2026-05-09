import { ImageResponse } from "next/og";

export const runtime = "edge";

export async function GET(_req: Request, { params }: { params: Promise<{ size: string }> }) {
  const { size: sizeStr } = await params;
  const size = parseInt(sizeStr) || 192;
  const radius = Math.round(size * 0.22);
  const fontSize = Math.round(size * 0.52);

  return new ImageResponse(
    (
      <div
        style={{
          width: size,
          height: size,
          borderRadius: radius,
          background: "linear-gradient(135deg, #4f46e5 0%, #6d28d9 100%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "white",
          fontSize,
          fontFamily: "sans-serif",
        }}
      >
        ◈
      </div>
    ),
    { width: size, height: size },
  );
}

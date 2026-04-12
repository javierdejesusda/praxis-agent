import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#2979FF",
          color: "#ffffff",
          fontSize: 124,
          fontWeight: 700,
          letterSpacing: "-0.06em",
          fontFamily: "system-ui, -apple-system, Segoe UI, Helvetica, Arial, sans-serif",
        }}
      >
        P
      </div>
    ),
    { ...size },
  );
}

import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** iOS home-screen icon — solid tile, no transparency. */
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
          background:
            "radial-gradient(120px 80px at 50% 0%, rgba(16,185,129,0.25), transparent), #09090b",
        }}
      >
        <span
          style={{
            fontSize: 110,
            fontWeight: 800,
            color: "#34d399",
            lineHeight: 1,
          }}
        >
          S
        </span>
      </div>
    ),
    { ...size }
  );
}

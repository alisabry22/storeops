import { ImageResponse } from "next/og";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

/** Favicon: emerald "S" on near-black, matching the app's look. */
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#09090b",
          borderRadius: 14,
          border: "2px solid rgba(16,185,129,0.4)",
        }}
      >
        <span
          style={{
            fontSize: 40,
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

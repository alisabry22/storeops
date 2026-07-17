import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt =
  "StoreOps — App Store Connect, without the clicking. Bulk metadata, pricing, and subscriptions for all 175 storefronts.";

/** Social share card (X, iMessage, Slack, LinkedIn). */
export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: 80,
          background:
            "radial-gradient(700px 350px at 30% 0%, rgba(16,185,129,0.18), transparent), #09090b",
          color: "#fafafa",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              width: 56,
              height: 56,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "#18181b",
              borderRadius: 14,
              border: "2px solid rgba(16,185,129,0.5)",
              fontSize: 34,
              fontWeight: 800,
              color: "#34d399",
            }}
          >
            S
          </div>
          <span style={{ fontSize: 40, fontWeight: 700 }}>
            Store<span style={{ color: "#34d399" }}>Ops</span>
          </span>
        </div>

        <div
          style={{
            marginTop: 48,
            fontSize: 76,
            fontWeight: 800,
            lineHeight: 1.1,
            letterSpacing: -2,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <span>Stop clicking through</span>
          <span style={{ color: "#34d399" }}>App Store Connect.</span>
        </div>

        <div
          style={{
            marginTop: 36,
            fontSize: 30,
            color: "#a1a1aa",
            display: "flex",
          }}
        >
          Bulk metadata · controlled pricing · 175 storefronts · reviewable changes
        </div>
      </div>
    ),
    { ...size }
  );
}

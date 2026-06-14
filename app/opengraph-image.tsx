import { ImageResponse } from "next/og";

// Route segment config
export const alt = "Khmer Vox TTS — Khmer text-to-speech API";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Branded Open Graph / link-preview image (neo-brutalist, matches the site).
export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          backgroundColor: "#f5f0e8",
          padding: "64px",
          fontFamily: "sans-serif",
          position: "relative",
        }}
      >
        {/* Top row: logo tile + wordmark */}
        <div style={{ display: "flex", alignItems: "center", gap: "28px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "120px",
              height: "120px",
              backgroundColor: "#ffcc00",
              border: "8px solid #1a1a1a",
              borderRadius: "18px",
              boxShadow: "10px 10px 0px 0px #1a1a1a",
            }}
          >
            <svg width="74" height="74" viewBox="0 0 200 200">
              <path d="M40 40 L90 160 L105 160 L55 40 Z" fill="#1a1a1a" />
              <path d="M160 40 L110 160 L95 160 L145 40 Z" fill="#10b981" />
              <rect x="90" y="145" width="20" height="15" fill="#1a1a1a" />
            </svg>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                fontSize: "40px",
                fontWeight: 900,
                color: "#1a1a1a",
                letterSpacing: "-1px",
                textTransform: "uppercase",
                lineHeight: 1,
              }}
            >
              Khmer Vox TTS
            </div>
            <div
              style={{
                fontSize: "20px",
                fontWeight: 700,
                color: "#4a4a4a",
                textTransform: "uppercase",
                marginTop: "8px",
                letterSpacing: "2px",
              }}
            >
              voxtts.online
            </div>
          </div>
        </div>

        {/* Headline */}
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              fontSize: "92px",
              fontWeight: 900,
              color: "#1a1a1a",
              letterSpacing: "-3px",
              textTransform: "uppercase",
              lineHeight: 0.95,
            }}
          >
            <div style={{ display: "flex" }}>Khmer Text</div>
            <div style={{ display: "flex" }}>To Speech API</div>
          </div>
          <div
            style={{
              display: "flex",
              fontSize: "30px",
              fontWeight: 700,
              color: "#1a1a1a",
              backgroundColor: "#ffcc00",
              border: "4px solid #1a1a1a",
              padding: "10px 22px",
              alignSelf: "flex-start",
              boxShadow: "6px 6px 0px 0px #1a1a1a",
            }}
          >
            Natural voices · Voice cloning · Batch generation
          </div>
        </div>

        {/* Bottom accent bar */}
        <div style={{ display: "flex", gap: "10px" }}>
          {[60, 100, 40, 80, 55, 95, 35, 70, 50, 88].map((h, i) => (
            <div
              key={i}
              style={{
                width: "26px",
                height: `${h}px`,
                backgroundColor: i % 2 === 0 ? "#ffcc00" : "#10b981",
                border: "3px solid #1a1a1a",
              }}
            />
          ))}
        </div>
      </div>
    ),
    { ...size },
  );
}

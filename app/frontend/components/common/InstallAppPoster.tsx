"use client";

import { forwardRef } from "react";
import { QRCodeSVG } from "qrcode.react";

type InstallAppPosterProps = {
  downloadUrl: string;
};

const POSTER_WIDTH = 595;
const POSTER_HEIGHT = 842;

const InstallAppPoster = forwardRef<HTMLDivElement, InstallAppPosterProps>(
  function InstallAppPoster({ downloadUrl }, ref) {
    return (
      <div
        ref={ref}
        style={{
          width: POSTER_WIDTH,
          height: POSTER_HEIGHT,
          position: "relative",
          overflow: "hidden",
          fontFamily: "Inter, system-ui, sans-serif",
          color: "#ffffff",
          background: "linear-gradient(165deg, #28143F 0%, #1a0d28 35%, #2d1545 65%, #4a2038 100%)",
        }}
      >
        {/* Decorative blobs */}
        <div
          style={{
            position: "absolute",
            top: -80,
            left: -60,
            width: 280,
            height: 280,
            borderRadius: "50%",
            background: "#5606ff",
            opacity: 0.35,
            filter: "blur(60px)",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: 120,
            right: -80,
            width: 260,
            height: 260,
            borderRadius: "50%",
            background: "#fe8989",
            opacity: 0.28,
            filter: "blur(55px)",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: -100,
            left: "20%",
            width: 320,
            height: 320,
            borderRadius: "50%",
            background: "#5606ff",
            opacity: 0.22,
            filter: "blur(70px)",
          }}
        />

        {/* Top accent bar */}
        <div
          style={{
            position: "relative",
            height: 8,
            background: "linear-gradient(90deg, #a3e635 0%, #84cc16 50%, #a3e635 100%)",
          }}
        />

        <div
          style={{
            position: "relative",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            padding: "40px 36px 32px",
            height: "calc(100% - 8px)",
            boxSizing: "border-box",
          }}
        >
          {/* Logo & branding */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              marginBottom: 20,
            }}
          >
            <div
              style={{
                padding: 6,
                borderRadius: 24,
                background: "linear-gradient(135deg, rgba(163,230,53,0.4) 0%, rgba(163,230,53,0.1) 100%)",
                border: "2px solid rgba(163,230,53,0.45)",
                boxShadow: "0 8px 32px rgba(0,0,0,0.35)",
              }}
            >
              <img
                src="/pwa-512.png"
                alt="Timelly"
                width={88}
                height={88}
                style={{
                  display: "block",
                  width: 88,
                  height: 88,
                  borderRadius: 20,
                  objectFit: "cover",
                }}
              />
            </div>
            <h1
              style={{
                margin: "16px 0 4px",
                fontSize: 42,
                fontWeight: 800,
                letterSpacing: "-0.02em",
                lineHeight: 1.1,
                textAlign: "center",
              }}
            >
              Timelly
            </h1>
            <p
              style={{
                margin: 0,
                fontSize: 15,
                fontWeight: 500,
                color: "rgba(255,255,255,0.72)",
                letterSpacing: "0.12em",
                textTransform: "uppercase",
              }}
            >
              School ERP System
            </p>
          </div>

          {/* Scan badge */}
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "10px 24px",
              borderRadius: 999,
              background: "#a3e635",
              color: "#1a0d28",
              fontSize: 14,
              fontWeight: 800,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              boxShadow: "0 4px 20px rgba(163,230,53,0.45)",
              marginBottom: 28,
            }}
          >
            <span style={{ fontSize: 18 }}>📱</span>
            Scan to Install App
          </div>

          {/* QR frame */}
          <div
            style={{
              position: "relative",
              padding: 20,
              borderRadius: 24,
              background: "#ffffff",
              boxShadow: "0 16px 48px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.1)",
            }}
          >
            {/* Corner accents */}
            <div
              style={{
                position: "absolute",
                top: 10,
                left: 10,
                width: 28,
                height: 28,
                borderTop: "4px solid #a3e635",
                borderLeft: "4px solid #a3e635",
                borderRadius: "4px 0 0 0",
              }}
            />
            <div
              style={{
                position: "absolute",
                top: 10,
                right: 10,
                width: 28,
                height: 28,
                borderTop: "4px solid #a3e635",
                borderRight: "4px solid #a3e635",
                borderRadius: "0 4px 0 0",
              }}
            />
            <div
              style={{
                position: "absolute",
                bottom: 10,
                left: 10,
                width: 28,
                height: 28,
                borderBottom: "4px solid #a3e635",
                borderLeft: "4px solid #a3e635",
                borderRadius: "0 0 0 4px",
              }}
            />
            <div
              style={{
                position: "absolute",
                bottom: 10,
                right: 10,
                width: 28,
                height: 28,
                borderBottom: "4px solid #a3e635",
                borderRight: "4px solid #a3e635",
                borderRadius: "0 0 4px 0",
              }}
            />

            {downloadUrl ? (
              <QRCodeSVG value={downloadUrl} size={240} level="H" includeMargin={false} />
            ) : (
              <div style={{ width: 240, height: 240, background: "#e4e4e7", borderRadius: 8 }} />
            )}
          </div>

          {/* Steps */}
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              gap: 12,
              marginTop: 32,
              width: "100%",
            }}
          >
            {[
              { step: "1", label: "Open Camera", icon: "📷" },
              { step: "2", label: "Scan QR Code", icon: "⬛" },
              { step: "3", label: "Install App", icon: "✅" },
            ].map((item) => (
              <div
                key={item.step}
                style={{
                  flex: 1,
                  maxWidth: 150,
                  padding: "14px 10px",
                  borderRadius: 16,
                  background: "rgba(255,255,255,0.08)",
                  border: "1px solid rgba(255,255,255,0.12)",
                  textAlign: "center",
                }}
              >
                <div style={{ fontSize: 22, marginBottom: 6 }}>{item.icon}</div>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: "#a3e635",
                    marginBottom: 4,
                  }}
                >
                  STEP {item.step}
                </div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.9)" }}>
                  {item.label}
                </div>
              </div>
            ))}
          </div>

          {/* Audience tags */}
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              justifyContent: "center",
              gap: 10,
              marginTop: 28,
            }}
          >
            {["Parents", "Teachers", "Students", "Admin"].map((role) => (
              <span
                key={role}
                style={{
                  padding: "6px 14px",
                  borderRadius: 999,
                  fontSize: 12,
                  fontWeight: 600,
                  background: "rgba(163,230,53,0.15)",
                  border: "1px solid rgba(163,230,53,0.35)",
                  color: "#d9f99d",
                }}
              >
                {role}
              </span>
            ))}
          </div>

          {/* Footer */}
          <div
            style={{
              marginTop: "auto",
              paddingTop: 24,
              width: "100%",
              borderTop: "1px solid rgba(255,255,255,0.12)",
              textAlign: "center",
            }}
          >
            <p
              style={{
                margin: "0 0 6px",
                fontSize: 18,
                fontWeight: 700,
                color: "#ffffff",
              }}
            >
              Your school, one tap away
            </p>
            <p
              style={{
                margin: 0,
                fontSize: 11,
                color: "rgba(255,255,255,0.5)",
                wordBreak: "break-all",
                lineHeight: 1.4,
              }}
            >
              {downloadUrl || "timelly.app/download"}
            </p>
          </div>
        </div>
      </div>
    );
  }
);

export default InstallAppPoster;

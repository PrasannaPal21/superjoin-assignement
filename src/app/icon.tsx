import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

/** Tab / bookmark icon: indigo tile with a document + check mark. */
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
          background: "#3730a3",
          borderRadius: 7,
        }}
      >
        <div
          style={{
            width: 18,
            height: 22,
            display: "flex",
            position: "relative",
            background: "#ffffff",
            borderRadius: 2,
          }}
        >
          <div
            style={{
              position: "absolute",
              top: 0,
              right: 0,
              width: 6,
              height: 6,
              background: "#c7d2fe",
              display: "flex",
            }}
          />
          <div
            style={{
              position: "absolute",
              left: 4,
              top: 11,
              width: 5,
              height: 2,
              background: "#3730a3",
              transform: "rotate(45deg)",
              display: "flex",
            }}
          />
          <div
            style={{
              position: "absolute",
              left: 7,
              top: 10,
              width: 8,
              height: 2,
              background: "#3730a3",
              transform: "rotate(-45deg)",
              display: "flex",
            }}
          />
        </div>
      </div>
    ),
    { ...size },
  );
}

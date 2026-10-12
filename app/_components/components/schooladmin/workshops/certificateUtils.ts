/**
 * Generate a certificate image with student name overlaid at the specified position.
 * position: { xPercent, yPercent } - 0–1, where (0.5, 0.5) is center.
 * Returns a PNG blob.
 */
export interface ClickPosition {
  xPercent: number;
  yPercent: number;
}

export interface NameTextStyle {
  fontFamily: string;
  fontSize: number; // px
  fontColor: string; // hex or rgb
  fontWeight: "normal" | "bold";
  textAlign: "left" | "center" | "right";
}

export const DEFAULT_TEXT_STYLE: NameTextStyle = {
  fontFamily: "Georgia",
  fontSize: 32,
  fontColor: "#1a1a1a",
  fontWeight: "bold",
  textAlign: "center",
};

function drawNameOnCanvas(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  studentName: string,
  position: ClickPosition,
  style: NameTextStyle
) {
  const x = w * position.xPercent;
  const y = h * position.yPercent;
  const baseSize = Math.min(w, h) / 15;
  const fontSize = Math.max(12, Math.min(120, style.fontSize || baseSize));
  ctx.font = `${style.fontWeight} ${fontSize}px "${style.fontFamily}", Georgia, serif`;
  ctx.textAlign = style.textAlign;
  ctx.textBaseline = "middle";
  ctx.fillStyle = style.fontColor || DEFAULT_TEXT_STYLE.fontColor;
  ctx.shadowColor = "rgba(255,255,255,0.5)";
  ctx.shadowBlur = 1;
  ctx.fillText(studentName, x, y);
}

export async function generateCertificateWithName(
  imageUrl: string,
  studentName: string,
  position: ClickPosition,
  style: NameTextStyle = DEFAULT_TEXT_STYLE
): Promise<Blob> {
  const sanitizedName = (studentName || "").trim() || "Participant";
  const textStyle = { ...DEFAULT_TEXT_STYLE, ...style };

  const processImage = (img: HTMLImageElement): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas not supported"));
        return;
      }
      const w = img.width;
      const h = img.height;
      canvas.width = w;
      canvas.height = h;
      ctx.drawImage(img, 0, 0, w, h);
      drawNameOnCanvas(ctx, w, h, sanitizedName, position, textStyle);
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("Failed to create blob"))),
        "image/png",
        0.95
      );
    });
  };

  const fetchBlob = fetch(imageUrl, { mode: "cors" })
    .then((r) => {
      if (!r.ok) throw new Error("Failed to load image");
      return r.blob();
    })
    .then((blob) => {
      const url = URL.createObjectURL(blob);
      return new Promise<Blob>((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          processImage(img).then(
            (out) => {
              URL.revokeObjectURL(url);
              resolve(out);
            },
            (err) => {
              URL.revokeObjectURL(url);
              reject(err);
            }
          );
        };
        img.onerror = () => {
          URL.revokeObjectURL(url);
          reject(new Error("Failed to load certificate image"));
        };
        img.src = url;
      });
    });

  const directLoad = new Promise<Blob>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => processImage(img).then(resolve, reject);
    img.onerror = () => reject(new Error("Failed to load certificate image"));
    img.src = imageUrl;
  });

  return fetchBlob.catch(() => directLoad);
}

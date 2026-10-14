import type { ClickPosition, NameTextStyle } from "../certificateUtils";

export function NamePositionStylePanel({
  certificateUrl,
  previewImgSize,
  namePosition,
  onPreviewClick,
  onPreviewImgLoad,
  nameTextStyle,
  onNameTextStyleChange,
}: {
  certificateUrl: string | null;
  previewImgSize: { w: number; h: number } | null;
  namePosition: ClickPosition | null;
  onPreviewClick: (e: React.MouseEvent<HTMLImageElement>) => void;
  onPreviewImgLoad: (e: React.SyntheticEvent<HTMLImageElement>) => void;
  nameTextStyle: NameTextStyle;
  onNameTextStyleChange: (updater: (s: NameTextStyle) => NameTextStyle) => void;
}) {
  return (
    <div>
      <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">
        3. Name Position & Style
      </span>
      <p className="mt-2 text-xs text-white/50 mb-3">
        Click on the certificate where the student name should appear
      </p>
      <div className="mt-3 grid grid-cols-1 xl:grid-cols-[0.75fr_1.25fr] gap-4 items-stretch">
        {certificateUrl ? (
          <div
            className="relative rounded-xl overflow-hidden border-2 border-white/20 hover:border-lime-400/50 bg-black/30 transition-colors h-[220px] sm:h-[240px] lg:h-[260px] flex items-center justify-center"
            style={
              previewImgSize
                ? { aspectRatio: `${previewImgSize.w} / ${previewImgSize.h}` }
                : { aspectRatio: "3 / 2" }
            }
          >
            <img
              src={certificateUrl}
              alt="Certificate preview"
              className="w-full h-full object-cover select-none cursor-crosshair"
              draggable={false}
              onClick={onPreviewClick}
              onLoad={onPreviewImgLoad}
            />
            {namePosition && (
              <div
                className="absolute pointer-events-none w-4 h-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-lime-400 bg-lime-400/40"
                style={{
                  left: `${namePosition.xPercent * 100}%`,
                  top: `${namePosition.yPercent * 100}%`,
                }}
              />
            )}
            {!namePosition && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/30 pointer-events-none">
                <span className="text-sm text-white/70">Click on certificate to set name position</span>
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-xl border border-white/10 bg-black/20 h-[220px] sm:h-[240px] lg:h-[260px] flex items-center justify-center text-white/50 text-sm px-4 text-center">
            Attach a certificate in section 2 to set the name position.
          </div>
        )}

        {/* Text Style Options */}
        <div className="space-y-3 rounded-xl border border-white/10 bg-black/20 p-4 h-full min-w-0">
          <span className="text-xs font-medium text-white/70">Text style</span>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="min-w-0">
              <label className="block text-xs text-white/50 mb-1">Font family</label>
              <select
                value={nameTextStyle.fontFamily}
                onChange={(e) =>
                  onNameTextStyleChange((s) => ({ ...s, fontFamily: e.target.value }))
                }
                className="w-full rounded-lg bg-black/30 border border-white/20 text-sm text-white px-3 py-2.5 focus:outline-none focus:ring-1 focus:ring-lime-400/50"
              >
                <option value="Georgia">Georgia</option>
                <option value="Times New Roman">Times New Roman</option>
                <option value="Arial">Arial</option>
                <option value="Helvetica">Helvetica</option>
                <option value="Courier New">Courier New</option>
                <option value="Verdana">Verdana</option>
              </select>
            </div>
            <div className="min-w-0">
              <label className="block text-xs text-white/50 mb-1">Font size (px)</label>
              <input
                type="number"
                min={12}
                max={120}
                value={nameTextStyle.fontSize}
                onChange={(e) =>
                  onNameTextStyleChange((s) => ({
                    ...s,
                    fontSize: Math.max(12, Math.min(120, Number(e.target.value) || 32)),
                  }))
                }
                className="w-full rounded-lg bg-black/30 border border-white/20 text-sm text-white px-3 py-2.5 focus:outline-none focus:ring-1 focus:ring-lime-400/50"
              />
            </div>
            <div className="min-w-0 sm:col-span-2">
              <label className="block text-xs text-white/50 mb-1">Font color</label>
              <div className="flex gap-2 min-w-0">
                <input
                  type="color"
                  value={nameTextStyle.fontColor}
                  onChange={(e) =>
                    onNameTextStyleChange((s) => ({ ...s, fontColor: e.target.value }))
                  }
                  className="h-9 w-12 shrink-0 rounded cursor-pointer border border-white/20 bg-black/30"
                />
              <input
                type="text"
                value={nameTextStyle.fontColor}
                onChange={(e) =>
                  onNameTextStyleChange((s) => ({ ...s, fontColor: e.target.value || "#1a1a1a" }))
                }
                className="min-w-0 flex-1 rounded-lg bg-black/30 border border-white/20 text-sm text-white px-3 py-2.5 focus:outline-none focus:ring-1 focus:ring-lime-400/50"
                placeholder="#1a1a1a"
              />
            </div>
          </div>
          <div className="min-w-0">
            <label className="block text-xs text-white/50 mb-1">Font weight</label>
            <select
              value={nameTextStyle.fontWeight}
              onChange={(e) =>
                onNameTextStyleChange((s) => ({
                  ...s,
                  fontWeight: e.target.value as "normal" | "bold",
                }))
              }
              className="w-full rounded-lg bg-black/30 border border-white/20 text-sm text-white px-3 py-2.5 focus:outline-none focus:ring-1 focus:ring-lime-400/50"
            >
                <option value="normal">Normal</option>
                <option value="bold">Bold</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs text-white/50 mb-1">Text align</label>
              <div className="flex gap-2">
                {(["left", "center", "right"] as const).map((align) => (
                  <button
                    key={align}
                    type="button"
                    onClick={() =>
                      onNameTextStyleChange((s) => ({ ...s, textAlign: align }))
                    }
                    className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition ${
                      nameTextStyle.textAlign === align
                        ? "bg-lime-400 text-black"
                        : "bg-black/30 border border-white/20 text-white/70 hover:bg-white/10"
                    }`}
                  >
                    {align.charAt(0).toUpperCase() + align.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs text-white/50 mb-1">Preview</label>
              <div className="rounded-lg border border-white/20 bg-white/5 px-4 py-3 min-h-[48px] flex items-center">
                <span
                  className="block w-full"
                  style={{
                    fontFamily: nameTextStyle.fontFamily,
                    fontSize: Math.min(24, nameTextStyle.fontSize),
                    fontWeight: nameTextStyle.fontWeight,
                    color: nameTextStyle.fontColor,
                    textAlign: nameTextStyle.textAlign,
                  }}
                >
                  Student Name
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

"use client";

import { FileDown, Printer } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import InstallAppPoster from "@/app/frontend/components/common/InstallAppPoster";
import { generatePDF, printFromElement } from "@/lib/pdfUtils";

const POSTER_WIDTH = 595;
const POSTER_HEIGHT = 842;

export default function QrPage() {
  const posterRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [downloadUrl, setDownloadUrl] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    setDownloadUrl(`${window.location.origin}/download`);
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const updateScale = () => {
      setScale(Math.min(1, el.clientWidth / POSTER_WIDTH));
    };

    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const handleDownloadPdf = useCallback(async () => {
    if (!posterRef.current || downloading) return;
    setDownloading(true);
    try {
      await generatePDF(posterRef, "timelly-install-poster.pdf");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to download poster PDF.");
    } finally {
      setDownloading(false);
    }
  }, [downloading]);

  const handlePrint = useCallback(async () => {
    if (!posterRef.current || printing) return;
    setPrinting(true);
    try {
      await printFromElement(posterRef, { minHeight: 400 });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to open print preview.");
    } finally {
      setPrinting(false);
    }
  }, [printing]);

  return (
    <div className="min-h-screen px-4 py-8 sm:py-12">
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white sm:text-3xl">Install App Poster</h1>
          <p className="mt-2 max-w-md text-sm text-white/65 leading-relaxed">
            Download or print this poster for your school notice board. Parents and staff can scan
            the QR code to install Timelly on their phones.
          </p>
        </div>

        {/* Poster preview — scales down on small screens */}
        <div
          ref={containerRef}
          className="w-full max-w-[595px] overflow-hidden rounded-2xl border border-white/10 shadow-2xl shadow-black/50"
          style={{ height: POSTER_HEIGHT * scale }}
        >
          <div
            style={{
              transform: `scale(${scale})`,
              transformOrigin: "top left",
              width: POSTER_WIDTH,
            }}
          >
            <InstallAppPoster ref={posterRef} downloadUrl={downloadUrl} />
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex w-full max-w-md flex-col gap-3 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={() => void handleDownloadPdf()}
            disabled={!downloadUrl || downloading}
            className="inline-flex flex-1 items-center justify-center gap-2.5 rounded-2xl bg-lime-500 px-6 py-3.5 text-sm font-bold text-black shadow-lg shadow-lime-500/25 transition hover:bg-lime-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <FileDown className="h-5 w-5 shrink-0" aria-hidden />
            {downloading ? "Generating PDF…" : "Download PDF"}
          </button>
          <button
            type="button"
            onClick={() => void handlePrint()}
            disabled={!downloadUrl || printing}
            className="inline-flex flex-1 items-center justify-center gap-2.5 rounded-2xl border border-white/20 bg-white/5 px-6 py-3.5 text-sm font-bold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Printer className="h-5 w-5 shrink-0" aria-hidden />
            {printing ? "Preparing…" : "Print Poster"}
          </button>
        </div>

        <p className="text-center text-xs text-white/40">
          Tip: Print on A4 paper and pin it on your notice board near the school entrance.
        </p>
      </div>
    </div>
  );
}

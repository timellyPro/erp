"use client";

import TimellyLoader from "../common/TimellyLoader";
import { PARENT_LOADER_PRESETS, type ParentLoaderPresetKey } from "./parentLoaderPresets";

type Props = {
  preset: ParentLoaderPresetKey;
  compact?: boolean;
  bare?: boolean;
  className?: string;
};

export default function ParentTimellyLoader({ preset, compact, bare, className }: Props) {
  const cfg = PARENT_LOADER_PRESETS[preset];
  return (
    <TimellyLoader
      title={cfg.title}
      steps={[...cfg.steps]}
      ariaLabel={cfg.ariaLabel}
      compact={compact}
      bare={bare}
      className={className}
    />
  );
}

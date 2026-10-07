"use client";

import React from "react";
import {
  PARENT_DASHBOARD_BG_BASE,
  PARENT_DASHBOARD_BG_CORAL_BLOB,
  PARENT_DASHBOARD_BG_PURPLE_BLOB,
} from "../../constants/colors";

// Blob background used on the parent dashboard (matched to your provided design).
export function GlobalBackground() {
  return (
    <div className="fixed inset-0 z-[-1] pointer-events-none overflow-hidden">
      {/* Base black background */}
      {/* Base black background - kept exactly per desktop design */}
      <div className="absolute inset-0 bg-black" style={{ backgroundColor: PARENT_DASHBOARD_BG_BASE }} />

      {/* Gradient Blobs */}
      <div className="absolute inset-0 overflow-clip">
        {/* Purple blob - Top Left */}
        <div
          className="absolute blur-[120px] left-[-100px] md:left-[-148px] opacity-40 rounded-full w-[350px] h-[350px] md:w-[782px] md:h-[782px] top-[-100px] md:top-[-185px]"
          style={{ backgroundColor: PARENT_DASHBOARD_BG_PURPLE_BLOB }}
        />

        {/* Coral blob - Top Right */}
        <div
          className="absolute blur-[120px] right-[-150px] md:right-[-230px] opacity-40 rounded-full w-[320px] h-[320px] md:w-[739px] md:h-[739px] top-[-80px] md:top-[-133px]"
          style={{ backgroundColor: PARENT_DASHBOARD_BG_CORAL_BLOB }}
        />

        {/* Purple blob - Bottom Center-Left */}
        <div
          className="absolute blur-[120px] left-[5%] md:left-[20%] opacity-40 rounded-full w-[300px] h-[300px] md:w-[705px] md:h-[705px] bottom-[-100px] md:bottom-[-200px]"
          style={{ backgroundColor: PARENT_DASHBOARD_BG_PURPLE_BLOB }}
        />

        {/* Coral blob - Bottom Center-Right */}
        <div
          className="absolute blur-[120px] right-[5%] md:right-[20%] opacity-30 rounded-full w-[280px] h-[280px] md:w-[643px] md:h-[643px] bottom-[-80px] md:bottom-[-150px]"
          style={{ backgroundColor: PARENT_DASHBOARD_BG_CORAL_BLOB }}
        />
      </div>
    </div>
  );
}


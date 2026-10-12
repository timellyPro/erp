import type { ElementType } from "react";
import { Permission } from "../enums/permissions";

// types/sidebar.ts
export type SidebarItem = {
  label: string;
  description?: string;
  mobileLabel?: string;
  tab?: string;
  href?: string;
  icon: ElementType;
  action?: "logout";
  permission?: Permission;
  /**
   * When true, this menu item requires an active parent subscription
   * (used only in parent portal).
   */
  requiresSubscription?: boolean;
  /**
   * When true, item is visually disabled and not clickable.
   */
  disabled?: boolean;
};

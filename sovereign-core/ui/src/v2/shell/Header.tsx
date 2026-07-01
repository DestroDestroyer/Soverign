import React from "react";
import { ArrowLeftRight, Bell, Search } from "lucide-react";
import { Button, Icon, KBD } from "../ui";
import "./Header.css";

export type ConnectionState = "live" | "degraded" | "offline";
/**
 * Mode kept as a type for prop compatibility with existing callers (mock
 * shell still threads it), but the visible toggle was removed in 6.6
 * follow-up — it never actually drove any daemon state.
 */
export type Mode = "active" | "passive" | "off";

const CONNECTION_LABEL: Record<ConnectionState, string> = {
  live: "Online",
  degraded: "Degraded",
  offline: "Offline",
};

export interface HeaderProps {
  connection?: ConnectionState;
  /** @deprecated kept for prop compatibility — no longer rendered. */
  mode?: Mode;
  /** @deprecated kept for prop compatibility — no longer rendered. */
  onModeChange?: (next: Mode) => void;
  onPalette?: () => void;
  viewMode?: "chat" | "graph";
  onViewModeChange?: (next: "chat" | "graph") => void;
  notificationCount?: number;
  notificationsOpen?: boolean;
  onToggleNotifications?: () => void;
  notificationsSlot?: React.ReactNode;
}

export function Header({
  connection = "live",
  onPalette,
  viewMode = "chat",
  onViewModeChange,
  notificationCount = 0,
  notificationsOpen = false,
  onToggleNotifications,
  notificationsSlot,
}: HeaderProps) {
  const isGraph = viewMode === "graph";
  const hasUnread = notificationCount > 0;
  const badgeText = notificationCount > 9 ? "9+" : String(notificationCount);
  const bellLabel = hasUnread
    ? `Notifications, ${notificationCount} unread`
    : "Notifications";
  return (
    <header className="v2-header" role="banner">
      <div className="v2-header__left">
        <span className="v2-header__connection" aria-label={`Connection ${CONNECTION_LABEL[connection]}`}>
          <span className={`v2-header__conn-dot v2-header__conn-dot--${connection}`} aria-hidden="true" />
          {CONNECTION_LABEL[connection]}
        </span>
      </div>

      <div className="v2-header__right">
        <button
          type="button"
          className="v2-header__iconbtn"
          data-graph={isGraph || undefined}
          onClick={() => onViewModeChange?.(isGraph ? "chat" : "graph")}
          aria-label={isGraph ? "Switch to chat" : "Switch to memory graph"}
          title={isGraph ? "Chat" : "Memory Graph"}
        >
          <Icon icon={ArrowLeftRight} size="md" />
        </button>

        <button
          type="button"
          className="v2-header__palette"
          onClick={onPalette}
          aria-label="Open command palette"
        >
          <span className="v2-header__palette-icon">
            <Icon icon={Search} size="sm" />
          </span>
          <span className="v2-header__palette-label">Quick open</span>
          <KBD>⌘K</KBD>
        </button>

        <span className="v2-header__notif-anchor">
          <button
            type="button"
            data-notif-toggle
            className="v2-header__iconbtn"
            data-active={notificationsOpen ? "true" : undefined}
            aria-label={bellLabel}
            aria-haspopup="dialog"
            aria-expanded={notificationsOpen}
            onClick={onToggleNotifications}
          >
            <Icon icon={Bell} size="md" />
            {hasUnread && (
              <span className="v2-header__notif-badge" aria-hidden="true">
                {badgeText}
              </span>
            )}
          </button>
          {notificationsSlot}
        </span>

      </div>
    </header>
  );
}

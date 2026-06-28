import React, { useEffect, useState } from "react";
import type { SettingsHook } from "../useSettingsData";

export function ChannelsTab({
  data,
  onToast,
}: {
  data: SettingsHook;
  onToast: (text: string, tone?: "ok" | "warn") => void;
}) {
  const { channelStatus, channelCfg } = data;

  const [tgToken, setTgToken] = useState("");
  const [tgAllowed, setTgAllowed] = useState("");

  const [dcToken, setDcToken] = useState("");
  const [dcAllowed, setDcAllowed] = useState("");
  const [dcGuild, setDcGuild] = useState("");

  useEffect(() => {
    if (channelCfg) {
      setTgAllowed(channelCfg.telegram.allowed_users.join(", "));
      setDcAllowed(channelCfg.discord.allowed_users.join(", "));
      setDcGuild(channelCfg.discord.guild_id ?? "");
    }
  }, [channelCfg]);

  return (
    <div>
      <section className="v2-set__section">
        <div className="v2-set__section-head">
          <div>
            <h3 className="v2-set__section-title">Telegram</h3>
            <div className="v2-set__section-sub">
              Bot via @BotFather. Restart-required after token changes.
            </div>
          </div>
          <span className={"v2-set__chip " + (channelStatus?.channels.telegram ? "v2-set__chip--ok" : "")}>
            {channelStatus?.channels.telegram ? "Connected" : "Disconnected"}
          </span>
        </div>

        <label className="v2-set__toggle-row">
          <button
            type="button"
            className="v2-set__toggle"
            data-checked={!!channelCfg?.telegram.enabled}
            aria-checked={!!channelCfg?.telegram.enabled}
            role="switch"
            onClick={async () => {
              const r = await data.setTelegram({
                enabled: !channelCfg?.telegram.enabled,
              });
              onToast(r.message, r.ok ? "ok" : "warn");
            }}
          />
          <span>Enable Telegram</span>
          {channelCfg?.telegram.has_token && (
            <span className="v2-set__chip" style={{ marginLeft: "auto" }}>
              token configured
            </span>
          )}
        </label>

        <div className="v2-set__field">
          <label className="v2-set__field-label">Bot token</label>
          <input
            className="v2-set__input"
            type="password"
            placeholder="leave empty to keep existing"
            value={tgToken}
            onChange={(e) => setTgToken(e.target.value)}
          />
        </div>
        <div className="v2-set__field">
          <label className="v2-set__field-label">Allowed user IDs (comma-separated)</label>
          <input
            className="v2-set__input"
            type="text"
            value={tgAllowed}
            onChange={(e) => setTgAllowed(e.target.value)}
          />
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button
            type="button"
            className="v2-set__btn v2-set__btn--primary"
            onClick={async () => {
              const allowed = tgAllowed
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean)
                .map(Number)
                .filter((n) => Number.isFinite(n));
              const r = await data.setTelegram({
                bot_token: tgToken || undefined,
                allowed_users: allowed,
              });
              if (r.ok) setTgToken("");
              onToast(r.message, r.ok ? "ok" : "warn");
            }}
          >
            Save Telegram
          </button>
        </div>
      </section>

      <section className="v2-set__section">
        <div className="v2-set__section-head">
          <div>
            <h3 className="v2-set__section-title">Discord</h3>
            <div className="v2-set__section-sub">
              Bot via discord.com/developers. Enable Message Content Intent. Restart-required.
            </div>
          </div>
          <span className={"v2-set__chip " + (channelStatus?.channels.discord ? "v2-set__chip--ok" : "")}>
            {channelStatus?.channels.discord ? "Connected" : "Disconnected"}
          </span>
        </div>

        <label className="v2-set__toggle-row">
          <button
            type="button"
            className="v2-set__toggle"
            data-checked={!!channelCfg?.discord.enabled}
            aria-checked={!!channelCfg?.discord.enabled}
            role="switch"
            onClick={async () => {
              const r = await data.setDiscord({
                enabled: !channelCfg?.discord.enabled,
              });
              onToast(r.message, r.ok ? "ok" : "warn");
            }}
          />
          <span>Enable Discord</span>
          {channelCfg?.discord.has_token && (
            <span className="v2-set__chip" style={{ marginLeft: "auto" }}>
              token configured
            </span>
          )}
        </label>

        <div className="v2-set__field">
          <label className="v2-set__field-label">Bot token</label>
          <input
            className="v2-set__input"
            type="password"
            placeholder="leave empty to keep existing"
            value={dcToken}
            onChange={(e) => setDcToken(e.target.value)}
          />
        </div>
        <div className="v2-set__field">
          <label className="v2-set__field-label">Allowed user IDs (comma-separated)</label>
          <input
            className="v2-set__input"
            type="text"
            value={dcAllowed}
            onChange={(e) => setDcAllowed(e.target.value)}
          />
        </div>
        <div className="v2-set__field">
          <label className="v2-set__field-label">Guild ID (optional, restrict to one server)</label>
          <input
            className="v2-set__input"
            type="text"
            value={dcGuild}
            onChange={(e) => setDcGuild(e.target.value)}
          />
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button
            type="button"
            className="v2-set__btn v2-set__btn--primary"
            onClick={async () => {
              const allowed = dcAllowed
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean);
              const r = await data.setDiscord({
                bot_token: dcToken || undefined,
                allowed_users: allowed,
                guild_id: dcGuild || undefined,
              });
              if (r.ok) setDcToken("");
              onToast(r.message, r.ok ? "ok" : "warn");
            }}
          >
            Save Discord
          </button>
        </div>
      </section>
    </div>
  );
}

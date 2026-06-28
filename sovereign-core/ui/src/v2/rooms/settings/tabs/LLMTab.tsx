import React from "react";

export default function LLMTab() {
  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      height: "100%",
      padding: "40px",
      textAlign: "center",
      color: "#888",
      gap: "16px",
    }}>
      <div style={{ fontSize: "48px", marginBottom: "8px" }}>⚙️</div>
      <h3 style={{ margin: 0, color: "#ccc" }}>LLM Settings Moved</h3>
      <p style={{ maxWidth: "400px", lineHeight: "1.6", fontSize: "14px" }}>
        Model, provider, and API key configuration is now managed in the
        <strong> Desktop Console Settings</strong> panel (click the gear icon
        in the sidebar footer) for a unified experience.
      </p>
      <div style={{
        marginTop: "8px",
        padding: "10px 16px",
        background: "rgba(255,200,50,0.08)",
        border: "1px solid rgba(255,200,50,0.2)",
        borderRadius: "8px",
        fontSize: "13px",
        color: "#cc9900",
        maxWidth: "380px",
      }}>
        Changes made here will not persist. Use the outer settings panel instead.
      </div>
    </div>
  );
}

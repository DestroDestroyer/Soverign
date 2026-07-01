import React, { useCallback, useEffect, useMemo, useState } from "react";
import { BrainCircuit, Search, X } from "lucide-react";
import { Icon, KBD } from "../ui";
import { useMemoryData } from "../rooms/memory/useMemoryData";
import { MemoryGraph3D } from "../graph/MemoryGraph3D";
import type { Entity, EntityType } from "../rooms/memory/useMemoryData";

const TYPE_LABEL: Record<EntityType, string> = {
  person: "People",
  project: "Projects",
  tool: "Tools",
  place: "Places",
  concept: "Concepts",
  event: "Events",
};

const FILTER_COLORS: Record<string, string> = {
  all: "#00f2fe",
  person: "#34d399",
  project: "#60a5fa",
  tool: "#f59e0b",
  place: "#a78bfa",
  concept: "#f472b6",
  event: "#fb923c",
};

export function GraphDashboard() {
  const data = useMemoryData();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<EntityType | "all">("all");
  const [selectedEntity, setSelectedEntity] = useState<Entity | null>(null);
  const [showPanel, setShowPanel] = useState(false);

  const filteredEntities = useMemo(() => {
    let list = data.entities;
    if (typeFilter !== "all") list = list.filter((e) => e.type === typeFilter);
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((e) => e.name.toLowerCase().includes(q));
    return list;
  }, [data.entities, search, typeFilter]);

  const typeCounts = useMemo(() => {
    const out: Record<string, number> = { all: data.entities.length };
    for (const e of data.entities) out[e.type] = (out[e.type] || 0) + 1;
    return out;
  }, [data.entities]);

  const onSelectEntity = useCallback((id: string | null) => {
    const ent = id ? data.entities.find((e) => e.id === id) ?? null : null;
    setSelectedEntity(ent);
    setShowPanel(!!ent);
  }, [data.entities]);

  const closePanel = useCallback(() => {
    setSelectedEntity(null);
    setShowPanel(false);
  }, []);

  const facts = selectedEntity ? data.factsBySubject.get(selectedEntity.id) ?? [] : [];
  const rels = selectedEntity ? data.relsByEntity.get(selectedEntity.id) ?? [] : [];

  return (
    <div className="v2-graph-dashboard" style={{
      display: "flex",
      flexDirection: "column",
      height: "100vh",
      background: "#0a0a18",
      color: "#e0e0ff",
      fontFamily: "system-ui, sans-serif",
    }}>
      {/* Top bar */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 16px",
        borderBottom: "1px solid #1c1c3a",
        background: "#0a0a18",
        minHeight: 48,
        flexShrink: 0,
      }}>
        <BrainCircuit size={18} color="#00f2fe" />
        <span style={{ fontSize: 13, fontWeight: 600, color: "#e0e0ff", letterSpacing: "0.05em" }}>
          MEMORY GRAPH
        </span>
        <span style={{ fontSize: 11, color: "#6868a0" }}>
          {data.entities.length} entities · {data.relationships.length} connections
        </span>

        <div style={{ flex: 1 }} />

        {/* Search */}
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "4px 10px",
          background: "#12122a",
          border: "1px solid #1c1c3a",
          borderRadius: 20,
          minWidth: 180,
        }}>
          <Search size={14} color="#6868a0" />
          <input
            type="text"
            placeholder="Search memories..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              background: "none",
              border: "none",
              color: "#e0e0ff",
              fontSize: 12,
              outline: "none",
              width: "100%",
              fontFamily: "inherit",
            }}
          />
        </div>

        {/* Type filters */}
        <div style={{ display: "flex", gap: 4 }}>
          {(["all", "person", "project", "tool", "place", "concept", "event"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTypeFilter(t)}
              style={{
                padding: "4px 10px",
                borderRadius: 14,
                border: `1px solid ${typeFilter === t ? FILTER_COLORS[t] : "#1c1c3a"}`,
                background: typeFilter === t ? FILTER_COLORS[t] + "15" : "transparent",
                color: typeFilter === t ? FILTER_COLORS[t] : "#6868a0",
                fontSize: 11,
                cursor: "pointer",
                fontFamily: "inherit",
                transition: "all 0.15s",
              }}
              title={TYPE_LABEL[t as EntityType] || t}
            >
              {t === "all" ? "All" : TYPE_LABEL[t as EntityType]}
              <span style={{ marginLeft: 4, opacity: 0.6 }}>{typeCounts[t]}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Canvas area */}
      <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
        <MemoryGraph3D
          entities={filteredEntities}
          relationships={data.relationships}
          onSelectEntity={onSelectEntity}
        />

        {/* Detail panel */}
        {showPanel && selectedEntity && (
          <div style={{
            position: "absolute",
            top: 12,
            right: 12,
            width: 280,
            maxHeight: "calc(100% - 24px)",
            overflowY: "auto",
            background: "#12122a",
            border: "1px solid #1c1c3a",
            borderRadius: 12,
            padding: 16,
            fontFamily: "system-ui, sans-serif",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#e0e0ff" }}>{selectedEntity.name}</div>
                <div style={{ fontSize: 11, color: "#6868a0", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  {selectedEntity.type}
                </div>
              </div>
              <button
                type="button"
                onClick={closePanel}
                style={{
                  background: "none",
                  border: "none",
                  color: "#6868a0",
                  cursor: "pointer",
                  padding: 2,
                }}
              >
                <X size={14} />
              </button>
            </div>

            {facts.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, color: "#6868a0", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Facts ({facts.length})
                </div>
                {facts.map((f) => (
                  <div key={f.id} style={{ padding: "4px 0", borderBottom: "1px solid #1c1c3a", fontSize: 12, color: "#9898c8" }}>
                    <span style={{ color: "#00f2fe" }}>{f.predicate}</span>
                    {" "}→{" "}
                    <span>{f.object}</span>
                    <span style={{ fontSize: 10, color: "#6868a0", marginLeft: 6 }}>
                      {Math.round(f.confidence * 100)}%
                    </span>
                  </div>
                ))}
              </div>
            )}

            {rels.length > 0 && (
              <div>
                <div style={{ fontSize: 11, color: "#6868a0", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Connections ({rels.length})
                </div>
                {rels.slice(0, 8).map((r) => {
                  const otherId = r.from_id === selectedEntity.id ? r.to_id : r.from_id;
                  const other = data.entities.find((e) => e.id === otherId);
                  return (
                    <div key={r.id} style={{ padding: "4px 0", fontSize: 12, color: "#9898c8" }}>
                      <span style={{ color: "#a78bfa" }}>{r.type}</span>
                      {" "}→{" "}
                      <span>{other?.name ?? "(unknown)"}</span>
                    </div>
                  );
                })}
                {rels.length > 8 && (
                  <div style={{ fontSize: 11, color: "#6868a0", marginTop: 4 }}>
                    +{rels.length - 8} more
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

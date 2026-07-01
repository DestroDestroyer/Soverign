import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Entity, Fact, Relationship } from "../rooms/memory/useMemoryData";

interface GraphNode {
  id: string;
  label: string;
  type: string;
  x: number;
  y: number;
  z: number;
  size: number;
  color: string;
  vx: number;
  vy: number;
  vz: number;
}

interface GraphEdge {
  from: string;
  to: string;
  type: string;
}

const TYPE_COLORS: Record<string, string> = {
  person: "#34d399",
  project: "#60a5fa",
  tool: "#f59e0b",
  place: "#a78bfa",
  concept: "#f472b6",
  event: "#fb923c",
};

const BRAIN_COLOR = "#00f2fe";

function buildGraph(
  entities: Entity[],
  relationships: Relationship[],
  factsBySubject?: Map<string, Fact[]>,
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const count = entities.length;
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  if (count === 0) return { nodes, edges };

  // Spherical layout with golden-angle spiral for even distribution
  const radius = Math.max(180, Math.min(350, 150 + count * 8));
  for (let i = 0; i < count; i++) {
    const e = entities[i]!;
    const t = (i / count) * Math.PI * 2 * 1.618;
    const p = Math.acos(1 - 2 * (i + 0.5) / count);
    const x = radius * Math.sin(p) * Math.cos(t);
    const y = radius * Math.sin(p) * Math.sin(t);
    const z = radius * Math.cos(p);
    const factCount = factsBySubject?.get(e.id)?.length ?? 0;
    const size = Math.max(3, Math.min(8, 2 + factCount * 0.5));
    nodes.push({
      id: e.id,
      label: e.name,
      type: e.type,
      x, y, z,
      size,
      color: TYPE_COLORS[e.type] || "#6868a0",
      vx: 0, vy: 0, vz: 0,
    });
  }

  // Relationship edges
  const seen = new Set<string>();
  for (const r of relationships) {
    const key = [r.from_id, r.to_id].sort().join("-");
    if (seen.has(key)) continue;
    seen.add(key);
    edges.push({ from: r.from_id, to: r.to_id, type: r.type });
  }

  return { nodes, edges };
}

export function MemoryGraph3D({
  entities,
  relationships,
  factsBySubject,
  onSelectEntity,
}: {
  entities: Entity[];
  relationships: Relationship[];
  factsBySubject?: Map<string, Fact[]>;
  onSelectEntity?: (id: string | null) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<number>(0);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Rotation state
  const rotRef = useRef({ x: -0.3, y: 0.5, z: 0 });
  const dragRef = useRef<{ active: boolean; lastX: number; lastY: number }>({ active: false, lastX: 0, lastY: 0 });
  const mouseRef = useRef({ x: 0, y: 0 });

  const graph = useMemo(() => buildGraph(entities, relationships, factsBySubject), [entities, relationships, factsBySubject]);

  // Resize observer
  useEffect(() => {
    if (!containerRef.current) return;
    const obs = new ResizeObserver((entries) => {
      const e = entries[0];
      if (!e) return;
      const { width, height } = e.contentRect;
      if (width > 0 && height > 0) setSize({ w: width, h: height });
    });
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  // Animation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const nodes = graph.nodes;
    const edges = graph.edges;
    const nodeMap = new Map(nodes.map((n) => [n.id, n]));

    // Build spatial hash for fast nearest-neighbor lookup for edge rendering
    const edgePairs = edges
      .map((e) => {
        const a = nodeMap.get(e.from);
        const b = nodeMap.get(e.to);
        return a && b ? { a, b, type: e.type } : null;
      })
      .filter(Boolean);

    let angle = 0;
    const BRAIN_PULSE_SPEED = 0.008;

    const render = () => {
      const w = size.w;
      const h = size.h;
      canvas!.width = w * devicePixelRatio;
      canvas!.height = h * devicePixelRatio;
      ctx!.scale(devicePixelRatio, devicePixelRatio);

      // Clear to transparent
      ctx!.clearRect(0, 0, w, h);

      angle += BRAIN_PULSE_SPEED;
      const rx = rotRef.current.x;
      const ry = rotRef.current.y;

      // Project nodes to 2D with z-sorting
      const projected: Array<{
        id: string;
        label: string;
        sx: number;
        sy: number;
        sz: number;
        size: number;
        color: string;
        type: string;
        node: GraphNode;
      }> = [];

      const cx = w / 2;
      const cy = h / 2;
      const scale = Math.min(w, h) * 0.006;

      for (const node of nodes) {
        // Rotate around Y
        const cosY = Math.cos(ry);
        const sinY = Math.sin(ry);
        const x1 = node.x * cosY - node.z * sinY;
        const z1 = node.x * sinY + node.z * cosY;

        // Rotate around X
        const cosX = Math.cos(rx);
        const sinX = Math.sin(rx);
        const y1 = node.y * cosX - z1 * sinX;
        const z2 = node.y * sinX + z1 * cosX;

        const sx = cx + x1 * scale;
        const sy = cy + y1 * scale;
        const sz = z2;

        projected.push({
          id: node.id,
          label: node.label,
          sx, sy, sz,
          size: node.size,
          color: node.color,
          type: node.type,
          node,
        });
      }

      // Sort by z-depth (back to front)
      projected.sort((a, b) => a.sz - b.sz);

      // Draw edges
      for (const pair of edgePairs) {
        if (!pair) continue;
        const a = projected.find((p) => p.id === pair.a.id);
        const b = projected.find((p) => p.id === pair.b.id);
        if (!a || !b) continue;

        const alpha = Math.max(0.05, Math.min(0.3, (a.sz + b.sz) / 600 + 0.15));
        ctx!.beginPath();
        ctx!.moveTo(a.sx, a.sy);
        ctx!.lineTo(b.sx, b.sy);
        ctx!.strokeStyle = `rgba(104, 104, 160, ${alpha})`;
        ctx!.lineWidth = 0.5;
        ctx!.stroke();
      }

      // Draw nodes
      for (const p of projected) {
        const depthAlpha = Math.max(0.2, Math.min(1, (p.sz + 400) / 600));
        const isHovered = hoveredId === p.id;
        const isSelected = selectedId === p.id;
        const r = p.size * (isHovered || isSelected ? 1.6 : 1);

        // Glow for selected/hovered
        if (isHovered || isSelected) {
          const gradient = ctx!.createRadialGradient(p.sx, p.sy, 0, p.sx, p.sy, r * 3);
          gradient.addColorStop(0, p.color + "40");
          gradient.addColorStop(1, p.color + "00");
          ctx!.beginPath();
          ctx!.arc(p.sx, p.sy, r * 3, 0, Math.PI * 2);
          ctx!.fillStyle = gradient;
          ctx!.fill();
        }

        // Node circle
        ctx!.beginPath();
        ctx!.arc(p.sx, p.sy, r, 0, Math.PI * 2);
        ctx!.fillStyle = p.color;
        ctx!.globalAlpha = depthAlpha;
        ctx!.fill();
        ctx!.globalAlpha = 1;
        ctx!.strokeStyle = p.color + "80";
        ctx!.lineWidth = 1;
        ctx!.stroke();

        // Label for hovered/selected
        if (isHovered || isSelected) {
          ctx!.fillStyle = "#e0e0ff";
          ctx!.font = `${Math.max(11, r * 2)}px system-ui, sans-serif`;
          ctx!.textAlign = "center";
          ctx!.fillText(p.label, p.sx, p.sy + r + 16);
        }
      }

      // Center brain
      const brainPulse = 1 + Math.sin(angle * 3) * 0.08;
      const brainR = 20 * brainPulse;
      const brainGrad = ctx!.createRadialGradient(cx, cy, 0, cx, cy, brainR * 2.5);
      brainGrad.addColorStop(0, BRAIN_COLOR + "60");
      brainGrad.addColorStop(0.4, BRAIN_COLOR + "30");
      brainGrad.addColorStop(1, BRAIN_COLOR + "00");
      ctx!.beginPath();
      ctx!.arc(cx, cy, brainR * 2.5, 0, Math.PI * 2);
      ctx!.fillStyle = brainGrad;
      ctx!.fill();

      // Brain core
      const coreGrad = ctx!.createRadialGradient(cx - brainR * 0.2, cy - brainR * 0.2, 0, cx, cy, brainR);
      coreGrad.addColorStop(0, "#ffffff");
      coreGrad.addColorStop(0.3, BRAIN_COLOR);
      coreGrad.addColorStop(1, BRAIN_COLOR + "80");
      ctx!.beginPath();
      ctx!.arc(cx, cy, brainR, 0, Math.PI * 2);
      ctx!.fillStyle = coreGrad;
      ctx!.fill();

      // Brain label
      ctx!.fillStyle = "#ffffff";
      ctx!.font = "bold 10px system-ui, sans-serif";
      ctx!.textAlign = "center";
      ctx!.textBaseline = "middle";
      ctx!.fillText("BRAIN", cx, cy);

      // Subtle auto-rotation
      rotRef.current.y += 0.002;

      animRef.current = requestAnimationFrame(render);
    };

    animRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animRef.current);
  }, [graph, size, hoveredId, selectedId]);

  // Mouse handlers for rotation and hover
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    dragRef.current.active = true;
    dragRef.current.lastX = e.clientX;
    dragRef.current.lastY = e.clientY;
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    mouseRef.current.x = e.clientX;
    mouseRef.current.y = e.clientY;

    if (dragRef.current.active) {
      const dx = e.clientX - dragRef.current.lastX;
      const dy = e.clientY - dragRef.current.lastY;
      rotRef.current.y += dx * 0.005;
      rotRef.current.x += dy * 0.005;
      rotRef.current.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, rotRef.current.x));
      dragRef.current.lastX = e.clientX;
      dragRef.current.lastY = e.clientY;
    }
  }, []);

  const onPointerUp = useCallback(() => {
    dragRef.current.active = false;
  }, []);

  const onClick = useCallback(() => {
    // Find nearest node under cursor
    if (!canvasRef.current || graph.nodes.length === 0) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const mx = mouseRef.current.x - rect.left;
    const my = mouseRef.current.y - rect.top;
    const cx = size.w / 2;
    const cy = size.h / 2;
    const scale = Math.min(size.w, size.h) * 0.006;

    const rx = rotRef.current.x;
    const ry = rotRef.current.y;

    let closest: { id: string; dist: number } | null = null;

    for (const node of graph.nodes) {
      const cosY = Math.cos(ry);
      const sinY = Math.sin(ry);
      const x1 = node.x * cosY - node.z * sinY;
      const z1 = node.x * sinY + node.z * cosY;
      const cosX = Math.cos(rx);
      const sinX = Math.sin(rx);
      const y1 = node.y * cosX - z1 * sinX;
      const sx = cx + x1 * scale;
      const sy = cy + y1 * scale;
      const dist = Math.sqrt((sx - mx) ** 2 + (sy - my) ** 2);
      if (dist < 20 && (!closest || dist < closest.dist)) {
        closest = { id: node.id, dist };
      }
    }

    if (closest) {
      const next = selectedId === closest.id ? null : closest.id;
      setSelectedId(next);
      onSelectEntity?.(next);
    } else {
      setSelectedId(null);
      onSelectEntity?.(null);
    }
  }, [graph.nodes, size, selectedId, onSelectEntity]);

  return (
    <div
      ref={containerRef}
      className="v2-graph3d"
      style={{ width: "100%", height: "100%", position: "relative", overflow: "hidden", cursor: dragRef.current.active ? "grabbing" : "grab" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
      onClick={onClick}
    >
      <canvas
        ref={canvasRef}
        style={{ width: "100%", height: "100%", display: "block" }}
      />
      <div style={{ position: "absolute", bottom: 12, left: 12, display: "flex", gap: 8, alignItems: "center", pointerEvents: "none" }}>
        <span style={{ fontSize: 11, color: "#6868a0", fontFamily: "system-ui, sans-serif" }}>
          {graph.nodes.length} memories · drag to orbit · click to select
        </span>
      </div>
    </div>
  );
}

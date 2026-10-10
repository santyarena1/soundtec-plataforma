"use client";

/**
 * Plano técnico de la sala (modo manual): el plano en planta con cada cable de
 * puerto a puerto, editable. Herramientas Elegir y Cable; panel con resumen,
 * ficha de equipo y ficha de cable. Todo se guarda en la escena del proyecto.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Cable, MousePointer2, X } from "lucide-react";
import { toast } from "sonner";
import type { CablingState } from "../cabling/use-cabling";
import type { RoomScene } from "@/services/room-builder/scene";
import type { DeviceUnit } from "@/services/room-builder/units";
import { autoWires, buildWiringModel, numberLabels, wiringOf, type PlacedDevice } from "@/services/room-builder/wiring/model";
import { floorOf, planFurniture, planWalls } from "@/services/room-builder/wiring/plan-geometry";
import { signalsCompatible } from "@/services/room-builder/wiring/ports";
import { WIRE_SIGNAL_STYLE, type SceneWiring, type Wire, type WirePort } from "@/services/room-builder/wiring/types";
import { TechnicalCanvas, type TechSelection, type TechTool } from "./technical-canvas";
import { TechnicalDiagram } from "./technical-diagram";
import { TechnicalInspector } from "./technical-inspector";

type Picker = { device: PlacedDevice; x: number; y: number; stage: "from" | "to" };
type End = { deviceId: string; unit: number; portId: string };

export function TechnicalPlan({
  scene,
  category,
  cabling,
  onSceneChange,
  onUnitsChange,
  onResolve,
}: {
  scene: RoomScene;
  category: string;
  cabling: CablingState;
  onSceneChange: (next: RoomScene) => void;
  onUnitsChange: (slotKey: string, units: DeviceUnit[]) => void;
  /** Resolver y trazar en el servidor: devuelve la escena nueva (con lo agregado y los cables). */
  onResolve?: () => Promise<{ added: Array<{ name: string; reason: string }>; removed?: Array<{ name: string; reason: string }>; remaining: Array<{ title: string; detail: string; fix?: unknown }>; wires: number } | null>;
}) {
  const [tool, setTool] = useState<TechTool>("select");
  const [resolving, setResolving] = useState(false);
  const [resolved, setResolved] = useState<Array<{ name: string; reason: string }> | null>(null);
  const autoRan = useRef(false);
  /** Vista del cableado: planta (recorridos reales) o diagrama de señal (esquema de puertos). */
  const [view, setView] = useState<"planta" | "diagrama">("planta");
  const [selection, setSelection] = useState<TechSelection>(null);
  const [from, setFrom] = useState<End | null>(null);
  const [picker, setPicker] = useState<Picker | null>(null);

  const model = useMemo(() => buildWiringModel(scene, cabling.profile), [scene, cabling.profile]);
  const floor = useMemo(() => floorOf(scene), [scene]);
  const walls = useMemo(() => planWalls(scene, category), [scene, category]);
  const furniture = useMemo(() => planFurniture(scene, category), [scene, category]);
  const withIssues = useMemo(() => new Set(model.issues.map((i) => i.wireId)), [model.issues]);

  const setWiring = (fn: (w: SceneWiring) => SceneWiring) => onSceneChange({ ...scene, wiring: fn(wiringOf(scene)) });
  const taken = (end: { deviceId: string; unit: number }, portId: string) =>
    model.wires.some((w) => (w.from.deviceId === end.deviceId && w.from.unit === end.unit && w.from.portId === portId) || (w.to.deviceId === end.deviceId && w.to.unit === end.unit && w.to.portId === portId));

  function addWire(a: End, b: End) {
    const pa = model.ports[a.deviceId]?.find((q) => q.id === a.portId);
    const da = model.devices.find((d) => d.deviceId === a.deviceId && d.unit === a.unit);
    const db = model.devices.find((d) => d.deviceId === b.deviceId && d.unit === b.unit);
    if (!pa || !da || !db) return;
    // Recorrido a escuadra por defecto (un quiebre), como se tiende en obra.
    const points = Math.abs(da.x - db.x) > 0.05 && Math.abs(da.z - db.z) > 0.05 ? [{ x: db.x, z: da.z }] : [];
    const id = `w-${Date.now().toString(36)}`;
    setWiring((w) => ({ ...w, wires: numberLabels([...w.wires, { id, from: a, to: b, signal: pa.signal, cableProductId: null, label: null, points, lengthOverrideM: null, origin: "manual" }]) }));
    setSelection({ kind: "wire", id });
    setTool("select");
  }

  function onDeviceClick(d: PlacedDevice, x: number, y: number) {
    if (tool !== "cable") {
      setSelection({ kind: "device", deviceId: d.deviceId, unit: d.unit });
      return;
    }
    const ports = model.ports[d.deviceId] ?? [];
    if (!ports.length) {
      toast.error(`${d.short} no tiene puertos: cargalos en su ficha (Elegir → tocá el equipo).`);
      return;
    }
    setPicker({ device: d, x, y, stage: from ? "to" : "from" });
  }

  function choosePort(port: WirePort) {
    if (!picker) return;
    const end = { deviceId: picker.device.deviceId, unit: picker.device.unit, portId: port.id };
    setPicker(null);
    if (picker.stage === "from") {
      setFrom(end);
      toast.message(`Origen: ${picker.device.short} · ${port.label}. Ahora tocá el equipo de destino.`);
      return;
    }
    if (from) addWire(from, end);
    setFrom(null);
  }

  const fromPort = from ? model.ports[from.deviceId]?.find((q) => q.id === from.portId) : null;

  const runResolve = useCallback(async () => {
    if (!onResolve) return;
    setResolving(true);
    try {
      const r = await onResolve();
      if (r) {
        setResolved([...r.added, ...(r.removed ?? []).map((x) => ({ name: `Quitado: ${x.name}`, reason: x.reason }))]);
        const parts = [r.added.length ? `agregó ${r.added.length}` : "", r.removed?.length ? `quitó ${r.removed.length}` : ""].filter(Boolean).join(" y ");
        toast.success(parts ? `El sistema ${parts} equipo(s) y trazó ${r.wires} cables` : `${r.wires} cables trazados con los puertos de cada ficha`);
      }
    } finally {
      setResolving(false);
    }
  }, [onResolve]);

  // Al abrir: si no hay cables trazados, hay lugares sin equipo o algo que el sistema sabe resolver, lo resuelve solo (una vez).
  useEffect(() => {
    if (autoRan.current || !onResolve || !cabling.plan) return;
    const fixable = cabling.plan.findings.some((f) => f.fix);
    const emptySlots = scene.devices.some((d) => !d.productId && !d.generic);
    if (!wiringOf(scene).wires.length || fixable || emptySlots) {
      autoRan.current = true;
      void runResolve();
    }
  }, [cabling.plan, onResolve, runResolve, scene]);

  function moveDevice(d: PlacedDevice, x: number, z: number) {
    const dev = scene.devices.find((s) => s.id === d.deviceId);
    if (!dev?.units) return;
    const units = dev.units.map((u, k) => (k === d.unit ? { ...u, placed: true, pose: { ...u.pose, x, z } } : u));
    onUnitsChange(dev.slotKey, units);
  }

  return (
    <div className="flex h-full min-h-0">
      <div className="relative min-w-0 flex-1">
        <div className="absolute left-1/2 top-2 z-20 flex -translate-x-1/2 rounded-lg border border-slate-300 bg-white p-0.5 shadow-sm" role="tablist" aria-label="Vista del cableado">
          {(["planta", "diagrama"] as const).map((v) => (
            <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => { setView(v); setPicker(null); setFrom(null); }} className={`rounded-md px-3 py-1 text-xs font-semibold ${view === v ? "bg-[#1e3553] text-white" : "text-slate-600 hover:bg-slate-100"}`}>
              {v === "planta" ? "Planta" : "Diagrama de señal"}
            </button>
          ))}
        </div>
        {view === "diagrama" ? (
          <TechnicalDiagram
            model={model}
            positions={wiringOf(scene).diagram ?? {}}
            selection={selection}
            wiresWithIssues={withIssues}
            wireless={(cabling.plan?.links ?? []).filter((l) => l.signal === "wireless")}
            onSelect={setSelection}
            onConnect={addWire}
            onMoveBlocks={(positions) => setWiring((w) => ({ ...w, diagram: positions }))}
            onResetLayout={() => setWiring((w) => ({ ...w, diagram: {} }))}
          />
        ) : (
        <>
        <div className="absolute left-2 top-2 z-10 flex gap-1 rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
          <ToolButton active={tool === "select"} onClick={() => { setTool("select"); setFrom(null); }} icon={<MousePointer2 className="h-4 w-4" />} label="Elegir" />
          <ToolButton active={tool === "cable"} onClick={() => { setTool("cable"); setSelection(null); }} icon={<Cable className="h-4 w-4" />} label="Cable" />
        </div>
        {tool === "cable" ? (
          <div className="absolute left-1/2 top-12 z-10 -translate-x-1/2 rounded-full bg-[#1e3553] px-3 py-1.5 text-xs font-semibold text-white shadow">
            {from && fromPort ? `Desde ${fromPort.label}: tocá el equipo de destino` : "Tocá el equipo de origen y elegí el puerto"}
            {from ? (
              <button type="button" className="ml-2 underline" onClick={() => setFrom(null)}>
                cancelar
              </button>
            ) : null}
          </div>
        ) : null}
        <TechnicalCanvas
          model={model}
          floor={floor}
          walls={walls}
          furniture={furniture}
          selection={selection}
          tool={tool}
          pendingFrom={from}
          wiresWithIssues={withIssues}
          onSelect={setSelection}
          onDeviceClick={onDeviceClick}
          onMoveDevice={moveDevice}
          onWirePoints={(id, points) => setWiring((w) => ({ ...w, wires: w.wires.map((x) => (x.id === id ? { ...x, points, origin: "manual" } : x)) }))}
        />
        {picker ? (
          <PortPicker
            picker={picker}
            ports={model.ports[picker.device.deviceId] ?? []}
            isTaken={(portId) => taken(picker.device, portId)}
            compatibleWith={picker.stage === "to" ? fromPort ?? null : null}
            onPick={choosePort}
            onClose={() => setPicker(null)}
          />
        ) : null}
        <Legend />
        </>
        )}
      </div>
      <aside className="w-80 shrink-0 overflow-y-auto border-l border-slate-200 bg-white">
        <TechnicalInspector
          model={model}
          selection={selection}
          catalog={cabling.catalog}
          autoAvailable={Boolean(cabling.plan)}
          resolved={resolved}
          resolving={resolving}
          review={(cabling.plan?.findings ?? []).filter((f) => (f.level === "error" || f.level === "warn") && !f.fix).map((f) => ({ title: f.title, detail: f.detail }))}
          onSelect={setSelection}
          onUpdateWire={(id, patch) => setWiring((w) => ({ ...w, wires: w.wires.map((x) => (x.id === id ? { ...x, ...patch } : x)) }))}
          onDeleteWire={(id) => {
            setWiring((w) => ({ ...w, wires: w.wires.filter((x) => x.id !== id) }));
            setSelection(null);
          }}
          onReverseWire={(id) => setWiring((w) => ({ ...w, wires: w.wires.map((x) => (x.id === id ? { ...x, from: x.to, to: x.from, points: [...x.points].reverse(), origin: "manual" } : x)) }))}
          onAnotherWire={(w: Wire) => {
            setTool("cable");
            setSelection(null);
            const d = model.devices.find((x) => x.deviceId === w.from.deviceId && x.unit === w.from.unit);
            if (d) setPicker({ device: d, x: 0, y: 0, stage: "from" });
          }}
          onSetPorts={(deviceId, ports) =>
            setWiring((w) => {
              const next = { ...w.ports };
              if (ports) next[deviceId] = ports;
              else delete next[deviceId];
              return { ...w, ports: next };
            })
          }
          onAutoWire={async () => {
            if (onResolve) {
              await runResolve();
              return;
            }
            if (!cabling.plan) return;
            const next = autoWires(cabling.plan, model, wiringOf(scene));
            onSceneChange({ ...scene, wiring: next });
            toast.success(`${next.wires.filter((w) => w.origin === "auto").length} cables trazados con los puertos de cada ficha`);
          }}
          onClearAuto={() => setWiring((w) => ({ ...w, wires: w.wires.filter((x) => x.origin === "manual") }))}
        />
      </aside>
    </div>
  );
}

function ToolButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active} className={`flex flex-col items-center gap-0.5 rounded-md px-2.5 py-1 text-[10.5px] font-semibold ${active ? "bg-[#1e3553] text-white" : "text-slate-600 hover:bg-slate-100"}`}>
      {icon}
      {label}
    </button>
  );
}

/** Lista de puertos del equipo tocado; en el destino solo se habilitan los compatibles con el origen. */
function PortPicker({ picker, ports, isTaken, compatibleWith, onPick, onClose }: { picker: Picker; ports: WirePort[]; isTaken: (id: string) => boolean; compatibleWith: WirePort | null; onPick: (p: WirePort) => void; onClose: () => void }) {
  const ok = (q: WirePort) => !compatibleWith || (signalsCompatible(compatibleWith.signal, q.signal) && !(compatibleWith.direction === q.direction && q.direction !== "bidir"));
  const left = Math.max(8, Math.min(picker.x - 140, (typeof window === "undefined" ? 1200 : window.innerWidth) - 300));
  const top = Math.max(8, picker.y - 40);
  return (
    <div className="fixed z-50 w-72 rounded-xl border border-slate-200 bg-white shadow-2xl" style={{ left: picker.x ? left : "50%", top: picker.y ? top : 120, transform: picker.x ? undefined : "translateX(-50%)" }}>
      <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
        <p className="text-xs font-semibold text-slate-800">
          {picker.stage === "from" ? "Puerto de origen" : "Puerto de destino"} · {picker.device.short}
        </p>
        <button type="button" onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <ul className="max-h-72 overflow-y-auto py-1">
        {ports.map((q) => {
          const busy = isTaken(q.id) && q.signal !== "speaker";
          const usable = ok(q) && !busy;
          return (
            <li key={q.id}>
              <button type="button" disabled={!usable} onClick={() => onPick(q)} className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: WIRE_SIGNAL_STYLE[q.signal].color }} />
                <span className="flex-1">
                  <span className="font-semibold">{q.label}</span> <span className="text-slate-400">{q.direction === "in" ? "entrada" : q.direction === "out" ? "salida" : "E/S"}</span>
                </span>
                {busy ? <span className="text-[10px] text-slate-400">ocupado</span> : null}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Legend() {
  const shown = ["hdmi", "hdbaset", "usb-c", "usb-a", "lan", "dante", "analog-audio", "speaker", "rs232", "ir", "relay", "cresnet", "fiber"] as const;
  return (
    <details className="absolute bottom-10 left-2 z-10 rounded-lg border border-slate-200 bg-white/95 px-2 py-1 text-[11px] shadow-sm">
      <summary className="cursor-pointer font-semibold text-slate-700">Leyenda</summary>
      <ul className="mt-1 space-y-0.5">
        {shown.map((s) => (
          <li key={s} className="flex items-center gap-1.5">
            <span className="h-0.5 w-5" style={{ background: WIRE_SIGNAL_STYLE[s].color }} /> {WIRE_SIGNAL_STYLE[s].label}
          </li>
        ))}
      </ul>
    </details>
  );
}

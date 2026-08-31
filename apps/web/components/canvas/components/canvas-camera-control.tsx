"use client";
/**
 * 摄像机参数控制（D12 Phase D）
 * 来源：vendor/infinite-canvas canvas-camera-control（AGPL-3.0）精简 shadcn 化：
 * antd Button/Switch/Tooltip → 原生控件；机身/镜头网格 + 焦距/光圈滑条 + 启用开关。
 * 面板随节点固定显示大小（跟随 vendor 行为：位于按钮上方、画布缩放时尺寸不变）。
 */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Camera } from "lucide-react";

import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "../theme-store";
import { APERTURES, APERTURE_META, CAMERA_PROFILES, FOCAL_LENGTHS, FOCAL_LENGTH_META, LENS_PROFILES } from "../utils/canvas-camera";
import type { CameraControlOptions } from "../types";

const DEFAULT_CAMERA_CONTROL: CameraControlOptions = {
    enabled: false,
    camera: CAMERA_PROFILES[0].id,
    lens: LENS_PROFILES[0].id,
    focalLength: 50,
    aperture: 4,
};

export function CanvasCameraControl({ value, onChange, buttonClassName }: { value?: CameraControlOptions; onChange: (value: CameraControlOptions) => void; buttonClassName?: string }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const buttonRef = useRef<HTMLSpanElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const [open, setOpen] = useState(false);
    const [buttonRect, setButtonRect] = useState<DOMRect | null>(null);
    const cameraControl = value || DEFAULT_CAMERA_CONTROL;
    const camera = CAMERA_PROFILES.find((item) => item.id === cameraControl.camera) || CAMERA_PROFILES[0];
    const lens = LENS_PROFILES.find((item) => item.id === cameraControl.lens) || LENS_PROFILES[0];
    const update = (patch: Partial<CameraControlOptions>) => onChange({ ...cameraControl, ...patch });

    useEffect(() => {
        if (!open) return;
        const trigger = buttonRef.current;
        if (!trigger) return;

        const syncPosition = () => setButtonRect(trigger.getBoundingClientRect());
        const closeOnOutsidePointer = (event: PointerEvent) => {
            const target = event.target;
            if (!(target instanceof Node) || buttonRef.current?.contains(target) || panelRef.current?.contains(target)) return;
            setOpen(false);
        };

        syncPosition();
        window.addEventListener("resize", syncPosition);
        window.addEventListener("pointerdown", closeOnOutsidePointer, true);
        return () => {
            window.removeEventListener("resize", syncPosition);
            window.removeEventListener("pointerdown", closeOnOutsidePointer, true);
        };
    }, [open]);

    return (
        <>
            <span ref={buttonRef} className="inline-flex min-w-0" onMouseDown={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
                <button
                    type="button"
                    className={buttonClassName || "inline-flex h-10 min-w-[92px] items-center justify-start gap-1.5 rounded-full border px-3 text-xs"}
                    style={{
                        background: value?.enabled ? theme.toolbar.activeBg : theme.node.fill,
                        borderColor: value?.enabled ? theme.node.activeStroke : theme.node.stroke,
                        color: value?.enabled ? theme.toolbar.activeText : theme.node.text,
                    }}
                    aria-expanded={open}
                    onClick={() => setOpen((current) => !current)}
                >
                    <Camera className="size-4" />
                    摄像机
                </button>
            </span>

            {open && buttonRect
                ? createPortal(
                      <div
                          ref={panelRef}
                          className="thin-scrollbar fixed z-[1200] w-[640px] -translate-x-1/2 overflow-y-auto rounded-2xl border p-4 shadow-2xl"
                          style={{ left: buttonRect.left + buttonRect.width / 2, bottom: window.innerHeight - buttonRect.top + 8, background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }}
                          onPointerDown={(event) => event.stopPropagation()}
                          onMouseDown={(event) => event.stopPropagation()}
                          onClick={(event) => event.stopPropagation()}
                          onWheel={(event) => event.stopPropagation()}
                      >
                          <div className="mb-3 flex items-center justify-between">
                              <span className="text-sm font-semibold">摄像机参数</span>
                              <label className="flex cursor-pointer items-center gap-2 text-xs">
                                  <span className="opacity-70">启用（写入提示词）</span>
                                  <button
                                      type="button"
                                      role="switch"
                                      aria-checked={cameraControl.enabled}
                                      className="relative h-5 w-9 rounded-full transition"
                                      style={{ background: cameraControl.enabled ? theme.node.activeStroke : theme.node.stroke }}
                                      onClick={() => update({ enabled: !cameraControl.enabled })}
                                  >
                                      <span className="absolute top-0.5 size-4 rounded-full bg-white transition-all" style={{ left: cameraControl.enabled ? 18 : 2 }} />
                                  </button>
                              </label>
                          </div>

                          <div className="mb-1.5 text-[11px] font-medium opacity-50">机身</div>
                          <div className="mb-3 grid grid-cols-4 gap-1.5">
                              {CAMERA_PROFILES.map((item) => (
                                  <button
                                      key={item.id}
                                      type="button"
                                      title={`${item.description}\n适用：${item.useCase}`}
                                      className="rounded-lg border p-2 text-left text-[11px] leading-4 transition"
                                      style={camera.id === item.id ? { borderColor: theme.node.activeStroke, background: theme.toolbar.activeBg } : { borderColor: theme.node.stroke }}
                                      onClick={() => update({ camera: item.id })}
                                  >
                                      <span className="block font-medium">{item.zhName}</span>
                                      <span className="block opacity-55">{item.label}</span>
                                  </button>
                              ))}
                          </div>

                          <div className="mb-1.5 text-[11px] font-medium opacity-50">镜头</div>
                          <div className="mb-3 grid grid-cols-4 gap-1.5">
                              {LENS_PROFILES.map((item) => (
                                  <button
                                      key={item.id}
                                      type="button"
                                      title={`${item.description}\n适用：${item.useCase}`}
                                      className="rounded-lg border p-2 text-left text-[11px] leading-4 transition"
                                      style={lens.id === item.id ? { borderColor: theme.node.activeStroke, background: theme.toolbar.activeBg } : { borderColor: theme.node.stroke }}
                                      onClick={() => update({ lens: item.id })}
                                  >
                                      <span className="block font-medium">{item.zhName}</span>
                                      <span className="block opacity-55">{item.label}</span>
                                  </button>
                              ))}
                          </div>

                          <div className="mb-1 text-[11px] font-medium opacity-50">
                              焦距 {cameraControl.focalLength}mm · {FOCAL_LENGTH_META[cameraControl.focalLength]?.zhName ?? ""}
                          </div>
                          <input
                              type="range"
                              className="mb-1 w-full"
                              style={{ accentColor: theme.node.activeStroke }}
                              min={Math.min(...FOCAL_LENGTHS)}
                              max={Math.max(...FOCAL_LENGTHS)}
                              step={1}
                              value={cameraControl.focalLength}
                              onChange={(event) => {
                                  const value = Number(event.target.value);
                                  const nearest = FOCAL_LENGTHS.reduce((best, item) => (Math.abs(item - value) < Math.abs(best - value) ? item : best), FOCAL_LENGTHS[0]);
                                  update({ focalLength: nearest });
                              }}
                          />
                          <div className="mb-3 text-[10px] opacity-50">{FOCAL_LENGTH_META[cameraControl.focalLength]?.description}</div>

                          <div className="mb-1 text-[11px] font-medium opacity-50">
                              光圈 f/{cameraControl.aperture} · {APERTURE_META[cameraControl.aperture]?.zhName ?? ""}
                          </div>
                          <input
                              type="range"
                              className="mb-1 w-full"
                              style={{ accentColor: theme.node.activeStroke }}
                              min={0}
                              max={APERTURES.length - 1}
                              step={1}
                              value={APERTURES.indexOf(cameraControl.aperture as (typeof APERTURES)[number])}
                              onChange={(event) => update({ aperture: APERTURES[Number(event.target.value)] })}
                          />
                          <div className="text-[10px] opacity-50">{APERTURE_META[cameraControl.aperture]?.description}</div>
                      </div>,
                      document.body,
                  )
                : null}
        </>
    );
}

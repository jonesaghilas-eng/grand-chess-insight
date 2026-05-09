import { useEffect, useRef, useState } from "react";

export type AvatarMood = "neutral" | "thinking" | "pleased" | "concerned" | "impressed" | "worried" | "celebrating";

type Props = {
  mood: AvatarMood;
  speaking?: boolean;
  name?: string;
  size?: number;
};

/** Lightweight 3D-look SVG avatar — soft gradients, subtle parallax,
 * idle breathing & blinks, expressive eyebrow + mouth morphs by mood. */
export function Avatar({ mood, speaking = false, name = "Coach Caïssa", size = 96 }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [blink, setBlink] = useState(false);
  const [mouthPulse, setMouthPulse] = useState(0);

  // Idle blink
  useEffect(() => {
    let t: number;
    const loop = () => {
      setBlink(true);
      window.setTimeout(() => setBlink(false), 130);
      t = window.setTimeout(loop, 2400 + Math.random() * 3500);
    };
    t = window.setTimeout(loop, 1500);
    return () => window.clearTimeout(t);
  }, []);

  // Speaking pulse
  useEffect(() => {
    if (!speaking) { setMouthPulse(0); return; }
    let raf = 0;
    const start = performance.now();
    const tick = () => {
      const t = (performance.now() - start) / 130;
      setMouthPulse(0.5 + 0.5 * Math.sin(t));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [speaking]);

  // Cursor parallax
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const el = wrapRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const dx = (e.clientX - cx) / window.innerWidth;
      const dy = (e.clientY - cy) / window.innerHeight;
      setTilt({ x: Math.max(-1, Math.min(1, dx * 2)), y: Math.max(-1, Math.min(1, dy * 2)) });
    };
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  const m = MOOD[mood];
  const eyeOffsetX = tilt.x * 1.4;
  const eyeOffsetY = tilt.y * 1.0;
  const eyeOpen = blink ? 0.05 : m.eyeOpen;
  const mouthH = m.mouthH * (1 + mouthPulse * 0.6);

  return (
    <div ref={wrapRef} className="flex flex-col items-center gap-2 select-none">
      <div
        className="rounded-full relative"
        style={{
          width: size, height: size,
          background: "radial-gradient(circle at 35% 30%, oklch(0.99 0.005 85), oklch(0.88 0.012 85) 60%, oklch(0.78 0.018 85) 100%)",
          boxShadow: "0 18px 32px -16px oklch(0 0 0 / 0.35), inset -8px -10px 18px oklch(0 0 0 / 0.08), inset 6px 8px 14px oklch(1 0 0 / 0.6)",
          transform: `perspective(400px) rotateY(${tilt.x * 6}deg) rotateX(${-tilt.y * 6}deg)`,
          transition: "transform 120ms ease-out",
          animation: "caissa-breathe 4s ease-in-out infinite",
        }}
      >
        <svg viewBox="0 0 100 100" width={size} height={size} className="absolute inset-0">
          {/* Eyebrows */}
          <path
            d={`M 28 ${36 + m.browY} Q 36 ${30 + m.browY + m.browTilt} 44 ${36 + m.browY - m.browTilt}`}
            stroke="oklch(0.22 0.005 60)" strokeWidth={2.4} strokeLinecap="round" fill="none"
          />
          <path
            d={`M 56 ${36 + m.browY - m.browTilt} Q 64 ${30 + m.browY + m.browTilt} 72 ${36 + m.browY}`}
            stroke="oklch(0.22 0.005 60)" strokeWidth={2.4} strokeLinecap="round" fill="none"
          />
          {/* Eyes */}
          <g transform={`translate(${eyeOffsetX}, ${eyeOffsetY})`}>
            <ellipse cx="36" cy="50" rx="4" ry={4 * eyeOpen} fill="oklch(0.18 0.005 60)" />
            <ellipse cx="64" cy="50" rx="4" ry={4 * eyeOpen} fill="oklch(0.18 0.005 60)" />
            {eyeOpen > 0.3 && (
              <>
                <circle cx="37" cy="48.5" r="1" fill="oklch(0.99 0 0)" />
                <circle cx="65" cy="48.5" r="1" fill="oklch(0.99 0 0)" />
              </>
            )}
          </g>
          {/* Mouth */}
          {m.mouthShape === "smile" && (
            <path d={`M 38 ${68 + m.mouthY} Q 50 ${68 + m.mouthY + mouthH} 62 ${68 + m.mouthY}`}
                  stroke="oklch(0.22 0.005 60)" strokeWidth={2.4} strokeLinecap="round" fill="none" />
          )}
          {m.mouthShape === "flat" && (
            <line x1="40" y1={70 + m.mouthY} x2="60" y2={70 + m.mouthY}
                  stroke="oklch(0.22 0.005 60)" strokeWidth={2.4} strokeLinecap="round" />
          )}
          {m.mouthShape === "frown" && (
            <path d={`M 38 ${72 + m.mouthY + mouthH} Q 50 ${68 + m.mouthY} 62 ${72 + m.mouthY + mouthH}`}
                  stroke="oklch(0.22 0.005 60)" strokeWidth={2.4} strokeLinecap="round" fill="none" />
          )}
          {m.mouthShape === "o" && (
            <ellipse cx="50" cy={70 + m.mouthY} rx={4 + mouthH} ry={3 + mouthH} fill="oklch(0.22 0.005 60)" />
          )}
          {/* Gold accent ring */}
          <circle cx="50" cy="50" r="48" fill="none" stroke="oklch(0.78 0.12 80 / 0.35)" strokeWidth="1" />
        </svg>
        {mood === "thinking" && (
          <span className="absolute -top-1 -right-1 mono text-[10px] px-1.5 py-0.5 rounded-full bg-foreground text-background animate-pulse">…</span>
        )}
        {speaking && (
          <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 mono text-[9px] px-1.5 py-0.5 rounded-full bg-accent text-accent-foreground">speaking</span>
        )}
      </div>
      <div className="text-center leading-tight">
        <div className="serif text-sm">{name}</div>
        <div className="mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{m.label}</div>
      </div>
      <style>{`
        @keyframes caissa-breathe {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.025); }
        }
      `}</style>
    </div>
  );
}

const MOOD: Record<AvatarMood, { label: string; eyeOpen: number; browY: number; browTilt: number; mouthY: number; mouthH: number; mouthShape: "smile" | "flat" | "frown" | "o" }> = {
  neutral:     { label: "Listening",   eyeOpen: 1,    browY: 0,  browTilt: 0,   mouthY: 0,  mouthH: 0, mouthShape: "flat" },
  thinking:    { label: "Calculating", eyeOpen: 0.65, browY: -2, browTilt: 1,   mouthY: 0,  mouthH: 0, mouthShape: "flat" },
  pleased:     { label: "Pleased",     eyeOpen: 0.85, browY: -1, browTilt: 0,   mouthY: 0,  mouthH: 4, mouthShape: "smile" },
  impressed:   { label: "Impressed",   eyeOpen: 1.1,  browY: -3, browTilt: -1,  mouthY: 0,  mouthH: 2, mouthShape: "o" },
  concerned:   { label: "Concerned",   eyeOpen: 0.9,  browY: 1,  browTilt: -1.5,mouthY: 1,  mouthH: 0, mouthShape: "flat" },
  worried:     { label: "Worried",     eyeOpen: 1.1,  browY: 2,  browTilt: -2,  mouthY: 2,  mouthH: 3, mouthShape: "frown" },
  celebrating: { label: "Celebrating", eyeOpen: 0.9,  browY: -2, browTilt: 0,   mouthY: 0,  mouthH: 6, mouthShape: "smile" },
};

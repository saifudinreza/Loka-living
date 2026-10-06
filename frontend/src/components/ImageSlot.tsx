interface ImageSlotProps {
  label: string;
  src?: string;
  className?: string;
  /** CSS object-position untuk foto yang rasionya beda dari bingkai, mis. "50% 55%". */
  objectPosition?: string;
}

export default function ImageSlot({ label, src, className = "", objectPosition }: ImageSlotProps) {
  if (src) {
    return (
      <div className={`relative h-full w-full overflow-hidden bg-card ${className}`}>
        {/* SVG placeholder art — plain <img> since next/image doesn't resize vector sources */}
        <img
          src={src}
          alt={label}
          className="h-full w-full object-cover"
          style={objectPosition ? { objectPosition } : undefined}
        />
      </div>
    );
  }

  return (
    <div
      className={`relative flex h-full w-full items-center justify-center overflow-hidden bg-card ${className}`}
      style={{
        backgroundImage:
          "repeating-linear-gradient(135deg, rgba(27,26,20,0.035) 0px, rgba(27,26,20,0.035) 1px, transparent 1px, transparent 14px)",
      }}
    >
      <span className="px-6 text-center text-[11px] font-medium uppercase tracking-[0.12em] text-soft">
        {label}
      </span>
    </div>
  );
}

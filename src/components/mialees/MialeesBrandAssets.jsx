import React from 'react';

/**
 * North Star Logo Vector Geometry (Brand Book 2025 - MIALEES RESORT)
 * 8-pointed luxury star motif with sharp diamond compass points and diagonal radiating petals.
 */
export function NorthStarIcon({ className = "w-8 h-8", color = "currentColor", strokeWidth = 0 }) {
  // Parse explicit pixel fallback from Tailwind class if needed
  let px = 24;
  if (className.includes('w-3.5') || className.includes('h-3.5')) px = 14;
  else if (className.includes('w-3') || className.includes('h-3')) px = 12;
  else if (className.includes('w-4') || className.includes('h-4')) px = 16;
  else if (className.includes('w-5') || className.includes('h-5')) px = 20;
  else if (className.includes('w-6') || className.includes('h-6')) px = 24;
  else if (className.includes('w-7') || className.includes('h-7')) px = 28;
  else if (className.includes('w-8') || className.includes('h-8')) px = 32;
  else if (className.includes('w-12') || className.includes('h-12')) px = 48;

  return (
    <svg
      viewBox="0 0 200 200"
      fill={color}
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      width={px}
      height={px}
      style={{
        width: `${px}px`,
        height: `${px}px`,
        maxWidth: `${px}px`,
        maxHeight: `${px}px`,
        flexShrink: 0,
        display: 'inline-block'
      }}
    >
      {/* Central 4-pointed diamond star with concave flares */}
      <path
        d="M100,5 C101,65 135,99 195,100 C135,101 101,135 100,195 C99,135 65,101 5,100 C65,99 99,65 100,5 Z"
      />
      {/* 4 Diagonal radiating slender petals */}
      <path d="M136,64 C140,50 148,42 154,36 C148,48 142,56 136,64 Z" />
      <path d="M136,136 C142,144 148,152 154,164 C148,158 140,150 136,136 Z" />
      <path d="M64,136 C58,150 52,158 46,164 C52,152 58,144 64,136 Z" />
      <path d="M64,64 C58,56 52,48 46,36 C52,42 60,50 64,64 Z" />
    </svg>
  );
}

/**
 * Full MIALEES RESORT Brand Logo Component
 */
export function MialeesLogo({
  variant = "dark", // "dark", "light", "gold"
  size = "md",      // "sm", "md", "lg"
  showSub = true,
  className = ""
}) {
  const isLight = variant === "light";
  const starColor = isLight ? "#FFFFFF" : "#26130F";
  const textColor = isLight ? "#FFFFFF" : "#26130F";
  const subColor = isLight ? "rgba(255,255,255,0.8)" : "#736055";

  const sizeClasses = {
    xs: { star: "w-4 h-4", title: "text-sm tracking-[0.2em]", sub: "text-[8px] tracking-[0.25em]" },
    sm: { star: "w-5 h-5", title: "text-base tracking-[0.22em]", sub: "text-[8.5px] tracking-[0.3em]" },
    md: { star: "w-7 h-7", title: "text-xl tracking-[0.25em]", sub: "text-[10px] tracking-[0.35em]" },
    lg: { star: "w-12 h-12", title: "text-3xl tracking-[0.3em]", sub: "text-xs tracking-[0.45em]" }
  }[size] || { star: "w-5 h-5", title: "text-base tracking-[0.22em]", sub: "text-[8.5px] tracking-[0.3em]" };

  return (
    <div className={`flex flex-col items-center select-none text-center ${className}`}>
      <NorthStarIcon className={`${sizeClasses.star} mb-2 transition-transform duration-500 hover:scale-110`} color={starColor} />
      <span
        style={{ color: textColor, fontFamily: 'Montserrat, Heebo, sans-serif' }}
        className={`font-semibold uppercase leading-none font-montserrat ${sizeClasses.title}`}
      >
        MIALEES
      </span>
      {showSub && (
        <span
          style={{ color: subColor, fontFamily: 'Montserrat, Heebo, sans-serif' }}
          className={`font-light uppercase mt-1 leading-none ${sizeClasses.sub}`}
        >
          RESORT
        </span>
      )}
    </div>
  );
}

/**
 * Universal Brand Badge for Units and Features
 */
export function BrandBadge({ children, variant = "default", className = "" }) {
  const styles = {
    default: "bg-[var(--brand-surfaceSoft)] text-[var(--brand-secondary)] border border-[var(--brand-borderLight)]",
    primary: "bg-[var(--brand-primary)] text-white shadow-sm",
    accent: "bg-[var(--brand-accent)] text-white shadow-sm",
    gold: "bg-[#C5A880]/15 text-[#8C6D37] border border-[#C5A880]/30",
    pink: "bg-[#F2D5DD]/40 text-[#59454A] border border-[#F2D5DD]"
  }[variant] || "bg-[var(--brand-surfaceSoft)] text-[var(--brand-secondary)]";

  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium tracking-wide ${styles} ${className}`}>
      {children}
    </span>
  );
}

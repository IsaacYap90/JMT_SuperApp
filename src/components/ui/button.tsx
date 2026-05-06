"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "destructive" | "fab";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  loadingText?: string;
  icon?: ReactNode;
  iconPosition?: "left" | "right";
  fullWidth?: boolean;
}

const VARIANT: Record<Variant, string> = {
  primary:
    "bg-jai-blue text-white border border-jai-blue hover:bg-jai-blue/90 disabled:bg-jai-blue/40",
  secondary:
    "bg-jai-card text-jai-text border border-jai-border hover:text-white hover:border-jai-blue/40",
  ghost:
    "bg-transparent text-jai-text border border-transparent hover:bg-white/5 hover:text-white",
  destructive:
    "bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 hover:text-red-300",
  fab:
    "bg-jai-blue text-white border-0 shadow-xl shadow-jai-blue/30 hover:bg-jai-blue/90",
};

const SIZE: Record<Size, string> = {
  sm: "px-3 py-1.5 text-xs min-h-[32px] rounded-full",
  md: "px-4 py-2 text-sm min-h-[40px] rounded-full",
  lg: "px-5 py-3 text-sm min-h-[48px] rounded-full",
};

const FAB_SIZE = "w-14 h-14 rounded-full p-0";

const BASE =
  "inline-flex items-center justify-center gap-1.5 font-medium whitespace-nowrap select-none transition-colors disabled:opacity-50 disabled:cursor-not-allowed";

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "secondary",
    size = "md",
    loading = false,
    loadingText,
    icon,
    iconPosition = "left",
    fullWidth = false,
    disabled,
    className = "",
    children,
    type = "button",
    ...rest
  },
  ref
) {
  const isFab = variant === "fab";
  const sizeCls = isFab ? FAB_SIZE : SIZE[size];
  const widthCls = fullWidth && !isFab ? "w-full" : "";

  const content = loading ? (
    <>
      <svg
        className="animate-spin w-4 h-4"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="4" />
        <path
          d="M22 12a10 10 0 0 1-10 10"
          stroke="currentColor"
          strokeWidth="4"
          strokeLinecap="round"
        />
      </svg>
      {loadingText ?? children}
    </>
  ) : (
    <>
      {icon && iconPosition === "left" && <span className="shrink-0">{icon}</span>}
      {children}
      {icon && iconPosition === "right" && <span className="shrink-0">{icon}</span>}
    </>
  );

  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={`${BASE} ${VARIANT[variant]} ${sizeCls} ${widthCls} ${className}`.trim()}
      {...rest}
    >
      {content}
    </button>
  );
});

Button.displayName = "Button";

interface FabButtonProps extends Omit<ButtonProps, "variant" | "size"> {
  ariaLabel: string;
}

/**
 * Convenience wrapper for the standard floating-action-button pattern used
 * across the dashboard. Always positions itself bottom-right above the bottom
 * navigation bar, respects iOS safe-area inset.
 */
export const Fab = forwardRef<HTMLButtonElement, FabButtonProps>(function Fab(
  { ariaLabel, className = "", children, ...rest },
  ref
) {
  return (
    <Button
      ref={ref}
      variant="fab"
      aria-label={ariaLabel}
      className={`fixed right-5 md:right-8 z-30 active:scale-95 transition-transform ${className}`.trim()}
      style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 88px)", ...(rest.style ?? {}) }}
      {...rest}
    >
      {children ?? (
        <svg
          className="w-6 h-6"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
        </svg>
      )}
    </Button>
  );
});

Fab.displayName = "Fab";

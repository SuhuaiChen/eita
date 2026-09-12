"use client";

import { forwardRef } from "react";

type Variant = "primary" | "secondary" | "ghost" | "jade";

const styles: Record<Variant, string> = {
  primary:
    "bg-accent text-white shadow-[0_4px_14px_rgba(194,64,42,0.35)] active:bg-accent-deep",
  secondary:
    "bg-surface text-ink border-2 border-line active:border-accent/50",
  ghost: "bg-transparent text-muted",
  jade: "bg-jade text-white shadow-[0_4px_14px_rgba(63,125,84,0.3)]",
};

const BigButton = forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: Variant;
    big?: boolean;
  }
>(function BigButton(
  { variant = "primary", big, className = "", ...props },
  ref
) {
  return (
    <button
      ref={ref}
      className={`min-h-14 w-full rounded-2xl px-6 font-semibold transition active:scale-[0.98] disabled:opacity-40 disabled:active:scale-100 ${
        big ? "py-4 text-[1.3rem]" : "py-3 text-[1.1rem]"
      } ${styles[variant]} ${className}`}
      {...props}
    />
  );
});

export default BigButton;

"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  description?: string;
  className?: string;
  boxClassName?: string;
  disabled?: boolean;
  id?: string;
  children?: React.ReactNode;
  "aria-label"?: string;
}

/**
 * Themed checkbox (replaces native <input type="checkbox">).
 * Matches Select/DateField visual language: dark bg-white/[0.03] border-line,
 * chartreuse check, consistent with the app's dark palette.
 */
export default function Checkbox({
  checked,
  onChange,
  label,
  description,
  className,
  boxClassName,
  disabled = false,
  id,
  children,
  "aria-label": ariaLabel,
}: CheckboxProps) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-2.5 select-none",
        disabled && "cursor-not-allowed opacity-50",
        className
      )}
    >
      <button
        id={id}
        type="button"
        role="checkbox"
        aria-checked={checked}
        aria-label={ariaLabel ?? label}
        disabled={disabled}
        onClick={() => {
          if (!disabled) onChange(!checked);
        }}
        className={cn(
          "mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-[5px] border bg-white/[0.03] transition-colors outline-none",
          "hover:border-white/15 focus-visible:ring-2 focus-visible:ring-[var(--chartreuse)]/40",
          checked
            ? "border-[var(--chartreuse)] bg-[var(--chartreuse)] text-ink hover:border-[var(--chartreuse)]"
            : "border-[var(--line)]",
          disabled && "pointer-events-none",
          boxClassName
        )}
      >
        {checked && <Check className="h-3 w-3 stroke-[3]" />}
      </button>
      {/* Hidden native input for form semantics / a11y */}
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        aria-hidden
        tabIndex={-1}
        className="sr-only"
      />
      {children ? (
        <span className="min-w-0 flex-1">{children}</span>
      ) : (
        (label || description) && (
          <span className="min-w-0 flex-1 leading-tight">
            {label && <span className="block text-xs font-medium text-paper">{label}</span>}
            {description && <span className="block text-[10px] leading-relaxed text-dim">{description}</span>}
          </span>
        )
      )}
    </label>
  );
}

export function SimpleCheckbox({
  checked,
  onChange,
  children,
  className,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  children?: React.ReactNode;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <label className={cn("flex cursor-pointer items-start gap-2 text-[11px] leading-relaxed text-dim", disabled && "opacity-50", className)}>
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className={cn(
          "mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-[5px] border bg-white/[0.03] transition-colors",
          checked ? "border-[var(--chartreuse)] bg-[var(--chartreuse)] text-ink" : "border-[var(--line)] hover:border-white/15"
        )}
      >
        {checked && <Check className="h-3 w-3 stroke-[3]" />}
      </button>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="sr-only" tabIndex={-1} aria-hidden />
      {children && <span className="min-w-0 flex-1">{children}</span>}
    </label>
  );
}

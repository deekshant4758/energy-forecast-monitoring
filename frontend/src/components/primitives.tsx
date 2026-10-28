import type { ReactNode } from "react";

type Tone = "neutral" | "primary" | "success" | "warning" | "danger";

const TONE_CLASS: Record<Tone, string> = {
  neutral: "bg-surface-container text-on-surface-variant border-outline-variant",
  primary: "bg-primary-container text-on-primary-container border-primary/20",
  success:
    "bg-secondary-container text-on-secondary-container border-secondary/20",
  warning:
    "bg-tertiary-container text-on-tertiary-container border-tertiary/20",
  danger: "bg-error-container text-on-error-container border-error/20",
};

export function Pill({
  children,
  tone = "neutral",
  dot = false,
}: {
  children: ReactNode;
  tone?: Tone;
  dot?: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded border px-2 py-[3px] text-[10px] font-semibold uppercase tracking-[0.07em] ${TONE_CLASS[tone]}`}
    >
      {dot && (
        <span
          aria-hidden="true"
          className={`h-1.5 w-1.5 rounded-full ${
            tone === "success"
              ? "bg-secondary"
              : tone === "danger"
                ? "bg-error"
                : tone === "warning"
                  ? "bg-tertiary"
                  : tone === "primary"
                    ? "bg-primary"
                    : "bg-outline"
          }`}
        />
      )}
      {children}
    </span>
  );
}

export function Panel({
  title,
  subtitle,
  actions,
  children,
  className = "",
  bodyClassName = "",
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={`panel ${className}`}>
      {(title || actions) && (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-outline-variant px-3 py-2.5">
          <div className="min-w-0">
            {title && (
              <h2 className="text-[13px] font-semibold leading-tight text-on-surface">
                {title}
              </h2>
            )}
            {subtitle && (
              <p className="mt-0.5 text-[11px] leading-snug text-on-surface-variant">
                {subtitle}
              </p>
            )}
          </div>
          {actions && <div className="flex items-center gap-1.5">{actions}</div>}
        </header>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: { value: T; label: string; title?: string }[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="inline-flex overflow-hidden rounded border border-outline-variant bg-surface"
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={String(option.value)}
            type="button"
            title={option.title}
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={`border-r border-outline-variant px-2.5 py-[5px] text-[10px] font-semibold uppercase tracking-[0.06em] transition-colors last:border-r-0 ${
              active
                ? "bg-primary text-white"
                : "text-on-surface-variant hover:bg-surface-container"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function MetricCard({
  label,
  value,
  unit,
  hint,
  footnote,
  valueClassName = "",
  badge,
}: {
  label: string;
  value: string;
  unit?: string;
  hint?: ReactNode;
  footnote?: ReactNode;
  valueClassName?: string;
  badge?: ReactNode;
}) {
  return (
    <div className="border-r border-outline-variant px-3 py-2.5 last:border-r-0">
      <div className="flex items-start justify-between gap-2">
        <span className="label">{label}</span>
        {badge}
      </div>
      <div className="mt-1 flex items-baseline gap-1">
        <span
          className={`tnum text-[21px] font-semibold leading-none tracking-tight ${valueClassName}`}
        >
          {value}
        </span>
        {unit && (
          <span className="text-[11px] font-medium text-on-surface-faint">
            {unit}
          </span>
        )}
      </div>
      {hint && (
        <div className="mt-1 text-[10px] leading-snug text-on-surface-variant">
          {hint}
        </div>
      )}
      {footnote && (
        <div className="mt-0.5 text-[10px] leading-snug text-on-surface-faint">
          {footnote}
        </div>
      )}
    </div>
  );
}

export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-on-surface-variant">
      <span
        aria-hidden="true"
        className="h-4 w-4 animate-spin rounded-full border-2 border-outline-variant border-t-primary"
      />
      <span className="text-[12px]">{label}…</span>
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="panel m-4 flex flex-col items-start gap-2 border-error/30 bg-error-container/40 p-4">
      <span className="label text-on-error-container">Request failed</span>
      <p className="text-[12px] text-on-error-container">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="rounded border border-error/30 bg-surface px-2 py-1 text-[11px] font-semibold text-on-error-container hover:bg-white"
        >
          Retry
        </button>
      )}
    </div>
  );
}

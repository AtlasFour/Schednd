import Link from "next/link";
import { BackLink } from "./navigation";
import type { ComponentProps, ReactNode } from "react";

export function cx(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

export function Page({
  title,
  subtitle,
  back,
  actions,
  wide,
  children,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  back?: { href: string; label: string };
  actions?: ReactNode;
  /** Pagina larga sul computer (di solito con <Columns>). */
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <main
      className={cx(
        "mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-5 py-6 lg:px-8 lg:py-10",
        wide ? "lg:max-w-6xl" : "lg:max-w-2xl",
      )}
    >
      {back && (
        <BackLink
          href={back.href}
          className="-mb-2 self-start text-sm text-foreground/60 hover:text-foreground"
        >
          ← {back.label}
        </BackLink>
      )}
      {(title || actions) && (
        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {title && (
              <h1 className="text-2xl font-bold tracking-tight break-words">
                {title}
              </h1>
            )}
            {subtitle && (
              <p className="mt-1 text-sm text-foreground/60">{subtitle}</p>
            )}
          </div>
          {actions && <div className="flex shrink-0 gap-2">{actions}</div>}
        </header>
      )}
      {children}
    </main>
  );
}

/**
 * Due colonne sul computer (contenuto principale + colonna laterale),
 * una sola colonna sul telefono (prima il principale, poi il laterale).
 */
export function Columns({
  main,
  side,
  sideFirstOnMobile,
}: {
  main: ReactNode;
  side: ReactNode;
  /** Sul telefono mostra prima la colonna laterale. */
  sideFirstOnMobile?: boolean;
}) {
  return (
    <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start lg:gap-8">
      <div className="flex min-w-0 flex-col gap-5">{main}</div>
      <div className={cx("flex min-w-0 flex-col gap-5", sideFirstOnMobile && "order-first lg:order-none")}>{side}</div>
    </div>
  );
}

/**
 * Riquadri in fila sul telefono, su due colonne "a mattoncini" sul computer
 * (l'ordine resta lo stesso: prima la colonna di sinistra, poi la destra).
 */
export function Masonry({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-5 lg:block lg:columns-2 lg:gap-6 lg:[&>*]:mb-6 lg:[&>*]:break-inside-avoid">
      {children}
    </div>
  );
}

export function Card({
  title,
  children,
  className,
}: {
  title?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cx(
        "ui-card rounded-2xl border border-foreground/10 bg-foreground/[0.02] p-4",
        className,
      )}
    >
      {title && <h2 className="mb-3 font-semibold">{title}</h2>}
      {children}
    </section>
  );
}

const buttonStyles = {
  primary: "bg-brand text-white hover:bg-brand/90",
  secondary: "border border-foreground/15 hover:bg-foreground/5",
  danger: "border border-red-500/40 text-red-500 hover:bg-red-500/10",
  ghost: "text-foreground/70 hover:bg-foreground/5",
} as const;

export type ButtonVariant = keyof typeof buttonStyles;

export function buttonClass(variant: ButtonVariant = "primary", small = false) {
  return cx(
    "ui-btn inline-flex items-center justify-center gap-2 rounded-xl font-medium transition disabled:opacity-60",
    `ui-btn-${variant}`,
    small ? "h-9 px-3 text-sm" : "h-11 px-4",
    buttonStyles[variant],
  );
}

export function ButtonLink({
  variant = "primary",
  small,
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: ButtonVariant; small?: boolean }) {
  return (
    <Link className={cx(buttonClass(variant, small), className)} {...props} />
  );
}

export function Label({ children, htmlFor }: { children: ReactNode; htmlFor: string }) {
  return (
    <label htmlFor={htmlFor} className="text-sm font-medium">
      {children}
    </label>
  );
}

export function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-foreground/55">{hint}</p>}
    </div>
  );
}

export const inputClass =
  "ui-input h-11 w-full rounded-xl border border-foreground/15 bg-background px-3 text-base outline-none focus:border-brand focus:ring-2 focus:ring-brand/30";

export function Input(props: ComponentProps<"input">) {
  return <input {...props} className={cx(inputClass, props.className)} />;
}

export function Select(props: ComponentProps<"select">) {
  return <select {...props} className={cx(inputClass, props.className)} />;
}

export function Textarea(props: ComponentProps<"textarea">) {
  return (
    <textarea
      {...props}
      className={cx(inputClass, "h-auto min-h-20 py-2", props.className)}
    />
  );
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "brand" | "success";
}) {
  const tones = {
    neutral: "bg-foreground/10 text-foreground/70",
    brand: "bg-brand/15 text-brand",
    success: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  };
  return (
    <span
      className={cx(
        "ui-badge inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cx("animate-pulse rounded-xl bg-foreground/10", className)}
    />
  );
}

export function PageSkeleton() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-5 py-6">
      <Skeleton className="h-8 w-2/3" />
      <Skeleton className="h-32" />
      <Skeleton className="h-24" />
    </main>
  );
}

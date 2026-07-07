import { ReactNode } from 'react';

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('rounded-xl border border-ink-line bg-ink-panel/60 p-5', className)}>{children}</div>;
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 mb-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-zinc-400 mt-1">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Button({
  children,
  onClick,
  variant = 'primary',
  size = 'md',
  disabled,
  type = 'button',
  className,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'ghost' | 'danger' | 'subtle';
  size?: 'sm' | 'md';
  disabled?: boolean;
  type?: 'button' | 'submit';
  className?: string;
}) {
  const variants = {
    primary: 'bg-accent text-white hover:bg-accent-soft disabled:opacity-40',
    ghost: 'border border-ink-line text-zinc-200 hover:bg-ink-line/40 disabled:opacity-40',
    danger: 'bg-bad/15 text-bad hover:bg-bad/25 disabled:opacity-40',
    subtle: 'bg-ink-line/60 text-zinc-200 hover:bg-ink-line disabled:opacity-40',
  };
  const sizes = { sm: 'px-2.5 py-1 text-xs', md: 'px-3.5 py-2 text-sm' };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cx('rounded-lg font-medium transition-colors', variants[variant], sizes[size], className)}
    >
      {children}
    </button>
  );
}

export function Badge({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cx('inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium', className)}>
      {children}
    </span>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <div className="text-xs font-medium text-zinc-400 mb-1">{label}</div>
      {children}
      {hint && <div className="text-xs text-zinc-500 mt-1">{hint}</div>}
    </label>
  );
}

export const inputCls =
  'w-full rounded-lg bg-ink-soft border border-ink-line px-3 py-2 text-sm text-zinc-100 outline-none focus:border-accent/60 placeholder:text-zinc-600';

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(inputCls, props.className)} />;
}
export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cx(inputCls, 'min-h-[120px] font-mono text-xs', props.className)} />;
}
export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cx(inputCls, props.className)} />;
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="text-center text-sm text-zinc-500 py-12">{children}</div>;
}

export function Spinner() {
  return <div className="animate-pulse text-zinc-500 text-sm">Loading…</div>;
}

export function ErrorBox({ message }: { message: string }) {
  return <div className="rounded-lg border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-bad">{message}</div>;
}

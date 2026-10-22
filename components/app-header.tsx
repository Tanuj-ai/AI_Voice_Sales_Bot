import Link from "next/link";

type AppHeaderProps = {
  title: string;
  subtitle: string;
  actionHref: "/" | "/history";
  actionLabel: string;
};

export function AppHeader({ title, subtitle, actionHref, actionLabel }: AppHeaderProps) {
  return (
    <header className="flex flex-col gap-5 border-b border-slate-200/80 pb-6 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-3 sm:gap-5">
        <Link href="/" className="group flex shrink-0 items-center gap-3" aria-label="FlowDesk home">
          <span className="grid size-11 place-items-center rounded-2xl bg-indigo-700 text-lg font-bold text-white shadow-lg shadow-indigo-900/15 transition group-hover:bg-indigo-800" aria-hidden="true">
            F
          </span>
          <span>
            <span className="block text-base font-bold tracking-tight text-slate-950">FlowDesk</span>
            <span className="block text-[10px] font-semibold tracking-[0.16em] text-slate-500">VOICE SALES</span>
          </span>
        </Link>

        <span className="hidden h-10 w-px bg-slate-200 sm:block" aria-hidden="true" />

        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-indigo-700">Call workspace</p>
          <h1 className="mt-0.5 text-lg font-semibold tracking-tight text-slate-950 sm:text-xl">{title}</h1>
          <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>
        </div>
      </div>

      <Link
        href={actionHref}
        className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
      >
        {actionLabel}
        <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="size-4">
          <path d="M4.5 10h10m-4-4 4 4-4 4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </Link>
    </header>
  );
}

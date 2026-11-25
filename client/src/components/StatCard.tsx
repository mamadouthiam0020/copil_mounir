import { ArrowUpRight, type LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/cn';

const TONES = {
  navy: 'bg-navy-50 text-navy-700',
  gold: 'bg-gold-50 text-gold-700',
  green: 'bg-emerald-50 text-emerald-700',
  red: 'bg-red-50 text-red-600',
  amber: 'bg-amber-50 text-amber-700',
  slate: 'bg-slate-100 text-slate-600',
  blue: 'bg-sky-50 text-sky-700',
};

interface StatCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  sub?: string;
  tone?: keyof typeof TONES;
  to?: string;
  loading?: boolean;
  attention?: boolean;
}

export function StatCard({ label, value, icon: Icon, sub, tone = 'navy', to, loading, attention }: StatCardProps) {
  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <span className={cn('stat-icon', TONES[tone])}>
          <Icon size={18} strokeWidth={1.9} />
        </span>
        {to ? (
          <ArrowUpRight size={14} className="text-slate-300 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-gold-500" />
        ) : null}
      </div>
      <p className="mt-3.5 text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">{label}</p>
      {loading ? (
        <div className="skeleton mt-1.5 h-7 w-16" />
      ) : (
        <p className="mt-1 truncate text-[22px] font-extrabold leading-none tracking-[-0.03em] text-navy-950 sm:text-[24px]" title={String(value)}>{value}</p>
      )}
      {sub ? <p className={cn('mt-1.5 truncate text-[11px]', attention ? 'font-semibold text-red-500' : 'text-muted')}>{sub}</p> : null}
    </>
  );

  if (to) {
    return (
      <Link to={to} className="group card block p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-navy-200 hover:shadow-lift sm:p-5">
        {content}
      </Link>
    );
  }
  return <div className="card p-4 sm:p-5">{content}</div>;
}

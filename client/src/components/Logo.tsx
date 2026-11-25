import { cn } from '@/lib/cn';

export function LogoMark({ size = 40, className }: { size?: number; className?: string }) {
  return (
    <span className={cn('relative inline-flex shrink-0 items-center justify-center', className)} style={{ width: size, height: size }}>
      <svg viewBox="0 0 48 48" width={size} height={size} role="img" aria-label="Copil">
        <defs>
          <linearGradient id="copil-gold" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#E4C87A" />
            <stop offset="45%" stopColor="#C9A227" />
            <stop offset="100%" stopColor="#A9821C" />
          </linearGradient>
          <linearGradient id="copil-navy" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#123C68" />
            <stop offset="100%" stopColor="#071A33" />
          </linearGradient>
        </defs>
        <rect x="1" y="1" width="46" height="46" rx="12" fill="url(#copil-navy)" />
        <rect x="1.75" y="1.75" width="44.5" height="44.5" rx="11.5" fill="none" stroke="url(#copil-gold)" strokeOpacity="0.55" strokeWidth="1.2" />
        <path d="M32.5 16.8A10.2 10.2 0 1 0 32.5 31.2" fill="none" stroke="url(#copil-gold)" strokeWidth="4.2" strokeLinecap="round" />
        <circle cx="35.2" cy="24" r="1.7" fill="#D9B950" />
      </svg>
    </span>
  );
}

export function Logo({ dark = false, compact = false }: { dark?: boolean; compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <LogoMark size={compact ? 34 : 38} />
      <div className="leading-none">
        <p className={cn('font-extrabold tracking-[-0.04em]', dark ? 'text-white' : 'text-navy-950', compact ? 'text-[17px]' : 'text-[19px]')}>
          copil<span className="text-gold-400">.</span>
        </p>
        {!compact ? (
          <p className={cn('mt-1 text-[8px] font-semibold uppercase tracking-[0.2em]', dark ? 'text-white/40' : 'text-slate-400')}>
            Pilotage d’activité
          </p>
        ) : null}
      </div>
    </div>
  );
}

const MONTHS_SHORT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const MONTHS_LONG = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

export function toDate(value?: string | null): Date | null {
  if (!value) return null;
  const date = value.length <= 10 ? new Date(`${value}T12:00:00`) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatMoney(value: number | null | undefined, compact = false, currency = 'MAD'): string {
  const amount = Number(value) || 0;
  if (compact) {
    if (Math.abs(amount) >= 1_000_000) return `${(amount / 1_000_000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} M ${currency}`;
    if (Math.abs(amount) >= 1_000) return `${Math.round(amount / 1_000).toLocaleString('fr-FR')} k ${currency}`;
    return `${amount.toLocaleString('fr-FR')} ${currency}`;
  }
  return `${amount.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

export function formatNumber(value: number | null | undefined): string {
  return (Number(value) || 0).toLocaleString('fr-FR');
}

export function formatDate(value?: string | null, style: 'short' | 'long' | 'full' = 'short'): string {
  const date = toDate(value);
  if (!date) return '—';
  if (style === 'long') return `${date.getDate()} ${MONTHS_LONG[date.getMonth()]} ${date.getFullYear()}`;
  if (style === 'full') {
    const weekday = date.toLocaleDateString('fr-FR', { weekday: 'long' });
    return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)} ${date.getDate()} ${MONTHS_LONG[date.getMonth()]} ${date.getFullYear()}`;
  }
  return `${date.getDate()} ${MONTHS_SHORT[date.getMonth()]} ${String(date.getFullYear()).slice(2)}`;
}

export function formatDateTime(value?: string | null): string {
  const date = toDate(value);
  if (!date) return '—';
  return `${formatDate(value, 'short')} · ${date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
}

export function timeAgo(value?: string | null): string {
  const date = toDate(value);
  if (!date) return '—';
  const diff = Date.now() - date.getTime();
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return 'à l’instant';
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.round(hours / 24);
  if (days === 1) return 'hier';
  if (days < 7) return `il y a ${days} j`;
  return formatDate(value, 'short');
}

export function monthLabel(value: string): string {
  const date = toDate(value);
  return date ? `${MONTHS_LONG[date.getMonth()]} ${date.getFullYear()}` : value;
}

export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function daysUntil(value?: string | null): number | null {
  if (!value) return null;
  const target = toDate(value);
  if (!target) return null;
  const today = toDate(todayISO())!;
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

export function relativeDay(value?: string | null): string {
  const days = daysUntil(value);
  if (days === null) return '—';
  if (days === 0) return "Aujourd'hui";
  if (days === 1) return 'Demain';
  if (days === -1) return 'Hier';
  if (days < 0) return `En retard · ${Math.abs(days)} j`;
  if (days <= 7) return `Dans ${days} j`;
  return formatDate(value, 'short');
}

export function initials(name?: string | null): string {
  if (!name) return '?';
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

export function firstName(name?: string | null): string {
  return name?.split(' ')[0] || 'vous';
}

export function fileSize(bytes?: number | null): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

export function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Bonjour';
  if (h < 18) return 'Bon après-midi';
  return 'Bonsoir';
}

export function clamp(value: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, value));
}

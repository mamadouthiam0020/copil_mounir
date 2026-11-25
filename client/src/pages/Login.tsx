import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowRight, Eye, EyeOff, Loader2, LockKeyhole, ShieldCheck, TriangleAlert,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { errorMessage } from '@/lib/api';
import { Logo } from '@/components/Logo';

const HIGHLIGHTS = ['Clients', 'Programmes', 'Livraisons', 'Devis'];

export default function Login() {
  const { user, login } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation() as { state?: { from?: string } };
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (user) return <Navigate to="/" replace />;

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const account = await login(email.trim(), password);
      toast.success(`Bienvenue, ${account.name.split(' ')[0]}`, 'Votre espace de travail est prêt.');
      navigate(location.state?.from || '/', { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const year = new Date().getFullYear();

  return (
    <main className="flex min-h-screen min-h-dvh bg-white">
      <section className="relative hidden w-[48%] max-w-[680px] flex-col justify-between overflow-hidden bg-gradient-to-br from-navy-900 via-navy-900 to-navy-950 p-10 text-white lg:flex xl:p-14">
        <div className="canvas-grid pointer-events-none absolute inset-0 opacity-25" />
        <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-navy-500/10 blur-3xl" />

        <div className="relative">
          <Logo dark />
        </div>

        <div className="relative max-w-[460px]">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-gold-300/80">Pilotage d’activité</p>
          <p className="mt-4 text-balance text-[38px] font-extrabold leading-[1.08] tracking-[-0.04em] xl:text-[44px]">
            Votre activité,<br />
            <span className="bg-gradient-to-r from-gold-200 via-gold-400 to-gold-300 bg-clip-text text-transparent">sous contrôle.</span>
          </p>
          <p className="mt-4 max-w-md text-[13px] leading-relaxed text-white/55">
            Une vision claire de vos clients, programmes, échéances et devis — au même endroit.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-x-3 gap-y-2 text-[11px] font-medium text-white/45">
            {HIGHLIGHTS.map((item, index) => (
              <span key={item} className="flex items-center gap-3">
                {index > 0 ? <span className="h-1 w-1 rounded-full bg-gold-400/60" /> : null}
                {item}
              </span>
            ))}
          </div>
        </div>

        <p className="relative text-[10px] text-white/30">© {year} Copil · Conçu pour les équipes exigeantes.</p>
      </section>

      <section className="relative flex flex-1 flex-col justify-center px-5 py-12 sm:px-10 xl:px-16">
        <div className="absolute left-5 top-6 sm:left-10 lg:hidden">
          <Logo />
        </div>

        <div className="mx-auto w-full max-w-[360px]">
          <div className="mb-7">
            <h1 className="text-[26px] font-extrabold tracking-[-0.03em] text-navy-950">Bon retour.</h1>
            <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
              Connectez-vous pour reprendre le pilotage de votre activité.
            </p>
          </div>

          {error ? (
            <div role="alert" className="mb-5 flex items-start gap-2.5 rounded-xl border border-red-100 bg-red-50 px-3.5 py-3 text-xs text-red-700 animate-scale-in">
              <TriangleAlert size={16} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          ) : null}

          <form onSubmit={submit} className="space-y-3.5">
            <div>
              <label className="label" htmlFor="email">Adresse e-mail</label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="input py-3"
                placeholder="vous@entreprise.com"
              />
            </div>
            <div>
              <label className="label" htmlFor="password">Mot de passe</label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="input py-3 pr-11"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 transition hover:text-navy-700"
                  aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button type="submit" disabled={loading} className="btn-gold w-full py-3 text-[13.5px]">
              {loading ? <Loader2 size={16} className="animate-spin" /> : <LockKeyhole size={15} />}
              {loading ? 'Connexion sécurisée…' : 'Accéder à mon espace'}
              {!loading ? <ArrowRight size={15} className="ml-auto" /> : null}
            </button>
          </form>

          <button
            type="button"
            onClick={() => toast.info('Information', 'Contactez votre administrateur pour réinitialiser votre mot de passe.')}
            className="mt-4 block w-full text-center text-[11px] font-semibold text-navy-600 transition hover:text-navy-900"
          >
            Mot de passe oublié ?
          </button>

          <p className="mt-8 flex items-center justify-center gap-2 text-[10px] text-slate-400">
            <ShieldCheck size={13} className="text-emerald-500" />
            Connexion sécurisée
          </p>
        </div>

        <p className="mt-10 text-center text-[10px] text-slate-300 lg:hidden">
          © {year} Copil · Conçu pour les équipes exigeantes.
        </p>
      </section>
    </main>
  );
}

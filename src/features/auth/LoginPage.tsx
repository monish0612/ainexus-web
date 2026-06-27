import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Eye, EyeOff, Lock, LogIn, User } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { Button } from '@/components/ui/primitives';

export default function LoginPage() {
  const login = useAuthStore((s) => s.login);
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const ok = await login(username, password);
      if (ok) navigate('/expense', { replace: true });
      else setError('Invalid username or password');
    } catch {
      setError('Could not sign in. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative grid min-h-[100dvh] place-items-center overflow-hidden bg-bg px-5 py-10">
      {/* ambient gradient orbs */}
      <div className="pointer-events-none absolute -left-40 -top-40 h-96 w-96 rounded-full bg-accent/25 blur-[120px]" />
      <div className="pointer-events-none absolute -bottom-40 -right-40 h-96 w-96 rounded-full bg-accent-2/25 blur-[120px]" />

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="card relative z-10 w-full max-w-md border-line bg-bg1/80 p-8 shadow-card"
      >
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-accent to-accent-2 text-2xl font-black text-white shadow-glow">
            N
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight text-fg">
            Welcome back
          </h1>
          <p className="mt-1 text-sm text-fg3">Sign in to your Nexus AI workspace</p>
        </div>

        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="relative">
            <User
              size={18}
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-fg4"
            />
            <input
              className="input pl-11"
              placeholder="Username"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoFocus
            />
          </div>

          <div className="relative">
            <Lock
              size={18}
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-fg4"
            />
            <input
              className="input px-11"
              type={show ? 'text' : 'password'}
              placeholder="Password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1 text-fg4 transition hover:text-fg"
              aria-label={show ? 'Hide password' : 'Show password'}
            >
              {show ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>

          {error && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="rounded-xl bg-red-500/10 px-4 py-2.5 text-sm font-medium text-red-400"
            >
              {error}
            </motion.p>
          )}

          <Button type="submit" loading={loading} className="mt-2 w-full">
            {!loading && <LogIn size={18} />}
            Sign in
          </Button>
        </form>
      </motion.div>
    </div>
  );
}

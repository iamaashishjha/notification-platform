import { FormEvent, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { Button } from '../../components/Button';
import { LogIn } from 'lucide-react';

export function LoginPage() {
  const { login, token } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  if (token) return <Navigate to="/" replace />;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      await login(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[#f7f8fb] px-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-md border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold">Notification Admin</h1>
        <div className="mt-6 space-y-4">
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Email</span>
            <input value={email} onChange={(e) => setEmail(e.target.value)} className="focus-ring w-full rounded-md border border-slate-300 px-3 py-2" />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Password</span>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="focus-ring w-full rounded-md border border-slate-300 px-3 py-2" />
          </label>
          {error && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
          <Button disabled={loading} variant="primary" icon={LogIn} className="w-full">
            {loading ? 'Signing in...' : 'Sign in'}
          </Button>
        </div>
      </form>
    </main>
  );
}

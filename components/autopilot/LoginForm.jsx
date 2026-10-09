'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { getBrowserSupabase } from '@/lib/autopilot/supabase/browserClient';
import { EagleMark, Icon } from './ui';

export default function LoginForm({ next = '/autopilot' }) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    const supabase = getBrowserSupabase();
    if (!supabase) return setError('Supabase n’est pas configuré sur cet environnement.');
    setBusy(true);
    setError('');
    try {
      const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
      const { error: err } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo } });
      if (err) throw err;
      setSent(true);
    } catch (err) {
      setError(err.message || 'Envoi impossible.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ap" style={{ display: 'grid', placeItems: 'center', minHeight: '100vh' }}>
      <div className="grain" />
      <motion.form
        onSubmit={submit}
        className="card"
        style={{ width: 'min(420px, 92vw)', padding: 'clamp(24px, 4vw, 36px)', display: 'grid', gap: 20, position: 'relative', zIndex: 2 }}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      >
        <div style={{ display: 'grid', gap: 10, justifyItems: 'center', textAlign: 'center' }}>
          <EagleMark size={40} />
          <p className="display" style={{ fontWeight: 700, fontSize: 20 }}>
            EAGLEYE <span style={{ color: 'var(--bronze-2)' }}>Autopilot</span>
          </p>
          <p style={{ color: 'var(--paper-2)', fontSize: 14 }}>Accès réservé à l’équipe EAGLEYE.</p>
        </div>

        {sent ? (
          <p className="mono" style={{ fontSize: 13.5, color: 'var(--bronze-2)', textAlign: 'center' }}>
            Lien envoyé à {email}. Ouvrez-le depuis cet appareil pour vous connecter.
          </p>
        ) : (
          <>
            <label className="field">
              <span className="label">E-mail</span>
              <input
                className="input"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="prenom@eagleye.fr"
              />
            </label>
            {error && <p style={{ color: 'var(--bad)', fontSize: 13 }}>{error}</p>}
            <button className="btn btn-primary" style={{ minHeight: 50 }} type="submit" disabled={busy || !email}>
              <Icon name="send" size={16} /> {busy ? 'Envoi…' : 'Recevoir le lien magique'}
            </button>
          </>
        )}
      </motion.form>
    </div>
  );
}

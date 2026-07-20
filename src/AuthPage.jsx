import { useState } from 'react';
import { supabase } from './supabase.js';

export default function AuthPage() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    if (!supabase) {
      setMessage('Add your VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to the root .env file first.');
      return;
    }

    setLoading(true);
    setMessage('');
    const action = isSignUp
      ? supabase.auth.signUp({ email, password })
      : supabase.auth.signInWithPassword({ email, password });
    const { error, data } = await action;
    setLoading(false);

    if (error) {
      setMessage(error.message);
    } else if (isSignUp && !data.session) {
      setMessage('Check your email to confirm your account, then log in.');
    }
  }

  return (
    <main className="app auth-page" data-theme="light">
      <section className="auth-card card">
        <a className="brand" href="#top">C<span>o</span>dexplain</a>
        <p className="eyebrow">LEARN FROM EVERY BUG</p>
        <h1>{isSignUp ? 'Create your account' : 'Welcome back'}</h1>
        <p className="auth-intro">Sign in to review code and keep track of your learning patterns.</p>
        <form className="auth-form" onSubmit={handleSubmit}>
          <label htmlFor="email">Email</label>
          <input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" />
          <label htmlFor="password">Password</label>
          <div className="password-input-wrap">
            <input id="password" type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} required minLength="6" autoComplete={isSignUp ? 'new-password' : 'current-password'} />
            <button className="password-toggle" type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'Hide password' : 'Show password'}>
              {showPassword ? '🙈' : '👁️'}
            </button>
          </div>
          <button type="submit" disabled={loading}>{loading ? 'Please wait...' : isSignUp ? 'Create account' : 'Log in'}</button>
        </form>
        {message && <p className="auth-message" role="status">{message}</p>}
        <button className="auth-switch" type="button" onClick={() => { setIsSignUp((value) => !value); setMessage(''); }}>
          {isSignUp ? 'Already have an account? Log in' : 'New here? Create an account'}
        </button>
      </section>
    </main>
  );
}

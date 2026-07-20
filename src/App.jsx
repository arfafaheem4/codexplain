import { useEffect, useState } from 'react';
import AuthPage from './AuthPage.jsx';
import { supabase } from './supabase.js';

const emptyResults = { explanation: '', correctedCode: '', quizQuestion: '', mistakeCategory: '' };

function CodeBlock({ code }) {
  return <pre className="code-block"><code>{code}</code></pre>;
}

export default function App() {
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window === 'undefined') return false;
    const savedTheme = window.localStorage.getItem('codexplain-theme');
    return savedTheme === 'dark';
  });
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [code, setCode] = useState('');
  const [file, setFile] = useState(null);
  const [results, setResults] = useState(emptyResults);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [reviewedCode, setReviewedCode] = useState('');
  const [answer, setAnswer] = useState('');
  const [answerStatus, setAnswerStatus] = useState('');
  const [answerFeedback, setAnswerFeedback] = useState(null);
  const [checkingAnswer, setCheckingAnswer] = useState(false);
  const [verifyChallenge, setVerifyChallenge] = useState(null);
  const [verifyAnswer, setVerifyAnswer] = useState('');
  const [verifyFeedback, setVerifyFeedback] = useState(null);
  const [verifyStatus, setVerifyStatus] = useState('');
  const [creatingChallenge, setCreatingChallenge] = useState(false);
  const [checkingVerify, setCheckingVerify] = useState(false);
  const [patterns, setPatterns] = useState({});
  const [patternsStatus, setPatternsStatus] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const repeatedPatterns = Object.entries(patterns).filter(([, count]) => count >= 3);

  useEffect(() => {
    if (!supabase) {
      setAuthReady(true);
      return undefined;
    }

    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      setAuthReady(true);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setAuthReady(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (user) {
      loadPatterns();
    } else {
      setPatterns({});
      setPatternsStatus('');
    }
  }, [user]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('codexplain-theme', isDarkMode ? 'dark' : 'light');
    }
  }, [isDarkMode]);

  async function loadPatterns() {
    if (!user?.id) return;
    try {
      const response = await fetch(`http://localhost:3001/api/patterns?userId=${encodeURIComponent(user.id)}`, {
        headers: { 'X-User-Id': user.id },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to load your patterns.');
      setPatterns(data.patterns);
      setPatternsStatus('');
    } catch (error) {
      setPatternsStatus(error.message || 'Unable to load your patterns.');
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!code.trim() && !file) {
      setStatus('Paste code or choose a file first.');
      return;
    }

    setLoading(true);
    setStatus('Reviewing your code...');
    setResults(emptyResults);
    setAnswer('');
    setAnswerStatus('');
    setAnswerFeedback(null);
    setVerifyChallenge(null);
    setVerifyAnswer('');
    setVerifyFeedback(null);
    setVerifyStatus('');

    try {
      if (!user?.id) {
        setStatus('Please log in to review your code.');
        return;
      }

      const codeContext = code || (file ? await file.text() : '');
      const body = new FormData();
      body.append('code', codeContext);
      body.append('userId', user.id);
      if (file) body.append('file', file);

      const response = await fetch('http://localhost:3001/api/review', {
        method: 'POST',
        body,
        headers: { 'X-User-Id': user.id },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to review code.');
      setResults(data);
      setReviewedCode(codeContext);
      await loadPatterns();
      setStatus('Your review is ready.');
    } catch (error) {
      setStatus(error.message || 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  async function handleAnswerSubmit(event) {
    event.preventDefault();
    if (!answer.trim()) {
      setAnswerStatus('Type an answer first.');
      return;
    }

    setCheckingAnswer(true);
    setAnswerStatus('Checking your answer...');
    setAnswerFeedback(null);

    try {
      const response = await fetch('http://localhost:3001/api/check-answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answer, quizQuestion: results.quizQuestion, codeContext: reviewedCode, mistakeType: results.explanation }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to check your answer.');
      setAnswerFeedback(data);
      setAnswerStatus('');
    } catch (error) {
      setAnswerStatus(error.message || 'Something went wrong.');
    } finally {
      setCheckingAnswer(false);
    }
  }

  async function handleCreateChallenge() {
    setCreatingChallenge(true);
    setVerifyStatus('Creating your practice challenge...');
    setVerifyChallenge(null);
    setVerifyAnswer('');
    setVerifyFeedback(null);

    try {
      const response = await fetch('http://localhost:3001/api/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codeContext: reviewedCode, mistakeType: results.explanation }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to create a practice challenge.');
      setVerifyChallenge(data);
      setVerifyStatus('');
    } catch (error) {
      setVerifyStatus(error.message || 'Something went wrong.');
    } finally {
      setCreatingChallenge(false);
    }
  }

  async function handleVerifySubmit(event) {
    event.preventDefault();
    if (!verifyAnswer.trim()) {
      setVerifyStatus('Type what you think is wrong first.');
      return;
    }

    setCheckingVerify(true);
    setVerifyStatus('Checking your answer...');
    setVerifyFeedback(null);

    try {
      const response = await fetch('http://localhost:3001/api/verify-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answer: verifyAnswer, modifiedCode: verifyChallenge.modifiedCode, mistakeType: results.explanation }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to check your practice answer.');
      setVerifyFeedback(data);
      setVerifyStatus('');
    } catch (error) {
      setVerifyStatus(error.message || 'Something went wrong.');
    } finally {
      setCheckingVerify(false);
    }
  }

  async function handleLogout() {
    setStatus('');
    setResults(emptyResults);
    setAnswer('');
    setAnswerStatus('');
    setAnswerFeedback(null);
    setVerifyChallenge(null);
    setVerifyAnswer('');
    setVerifyFeedback(null);
    setVerifyStatus('');
    if (supabase) await supabase.auth.signOut();
  }

  if (!authReady) {
    return <main className="app auth-page" data-theme="light"><p className="auth-loading">Loading...</p></main>;
  }

  if (!user) return <AuthPage />;

  return (
    <main className="app" data-theme={isDarkMode ? 'dark' : 'light'}>
      <div className="page-shell">
        <header className="topbar">
          <a className="brand" href="#top" aria-label="Codexplain home">C<span>o</span>dexplain</a>
          <div className="topbar-actions">
            <button className="theme-toggle" type="button" onClick={() => setIsDarkMode((currentMode) => !currentMode)} aria-label={`Switch to ${isDarkMode ? 'light' : 'dark'} mode`}>
              <span aria-hidden="true">{isDarkMode ? '☀' : '☾'}</span> {isDarkMode ? 'Light' : 'Dark'}
            </button>
            <button className="logout-button" type="button" onClick={handleLogout}>Logout</button>
          </div>
        </header>

        <section className="hero" id="top">
          <p className="eyebrow">CODE REVIEW, EXPLAINED</p>
          <h1>Understand your code.<br /><em>Grow with every bug.</em></h1>
          <p className="intro">Paste a snippet or upload a source file. Codexplain turns mistakes into clear lessons and hands-on practice.</p>
        </section>

        <div className={`app-layout ${isSidebarOpen ? 'sidebar-open' : 'sidebar-closed'}`}>
          <aside className={`patterns-panel card ${isSidebarOpen ? 'open' : 'closed'}`} aria-live="polite">
            <button className="sidebar-toggle" type="button" onClick={() => setIsSidebarOpen((value) => !value)} aria-label={isSidebarOpen ? 'Hide patterns sidebar' : 'Show patterns sidebar'}>
              {isSidebarOpen ? '←' : '→'}
            </button>
            {isSidebarOpen && (
              <>
                <div className="section-heading"><span className="step">✦</span><div><h2>Your patterns</h2><p>We track your recurring mistake categories for your account.</p></div></div>
                {patternsStatus ? (
                  <p className="patterns-empty">{patternsStatus}</p>
                ) : Object.keys(patterns).length === 0 ? (
                  <p className="patterns-empty">Your recurring coding patterns will appear here after a review.</p>
                ) : (
                  <ul className="pattern-list">
                    {Object.entries(patterns).map(([category, count]) => <li key={category}><span>{category}</span><strong>{count} {count === 1 ? 'time' : 'times'}</strong></li>)}
                  </ul>
                )}
                {repeatedPatterns.map(([category, count]) => <p className="pattern-alert" key={category}>You’ve made <strong>{category}</strong> {count} times — worth reviewing this concept.</p>)}
              </>
            )}
          </aside>

          <div className="main-content">
            <form className="review-card card" onSubmit={handleSubmit}>
              <div className="section-heading"><span className="step">01</span><div><h2>Start a review</h2><p>Share a code snippet or source file.</p></div></div>
              <label htmlFor="code">Your code</label>
              <textarea id="code" value={code} onChange={(event) => setCode(event.target.value)} placeholder="Paste your code here..." spellCheck="false" />
              <div className="or"><span>or</span></div>
              <label className="file-picker" htmlFor="file">
                <span>Choose a code file</span>
                <div className="file-picker-meta">
                  <small>{file ? file.name : 'No file selected'}</small>
                  {file && (
                    <button className="file-clear" type="button" onClick={(event) => { event.preventDefault(); setFile(null); }} aria-label="Remove selected file">
                      ×
                    </button>
                  )}
                </div>
              </label>
              <input id="file" type="file" accept=".js,.jsx,.ts,.tsx,.py,.java,.c,.cpp,.cs,.go,.rb,.php,.html,.css,.json,.txt" onChange={(event) => setFile(event.target.files?.[0] || null)} />
              <button type="submit" disabled={loading}>{loading ? 'Reviewing...' : 'Review my code'}</button>
              {status && <p className="status" role="status">{status}</p>}
            </form>

            {results.explanation && (
              <section className="results" aria-live="polite">
          <article className="card"><div className="section-heading"><span className="step">02</span><div><h2>What happened</h2><p>Your code, explained simply.</p></div></div><p>{results.explanation}</p></article>
          <article className="card"><div className="section-heading"><span className="step">03</span><div><h2>A better version</h2><p>Compare this with your original code.</p></div></div><CodeBlock code={results.correctedCode} /></article>
          <article className="card">
            <div className="section-heading"><span className="step">04</span><div><h2>Quick check</h2><p>Put your understanding to the test.</p></div></div>
            <p>{results.quizQuestion}</p>
            <form className="answer-form" onSubmit={handleAnswerSubmit}>
              <label htmlFor="answer">Your answer</label>
              <input id="answer" type="text" value={answer} onChange={(event) => setAnswer(event.target.value)} placeholder="Type your answer..." disabled={checkingAnswer} />
              <button type="submit" disabled={checkingAnswer}>{checkingAnswer ? 'Checking...' : 'Submit answer'}</button>
            </form>
            {answerStatus && <p className="answer-status" role="status">{answerStatus}</p>}
            {answerFeedback && <p className={`answer-feedback ${answerFeedback.isCorrect ? 'correct' : 'partial'}`}><strong>{answerFeedback.isCorrect ? 'Correct!' : 'Almost there!'}</strong> {answerFeedback.feedback}</p>}
          </article>
          {answerFeedback && (
            <article className="verify-card card">
              <div className="section-heading"><span className="step">05</span><div><h2>Verify your understanding</h2><p>Find a similar bug in a new example.</p></div></div>
              <button type="button" onClick={handleCreateChallenge} disabled={creatingChallenge}>{creatingChallenge ? 'Creating...' : 'Test me again'}</button>
              {verifyStatus && <p className="answer-status" role="status">{verifyStatus}</p>}
              {verifyChallenge && (
                <div className="verify-challenge">
                  <p className="hint"><strong>Hint:</strong> {verifyChallenge.hint}</p>
                  <CodeBlock code={verifyChallenge.modifiedCode} />
                  <form className="answer-form" onSubmit={handleVerifySubmit}>
                    <label htmlFor="verify-answer">What is wrong with this code?</label>
                    <input id="verify-answer" type="text" value={verifyAnswer} onChange={(event) => setVerifyAnswer(event.target.value)} placeholder="Identify the mistake..." disabled={checkingVerify} />
                    <button type="submit" disabled={checkingVerify}>{checkingVerify ? 'Checking...' : 'Submit'}</button>
                  </form>
                  {verifyFeedback && <p className={`answer-feedback ${verifyFeedback.isCorrect ? 'correct' : 'partial'}`}><strong>{verifyFeedback.isCorrect ? 'You spotted it!' : 'Keep looking!'}</strong> {verifyFeedback.feedback}</p>}
                </div>
              )}
            </article>
          )}
        </section>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

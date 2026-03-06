import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { GoogleOAuthProvider, GoogleLogin } from '@react-oauth/google';
import { useAuth } from '../context/AuthContext';
import { authAPI } from '../services/api';
import './Landing.css';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

export const Landing = () => {
    const navigate = useNavigate();
    const { user, login, register, loading: authLoading, isAuthenticated } = useAuth();

    // Modal state
    const [activeModal, setActiveModal] = useState(null); // 'login' | 'register' | null
    const [form, setForm] = useState({ name: '', email: '', password: '', confirmPassword: '' });
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [googleLoading, setGoogleLoading] = useState(false);

    // Cursor refs
    const curRef = useRef(null);
    const cur2Ref = useRef(null);
    const mxRef = useRef(0);
    const myRef = useRef(0);
    const r2xRef = useRef(0);
    const r2yRef = useRef(0);

    // Canvas ref
    const canvasRef = useRef(null);
    const particlesRef = useRef([]);
    const mouseXRef = useRef(0);
    const mouseYRef = useRef(0);

    // Auto-redirect authenticated users
    useEffect(() => {
        if (!authLoading && isAuthenticated) {
            navigate('/dashboard', { replace: true });
        }
    }, [authLoading, isAuthenticated, navigate]);

    // ── Custom cursor ──
    useEffect(() => {
        const handleMouseMove = (e) => {
            mxRef.current = e.clientX;
            myRef.current = e.clientY;
            mouseXRef.current = e.clientX;
            mouseYRef.current = e.clientY;
            if (curRef.current) {
                curRef.current.style.left = e.clientX + 'px';
                curRef.current.style.top = e.clientY + 'px';
            }
        };
        document.addEventListener('mousemove', handleMouseMove);

        let animId;
        const loop = () => {
            r2xRef.current += (mxRef.current - r2xRef.current) * 0.13;
            r2yRef.current += (myRef.current - r2yRef.current) * 0.13;
            if (cur2Ref.current) {
                cur2Ref.current.style.left = r2xRef.current + 'px';
                cur2Ref.current.style.top = r2yRef.current + 'px';
            }
            animId = requestAnimationFrame(loop);
        };
        animId = requestAnimationFrame(loop);

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            cancelAnimationFrame(animId);
        };
    }, []);

    // ── Canvas particles ──
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        let W, H;

        const resize = () => {
            W = canvas.width = canvas.parentElement.offsetWidth;
            H = canvas.height = canvas.parentElement.offsetHeight;
        };
        resize();
        window.addEventListener('resize', resize);

        class Particle {
            constructor() { this.reset(); }
            reset() {
                this.x = Math.random() * W;
                this.y = Math.random() * H;
                this.vx = (Math.random() - 0.5) * 0.4;
                this.vy = (Math.random() - 0.5) * 0.4;
                this.size = Math.random() * 1.5 + 0.3;
                this.alpha = Math.random() * 0.5 + 0.1;
                this.color = Math.random() > 0.6 ? '57,255,20' : Math.random() > 0.5 ? '0,212,255' : '180,79,255';
            }
            update() {
                this.x += this.vx;
                this.y += this.vy;
                if (this.x < 0 || this.x > W || this.y < 0 || this.y > H) this.reset();
            }
            draw() {
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(${this.color},${this.alpha})`;
                ctx.fill();
            }
        }

        const particles = [];
        for (let i = 0; i < 120; i++) particles.push(new Particle());
        particlesRef.current = particles;

        const drawConnections = () => {
            for (let i = 0; i < particles.length; i++) {
                for (let j = i + 1; j < particles.length; j++) {
                    const dx = particles[i].x - particles[j].x;
                    const dy = particles[i].y - particles[j].y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist < 100) {
                        ctx.beginPath();
                        ctx.strokeStyle = `rgba(57,255,20,${0.06 * (1 - dist / 100)})`;
                        ctx.lineWidth = 0.5;
                        ctx.moveTo(particles[i].x, particles[i].y);
                        ctx.lineTo(particles[j].x, particles[j].y);
                        ctx.stroke();
                    }
                }
            }
        };

        let rafId;
        const anim = () => {
            ctx.clearRect(0, 0, W, H);
            particles.forEach(p => {
                const dx = p.x - mouseXRef.current;
                const dy = p.y - mouseYRef.current;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < 150) {
                    p.x += (dx / dist) * 0.8;
                    p.y += (dy / dist) * 0.8;
                }
                p.update();
                p.draw();
            });
            drawConnections();
            rafId = requestAnimationFrame(anim);
        };
        anim();

        return () => {
            window.removeEventListener('resize', resize);
            cancelAnimationFrame(rafId);
        };
    }, []);

    // ── Scroll reveal ──
    useEffect(() => {
        const obs = new IntersectionObserver(entries => {
            entries.forEach((e, i) => {
                if (e.isIntersecting) {
                    setTimeout(() => e.target.classList.add('on'), i * 70);
                    obs.unobserve(e.target);
                }
            });
        }, { threshold: 0.12 });

        const obs2 = new IntersectionObserver(entries => {
            entries.forEach(e => {
                if (e.isIntersecting) { e.target.classList.add('on'); obs2.unobserve(e.target); }
            });
        }, { threshold: 0.2 });

        document.querySelectorAll('.landing-black [data-r],.landing-black .pipe-card,.landing-black .feat-cell,.landing-black .spd-cell').forEach(el => obs.observe(el));
        document.querySelectorAll('.landing-black .term-box,.landing-black .term-text').forEach(el => obs2.observe(el));
        document.querySelectorAll('.landing-black .pipe-card').forEach((c, i) => { c.style.transitionDelay = (i * 0.1) + 's'; });
        document.querySelectorAll('.landing-black .feat-cell').forEach((c, i) => { c.style.transitionDelay = (i * 0.07) + 's'; });
        document.querySelectorAll('.landing-black .spd-cell').forEach((c, i) => { c.style.transitionDelay = (i * 0.08) + 's'; });

        return () => { obs.disconnect(); obs2.disconnect(); };
    }, []);

    // ── Modal helpers ──
    const openModal = (type) => { setActiveModal(type); setError(''); setMessage(''); };
    const closeModal = () => { setActiveModal(null); setError(''); setMessage(''); };
    const switchModal = (to) => { setActiveModal(to); setError(''); setMessage(''); setForm({ name: '', email: '', password: '', confirmPassword: '' }); };

    // ── Google login (through backend API) ──
    const handleGoogleSuccess = useCallback(async (credentialResponse) => {
        setError('');
        setMessage('');
        if (!credentialResponse?.credential) {
            setError('Google login failed. Please try again.');
            return;
        }
        try {
            setGoogleLoading(true);
            const response = await authAPI.googleLogin(credentialResponse.credential);
            login(response.data);
            setMessage('Google login successful. Redirecting...');
            closeModal();
            navigate('/dashboard');
        } catch (err) {
            const msg = err?.response?.data?.error || 'Google login failed. Please try again.';
            setError(msg);
        } finally {
            setGoogleLoading(false);
        }
    }, [login, navigate]);

    const handleGoogleError = useCallback(() => {
        setError('Google login failed. Please try again.');
    }, []);

    // ── Email login ──
    const doLogin = async () => {
        setError('');
        setMessage('');
        const email = form.email.trim().toLowerCase();
        const password = form.password;
        if (!email || !password) return setError('Please fill in all fields.');
        if (!email.endsWith('@gmail.com')) return setError('Please use a valid Gmail address.');
        try {
            setSubmitting(true);
            const response = await authAPI.login(email, password);
            login(response.data);
            setMessage('Login successful. Redirecting...');
            closeModal();
            navigate('/dashboard');
        } catch (err) {
            const msg = err?.response?.data?.error || err?.response?.data?.email?.[0] || err?.response?.data?.password?.[0] || 'Authentication failed. Please try again.';
            setError(msg);
        } finally {
            setSubmitting(false);
        }
    };

    // ── Email register ──
    const doRegister = async () => {
        setError('');
        setMessage('');
        const email = form.email.trim().toLowerCase();
        const password = form.password;
        if (!email || !password) return setError('Please fill in all fields.');
        if (!email.endsWith('@gmail.com')) return setError('Please use a valid Gmail address.');
        if (password.length < 6) return setError('Password must be at least 6 characters.');
        if (form.confirmPassword !== password) return setError('Passwords do not match.');
        try {
            setSubmitting(true);
            const response = await authAPI.register(email, password, form.confirmPassword);
            register(response.data);
            setMessage('Registration complete. Welcome to VideoMind.');
            closeModal();
            navigate('/dashboard');
        } catch (err) {
            const msg = err?.response?.data?.error || err?.response?.data?.email?.[0] || err?.response?.data?.confirm_password?.[0] || err?.response?.data?.password?.[0] || 'Registration failed. Please try again.';
            setError(msg);
        } finally {
            setSubmitting(false);
        }
    };

    const handleField = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

    // ── Render ──
    return (
        <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
            <div className="landing-black">
                {/* Custom cursor */}
                <div className="cur-dot" ref={curRef} />
                <div className="cur-ring" ref={cur2Ref} />

                {/* ── LOGIN MODAL ── */}
                <div className={`modal-overlay ${activeModal === 'login' ? 'active' : ''}`} onClick={e => { if (e.target === e.currentTarget) closeModal(); }}>
                    <div className="modal-box">
                        <button className="modal-close" onClick={closeModal}>✕</button>
                        <div className="modal-tag">// Access your account</div>
                        <h2>Sign In</h2>
                        <p>Welcome back. Continue your video intelligence journey.</p>
                        {error && <div className="error-msg">{error}</div>}
                        {message && <div className="success-msg">{message}</div>}

                        <div className="google-auth-wrap">
                            <GoogleLogin
                                onSuccess={handleGoogleSuccess}
                                onError={handleGoogleError}
                                size="large"
                                theme="outline"
                                text="continue_with"
                                shape="rectangular"
                                width="350"
                            />
                        </div>
                        {googleLoading && <div className="google-loading-text">Verifying Google account...</div>}

                        <div className="divider">or sign in with email</div>

                        <div className="field"><label>Email</label><input type="email" placeholder="you@gmail.com" value={form.email} onChange={e => handleField('email', e.target.value)} /></div>
                        <div className="field"><label>Password</label><input type="password" placeholder="••••••••" value={form.password} onChange={e => handleField('password', e.target.value)} onKeyDown={e => { if (e.key === 'Enter') doLogin(); }} /></div>
                        <button className="modal-submit" onClick={doLogin} disabled={submitting}>{submitting ? 'Signing in...' : 'Sign In →'}</button>
                        <div className="modal-switch">No account? <button onClick={() => switchModal('register')}>Register here</button></div>
                    </div>
                </div>

                {/* ── REGISTER MODAL ── */}
                <div className={`modal-overlay ${activeModal === 'register' ? 'active' : ''}`} onClick={e => { if (e.target === e.currentTarget) closeModal(); }}>
                    <div className="modal-box">
                        <button className="modal-close" onClick={closeModal}>✕</button>
                        <div className="modal-tag">// Create account</div>
                        <h2>Register</h2>
                        <p>Join VideoMind and unlock AI-powered video intelligence.</p>
                        {error && <div className="error-msg">{error}</div>}
                        {message && <div className="success-msg">{message}</div>}

                        <div className="google-auth-wrap">
                            <GoogleLogin
                                onSuccess={handleGoogleSuccess}
                                onError={handleGoogleError}
                                size="large"
                                theme="outline"
                                text="signup_with"
                                shape="rectangular"
                                width="350"
                            />
                        </div>
                        {googleLoading && <div className="google-loading-text">Verifying Google account...</div>}

                        <div className="divider">or register with email</div>

                        <div className="field"><label>Email</label><input type="email" placeholder="you@gmail.com" value={form.email} onChange={e => handleField('email', e.target.value)} /></div>
                        <div className="field"><label>Password</label><input type="password" placeholder="Min. 6 characters" value={form.password} onChange={e => handleField('password', e.target.value)} /></div>
                        <div className="field"><label>Confirm Password</label><input type="password" placeholder="Re-enter password" value={form.confirmPassword} onChange={e => handleField('confirmPassword', e.target.value)} onKeyDown={e => { if (e.key === 'Enter') doRegister(); }} /></div>
                        <button className="modal-submit" onClick={doRegister} disabled={submitting}>{submitting ? 'Creating...' : 'Create Account →'}</button>
                        <div className="modal-switch">Already have an account? <button onClick={() => switchModal('login')}>Sign in</button></div>
                    </div>
                </div>

                {/* ── NAV ── */}
                <nav className="lnav">
                    <button className="lnav-logo" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
                        <div className="logo-pulse" />VideoMind
                    </button>
                    <div className="lnav-r">
                        <div className="lnav-links">
                            <a href="#pipe">Pipeline</a>
                            <a href="#feat">Features</a>
                            <a href="#spd">Speed</a>
                        </div>
                        <div>
                            {user ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '.8rem', flexWrap: 'wrap' }}>
                                    <div className="user-badge">
                                        {user.picture && <img src={user.picture} className="user-avatar" referrerPolicy="no-referrer" alt="" />}
                                        <div className="user-dot" />{user.name}
                                    </div>
                                    <button className="lnav-btn dashboard" onClick={() => navigate('/dashboard')}>Dashboard →</button>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '.6rem' }}>
                                    <button className="lnav-btn ghost" onClick={() => openModal('login')}>Login</button>
                                    <button className="lnav-btn" onClick={() => openModal('register')}>Register</button>
                                </div>
                            )}
                        </div>
                    </div>
                </nav>

                {/* ── HERO ── */}
                <section className="l-hero">
                    <canvas ref={canvasRef} />
                    <div className="hero-left">
                        <div className="hero-tag">// AI-Powered Video Intelligence</div>
                        <h1 className="hero-h1">
                            <span className="line1">Videos contain</span>
                            <span className="line2">everything.</span>
                            <span className="line3">We extract it.</span>
                        </h1>
                        <p className="hero-sub">Drop any video. VideoMind transcribes, embeds, and makes every second searchable — answering your questions with pinpoint timestamps.</p>
                        <div className="hero-btns">
                            {user ? (
                                <>
                                    <button className="btn-dash" onClick={() => navigate('/dashboard')}><span>Go to Dashboard</span><span>→</span></button>
                                    <a href="#pipe" className="btn-line">How it works</a>
                                </>
                            ) : (
                                <>
                                    <button className="btn-main" onClick={() => openModal('register')}><span>Get Started</span><span>→</span></button>
                                    <button className="btn-line" onClick={() => openModal('login')}>Sign In</button>
                                </>
                            )}
                        </div>
                    </div>
                    <div className="hero-right">
                        <div className="stat-box"><div className="stat-n">15<em>x</em></div><div className="stat-l">Faster pipeline</div></div>
                        <div className="stat-box"><div className="stat-n">99<em>+</em></div><div className="stat-l">Languages</div></div>
                        <div className="stat-box"><div className="stat-n">4<em>min</em></div><div className="stat-l">23 min video</div></div>
                    </div>
                    <div className="scroll-hint"><div className="scroll-line-anim" /><span>Scroll to explore</span></div>
                </section>

                {/* ── TICKER ── */}
                <div className="ticker">
                    <div className="ticker-track">
                        {['FFmpeg|Video Compression', 'Groq Whisper|Transcription', 'OpenAI|Embeddings', 'Cosine Similarity|Search', 'GPT-4o-mini|PDF Generation', 'Timestamped|Answers', 'RAG|Architecture', 'Django|Backend', 'React|Frontend',
                          'FFmpeg|Video Compression', 'Groq Whisper|Transcription', 'OpenAI|Embeddings', 'Cosine Similarity|Search', 'GPT-4o-mini|PDF Generation', 'Timestamped|Answers', 'RAG|Architecture', 'Django|Backend', 'React|Frontend'
                        ].map((item, i) => {
                            const [bold, rest] = item.split('|');
                            return <div className="ticker-item" key={i}><b>{bold}</b> {rest}</div>;
                        })}
                    </div>
                </div>

                {/* ── PIPELINE ── */}
                <section className="lsec" id="pipe">
                    <div data-r="">
                        <div className="sec-label">The Pipeline</div>
                        <h2 className="sec-h2">Five steps.<br /><em>One intelligent system.</em></h2>
                    </div>
                    <div className="pipe-grid">
                        {[
                            { icon: '🎬', num: '01', name: 'Upload', desc: 'Drag & drop any video. Real-time status tracking at every stage of the pipeline.' },
                            { icon: '⚡', num: '02', name: 'Compress', desc: 'Auto-compressed 70% smaller. Faster everything — upload, convert, store.' },
                            { icon: '🎙️', num: '03', name: 'Transcribe', desc: 'Parallel chunk transcription. Every word timestamped. 99 languages. Blazing fast.' },
                            { icon: '🧠', num: '04', name: 'Embed', desc: 'Semantic vectors. Every chunk mapped into meaning-space for precise retrieval.' },
                            { icon: '📄', num: '05', name: 'Output', desc: 'Ask anything. Get timestamped answers. Export beautiful study PDFs automatically.' },
                        ].map((p, i) => (
                            <div className="pipe-card" key={i}>
                                <div className="pipe-top"><div className="pipe-icon">{p.icon}</div><div className="pipe-num">{p.num}</div></div>
                                <div className="pipe-name">{p.name}</div>
                                <div className="pipe-desc">{p.desc}</div>
                            </div>
                        ))}
                    </div>
                </section>

                {/* ── FEATURES ── */}
                <section className="lsec" id="feat" style={{ background: 'var(--c2)' }}>
                    <div data-r="">
                        <div className="sec-label">Capabilities</div>
                        <h2 className="sec-h2">Built different.<br /><em>Works better.</em></h2>
                    </div>
                    <div className="feat-grid">
                        {[
                            { n: '001', ico: '⏱️', t: 'Timestamped Answers', d: 'Every answer pinpoints the exact moment in the video. Click the timestamp — jump right there.' },
                            { n: '002', ico: '🔍', t: 'Semantic Search', d: 'Understands meaning, not keywords. OpenAI embeddings find the right context every single time.' },
                            { n: '003', ico: '📚', t: 'AI Study PDFs', d: 'GPT-4o-mini rewrites transcripts into structured educational notes. Concepts, examples, code — all formatted.' },
                            { n: '004', ico: '🌍', t: '99 Languages', d: 'Whisper large-v3-turbo handles 99 languages flawlessly. Upload anything, in any language.' },
                            { n: '005', ico: '🚀', t: '15x Faster', d: 'Parallel transcription + batch embeddings + compression. 45 minutes → under 4 minutes.' },
                            { n: '006', ico: '💬', t: 'Contextual Chat', d: 'LLaMA 3.3-70b on Groq. Ask complex multi-part questions. Get answers from the exact right segment.' },
                        ].map((f, i) => (
                            <div className="feat-cell" key={i}>
                                <div className="feat-n">{f.n}</div><span className="feat-ico">{f.ico}</span>
                                <div className="feat-t">{f.t}</div>
                                <div className="feat-d">{f.d}</div>
                            </div>
                        ))}
                    </div>
                </section>

                {/* ── TERMINAL ── */}
                <div className="term-wrap">
                    <div className="term-box">
                        <div className="term-head">
                            <div className="td r" /><div className="td y" /><div className="td g" />
                            <div className="term-name">pipeline.log — live</div>
                        </div>
                        <div className="term-body">
                            <div className="tl"><span className="tp">$</span><span className="tt">upload <span className="th">lecture_23min.mp4</span> <span className="tc">(487MB)</span></span></div>
                            <div className="tl"><span className="tout tc">→ queued for processing...</span></div>
                            <div className="tl"><span className="tp">✓</span><span className="tt">compressed <span className="th">487MB → 142MB</span> <span className="tc">(-70%)</span></span></div>
                            <div className="tl"><span className="tp">✓</span><span className="tt">audio extracted <span className="th">28s</span></span></div>
                            <div className="tl"><span className="tout tc">→ splitting into 3 chunks...</span></div>
                            <div className="tl"><span className="tp">✓</span><span className="tt">lang: <span className="tts">English</span> → turbo model</span></div>
                            <div className="tl"><span className="tout tc">→ transcribing in parallel [▓▓▓▓▓▓▓░░░]</span></div>
                            <div className="tl"><span className="tp">✓</span><span className="tt">transcript <span className="th">47s</span> <span className="tc">(3 chunks × parallel)</span></span></div>
                            <div className="tl"><span className="tout tc">→ generating embeddings...</span></div>
                            <div className="tl"><span className="tp">✓</span><span className="tt">embedded <span className="th">89 chunks</span> × 1536-dim <span className="tc">9s</span></span></div>
                            <div className="tl"><span className="tout tc">→ gpt-4o-mini generating PDF...</span></div>
                            <div className="tl"><span className="tp">✓</span><span className="tt">PDF <span className="th">42 pages</span> <span className="tc">2m 14s</span></span></div>
                            <div className="tl"><span className="tp" style={{ color: '#28c840' }}>✓</span><span className="tts">DONE — <span className="th">4m 07s</span> total</span></div>
                            <div className="tl"><span className="tout">&nbsp;</span><span className="tcurs" /></div>
                        </div>
                    </div>
                    <div className="term-text">
                        <div className="sec-label">Live Logs</div>
                        <h2 className="sec-h2" style={{ marginBottom: '1.2rem' }}>No black<br /><em>boxes.</em></h2>
                        <p style={{ color: 'var(--dim)', lineHeight: 1.8, fontSize: '.95rem', marginBottom: '1rem' }}>Watch every stage of your video pipeline execute in real time. From raw upload to fully searchable knowledge — complete transparency.</p>
                        <p style={{ color: 'var(--dim)', lineHeight: 1.8, fontSize: '.95rem' }}>Every step logged. Every error surfaced. Every optimization visible.</p>
                        <div className="term-stats">
                            <div className="ts-item"><div className="ts-n">4<span>min</span></div><div className="ts-l">23 min video</div></div>
                            <div className="ts-item"><div className="ts-n">89<span>×</span></div><div className="ts-l">Chunks embedded</div></div>
                            <div className="ts-item"><div className="ts-n">42<span>pg</span></div><div className="ts-l">PDF generated</div></div>
                        </div>
                    </div>
                </div>

                {/* ── SPEED ── */}
                <section className="l-spd" id="spd">
                    <div data-r="">
                        <div className="sec-label" style={{ justifyContent: 'center', display: 'flex' }}>Speed</div>
                        <h2 className="sec-h2" style={{ textAlign: 'center' }}>Processing time<br /><em>per video length</em></h2>
                    </div>
                    <div className="spd-grid">
                        {[
                            { l: '1 min video', n: '~1', u: 'min', s: '45sec – 1.5min' },
                            { l: '10 min video', n: '~3', u: 'min', s: '3 – 5 min' },
                            { l: '23 min video', n: '~4', u: 'min', s: '4 – 7 min' },
                            { l: '1 hour video', n: '~15', u: 'min', s: '12 – 18 min' },
                        ].map((s, i) => (
                            <div className="spd-cell" key={i}>
                                <div className="spd-l">{s.l}</div>
                                <div className="spd-n">{s.n}<span>{s.u}</span></div>
                                <div className="spd-s">{s.s}</div>
                            </div>
                        ))}
                    </div>
                    <p className="spd-pw">Groq LPUs · OpenAI Embeddings · FFmpeg · GPT-4o-mini · Django · React</p>
                </section>

                {/* ── CTA ── */}
                <section className="l-cta">
                    <div className="cta-glow" /><div className="cta-glow2" />
                    <div className="cta-tag">// Ready to begin</div>
                    <h2 className="cta-h2">Your videos.<br /><em>Unlocked.</em></h2>
                    <p className="cta-sub">Upload your first video right now. No setup. No waiting. Just intelligence.</p>
                    {user ? (
                        <button className="cta-btn" onClick={() => navigate('/dashboard')}><span>Open VideoMind</span><span>→</span></button>
                    ) : (
                        <button className="cta-btn" onClick={() => openModal('register')}><span>Start for Free</span><span>→</span></button>
                    )}
                    <span className="cta-note">localhost:5173 · development build · built by Karthik</span>
                </section>

                {/* ── FOOTER ── */}
                <footer className="l-footer">
                    <div className="fc">© 2026 VideoMind · Built by Karthik</div>
                    <div className="ft">RAG · AI · SEMANTIC SEARCH</div>
                </footer>
            </div>
        </GoogleOAuthProvider>
    );
};

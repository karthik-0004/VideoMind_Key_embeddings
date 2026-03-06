import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Maximize, Volume2, VolumeX, SkipBack, SkipForward, Play, Pause } from 'lucide-react';
import { videoAPI } from '../services/api';
import { useTheme } from '../context/ThemeContext';

/* ─────────────────── helpers ─────────────────── */
const fmt = (s) => {
    if (!s || isNaN(s)) return '00:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
};

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

/* ═══════════════════ COMPONENT ═══════════════════ */
export const StudyRoom = () => {
    const { id } = useParams();
    const navigate = useNavigate();

    /* ── video state ── */
    const videoRef = useRef(null);
    const progressRef = useRef(null);
    const msgsEndRef = useRef(null);
    const chipsRef = useRef(null);
    const isSeekingRef = useRef(false);

    const [video, setVideo] = useState(null);
    const [videoReady, setVideoReady] = useState(false);
    const [videoError, setVideoError] = useState(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [buffered, setBuffered] = useState(0);
    const [volume, setVolume] = useState(1);
    const [muted, setMuted] = useState(false);
    const [playbackRate, setPlaybackRate] = useState(1);
    const { theme, toggleTheme } = useTheme();
    const isDark = theme === 'dark';

    /* ── tabs state ── */
    const [activeTab, setActiveTab] = useState('ai');

    /* ── AI Assistant state ── */
    const [aiMessages, setAiMessages] = useState(() => {
        try { const s = localStorage.getItem(`sr-ai-msgs-${id}`); return s ? JSON.parse(s) : []; } catch { return []; }
    });
    const [aiInput, setAiInput] = useState('');
    const [aiLoading, setAiLoading] = useState(false);
    const [aiHistory, setAiHistory] = useState(() => {
        try { const s = localStorage.getItem(`sr-ai-hist-${id}`); return s ? JSON.parse(s) : []; } catch { return []; }
    });

    /* ── Timestamps state ── */
    const [tsMessages, setTsMessages] = useState(() => {
        try { const s = localStorage.getItem(`sr-ts-msgs-${id}`); return s ? JSON.parse(s) : []; } catch { return []; }
    });
    const [tsInput, setTsInput] = useState('');
    const [tsLoading, setTsLoading] = useState(false);

    /* ── persist chat & timestamps to localStorage ── */
    useEffect(() => { try { localStorage.setItem(`sr-ai-msgs-${id}`, JSON.stringify(aiMessages)); } catch {} }, [aiMessages, id]);
    useEffect(() => { try { localStorage.setItem(`sr-ai-hist-${id}`, JSON.stringify(aiHistory)); } catch {} }, [aiHistory, id]);
    useEffect(() => { try { localStorage.setItem(`sr-ts-msgs-${id}`, JSON.stringify(tsMessages)); } catch {} }, [tsMessages, id]);

    /* ── fetch video on mount ── */
    useEffect(() => {
        videoAPI.getVideo(id).then(res => {
            setVideo(res.data);
            setVideoError(null);
        }).catch(err => {
            console.error('Failed to load video:', err);
            setVideoError('Failed to load video');
        });
    }, [id]);

    /* ── auto-scroll chat ── */
    useEffect(() => {
        msgsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [aiMessages, aiLoading]);

    /* ── controls ── */
    const togglePlay = () => {
        const video = videoRef.current;
        if (!video) return;
        if (video.paused) {
            video.play().catch(() => { });
            setIsPlaying(true);
        } else {
            video.pause();
            setIsPlaying(false);
        }
    };
    const skipBack = () => {
        const video = videoRef.current;
        if (!video) return;
        video.currentTime = Math.max(0, video.currentTime - 10);
        setCurrentTime(video.currentTime);
    };
    const skipForward = () => {
        const video = videoRef.current;
        if (!video) return;
        video.currentTime = Math.min(video.duration || 0, video.currentTime + 10);
        setCurrentTime(video.currentTime);
    };
    const seekTo = (sec) => {
        const video = videoRef.current;
        if (!video) return;
        video.currentTime = sec;
        setCurrentTime(sec);
    };
    const handleProgressClick = (e) => {
        const video = videoRef.current;
        const bar = progressRef.current;
        if (!video || !bar || !video.duration) return;
        const rect = bar.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const pct = Math.max(0, Math.min(1, clickX / rect.width));
        const newTime = pct * video.duration;
        video.currentTime = newTime;
        setCurrentTime(newTime);
    };
    const handleProgressMouseDown = (e) => {
        isSeekingRef.current = true;
        handleProgressClick(e);

        const onMouseMove = (e) => {
            handleProgressClick(e);
        };
        const onMouseUp = () => {
            isSeekingRef.current = false;
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
    };
    const cycleSpeed = () => {
        const speeds = [0.5, 0.75, 1, 1.25, 1.5, 2];
        const next = speeds[(speeds.indexOf(playbackRate) + 1) % speeds.length];
        setPlaybackRate(next);
        if (videoRef.current) videoRef.current.playbackRate = next;
    };
    const handleVol = (e) => {
        const v = parseFloat(e.target.value);
        setVolume(v);
        setMuted(v === 0);
        if (videoRef.current) { videoRef.current.volume = v; videoRef.current.muted = v === 0; }
    };
    const toggleMute = () => {
        const video = videoRef.current;
        if (!video) return;
        video.muted = !video.muted;
        setMuted(video.muted);
        setVolume(video.muted ? 0 : 1);
    };
    const goFullscreen = () => {
        const v = videoRef.current;
        if (!v) return;
        if (v.requestFullscreen) v.requestFullscreen();
        else if (v.webkitRequestFullscreen) v.webkitRequestFullscreen();
    };

    const videoSrc = useMemo(() => {
        if (!video?.file) return '';
        return video.file.startsWith('http')
            ? video.file
            : `http://localhost:8000${video.file}`;
    }, [video?.file]);

    /* ── export PDF in new tab ── */
    const handleExportPDF = async () => {
        try {
            const res = await videoAPI.getPDF(id);
            const fileUrl = res?.data?.file;
            if (!fileUrl) { alert('PDF not available yet.'); return; }
            const fullUrl = fileUrl.startsWith('http')
                ? fileUrl
                : `http://localhost:8000${fileUrl}`;
            window.open(fullUrl, '_blank', 'noopener,noreferrer');
        } catch (err) {
            alert('Could not open PDF. Please try again.');
        }
    };

    /* ── send AI question ── */
    const handleAiSend = async () => {
        if (!aiInput.trim() || aiLoading) return;
        const message = aiInput.trim();
        setAiInput('');
        setAiMessages(prev => [...prev, { role: 'user', content: message }]);
        setAiLoading(true);
        try {
            const res = await videoAPI.aiChat(id, message, aiHistory);
            const reply = res.data.reply;
            setAiMessages(prev => [...prev, { role: 'assistant', content: reply }]);
            setAiHistory(prev => [...prev,
            { role: 'user', content: message },
            { role: 'assistant', content: reply }
            ]);
        } catch (e) {
            setAiMessages(prev => [...prev, { role: 'assistant', content: 'Error. Please try again.' }]);
        } finally {
            setAiLoading(false);
        }
    };

    const handleTsSend = async () => {
        if (!tsInput.trim() || tsLoading) return;
        const question = tsInput.trim();
        setTsInput('');
        setTsLoading(true);
        try {
            const res = await videoAPI.queryVideo(id, question);
            const { timestamp_start, timestamp_end, youtube_url } = res.data;
            setTsMessages(prev => [...prev, {
                question,
                timestamp_start,
                timestamp_end,
                youtube_url: youtube_url || ''
            }]);
            if (timestamp_start != null && videoRef.current) {
                const tsFloat = parseFloat(timestamp_start);
                if (!isNaN(tsFloat)) {
                    // Wait for any pending seeks to settle, then seek
                    const v = videoRef.current;
                    v.currentTime = tsFloat;
                    setCurrentTime(tsFloat);
                    // If the video hasn't loaded enough, wait for it
                    if (v.readyState < 2) {
                        const onCanPlay = () => {
                            v.currentTime = tsFloat;
                            setCurrentTime(tsFloat);
                            v.removeEventListener('canplay', onCanPlay);
                        };
                        v.addEventListener('canplay', onCanPlay);
                    }
                }
            }
        } catch (e) {
            setTsMessages(prev => [...prev, { question, timestamp_start: null, timestamp_end: null, youtube_url: '' }]);
        } finally {
            setTsLoading(false);
        }
    };

    const getYouTubeUrl = (youtubeUrl, seconds) => {
        if (!youtubeUrl || seconds == null) return null;
        const s = Math.floor(seconds);
        try {
            if (youtubeUrl.includes('youtu.be/')) {
                const vid = youtubeUrl.split('youtu.be/')[1].split(/[?&#]/)[0];
                return `https://www.youtube.com/watch?v=${vid}&t=${s}s`;
            }
            const url = new URL(youtubeUrl);
            const vid = url.searchParams.get('v');
            if (vid) return `https://www.youtube.com/watch?v=${vid}&t=${s}s`;
        } catch (e) { }
        return null;
    };

    /* ── progress % ── */
    const pctPlayed = duration > 0 ? (currentTime / duration) * 100 : 0;
    const pctBuf = duration > 0 ? (buffered / duration) * 100 : 0;

    /* ═══════════════════ RENDER ═══════════════════ */
    return (
        <>
            <style>{STYLES}</style>
            <div className={`study-room-root ${isDark ? 'dark' : 'light'}`}>

                {/* TOP BAR — full width, fixed height */}
                <div className="topbar">
                    <button className="sr-back" onClick={() => navigate('/dashboard')} title="Back">
                        <ArrowLeft size={16} />
                    </button>
                    <div className="sr-logo"><div className="sr-logo-icon">▶</div><span className="sr-logo-t">Video<em>Mind</em></span></div>
                    <div className="sr-sep" />
                    <nav className="sr-bc">
                        <span className="sr-bc-link" onClick={() => navigate('/dashboard')}>Dashboard</span>
                        <span className="sr-bc-dot">›</span>
                        <span className="sr-bc-link">Study Room</span>
                        <span className="sr-bc-dot">›</span>
                        <span className="sr-bc-cur">{video?.title || 'Loading…'}</span>
                    </nav>
                    <div className="sr-top-r">
                        <span className="sr-badge-g"><span className="sr-dot-g" />Processed</span>
                        <button className="sr-theme-btn" onClick={toggleTheme} title="Toggle theme">
                            {isDark ? '☀️' : '🌙'}
                        </button>
                        <button className="sr-pdf-btn" onClick={handleExportPDF}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14,2 14,8 20,8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>
                            Export PDF
                        </button>
                    </div>
                </div>

                {/* MAIN BODY — fills remaining height, horizontal flex */}
                <div className="main">

                    {/* LEFT SIDE — 60% width, video player */}
                    <div className="video-side">
                        <div className="video-area">
                            <div className="sr-va-bg" />
                            <div className="sr-va-grid" />
                            <div className="sr-va-vig" />

                            {videoSrc ? (
                                <video
                                    ref={videoRef}
                                    className={`sr-video-el${videoReady ? ' ready' : ''}`}
                                    src={videoSrc}
                                    preload="metadata"
                                    onClick={togglePlay}
                                    onTimeUpdate={() => {
                                        if (!isSeekingRef.current && videoRef.current) {
                                            setCurrentTime(videoRef.current.currentTime);
                                        }
                                    }}
                                    onDurationChange={() => setDuration(videoRef.current?.duration || 0)}
                                    onPlay={() => setIsPlaying(true)}
                                    onPause={() => setIsPlaying(false)}
                                    onEnded={() => setIsPlaying(false)}
                                    onLoadedMetadata={() => {
                                        setDuration(videoRef.current?.duration || 0);
                                        setVideoReady(true);
                                    }}
                                    onProgress={() => {
                                        if (videoRef.current && videoRef.current.buffered.length > 0) {
                                            setBuffered(videoRef.current.buffered.end(videoRef.current.buffered.length - 1));
                                        }
                                    }}
                                    onError={() => setVideoError('Video failed to load')}
                                />
                            ) : (
                                <div className="sr-play-ph">
                                    <div className="sr-play-outer"><div className="sr-play-inner"><div className="sr-play-tri" /></div></div>
                                </div>
                            )}

                            {videoSrc && videoReady && !isPlaying && (
                                <div className="sr-play-overlay" onClick={togglePlay}>
                                    <Play size={36} fill="rgba(123,123,255,0.9)" stroke="none" />
                                </div>
                            )}

                            <div className="sr-file-chip">
                                <span className="sr-file-dot" />
                                {video?.title || 'Loading…'}
                            </div>
                        </div>

                        <div className="ts-strip" ref={chipsRef}>
                            {tsMessages.filter(m => m.timestamp_start != null).length === 0 ? (
                                <span className="sr-chip-hint">Timestamps will appear here as you ask to find timestamps</span>
                            ) : tsMessages.filter(m => m.timestamp_start != null).map((m, i) => {
                                const isActive = currentTime >= m.timestamp_start && currentTime < m.timestamp_start + 30;
                                return (
                                    <button
                                        key={i}
                                        className={`sr-chip${isActive ? ' on' : ''}`}
                                        onClick={() => seekTo(m.timestamp_start)}
                                    >
                                        {fmt(m.timestamp_start)} · {m.question.length > 40 ? m.question.slice(0, 37) + '…' : m.question}
                                    </button>
                                )
                            })}
                        </div>

                        <div className="controls">
                            <button className="sr-cb" onClick={skipBack} title="Back 10s"><SkipBack size={14} /></button>
                            <button className="sr-cb play" onClick={togglePlay} title={isPlaying ? 'Pause' : 'Play'}>
                                {isPlaying ? <Pause size={14} /> : <Play size={14} fill="#fff" stroke="none" />}
                            </button>
                            <button className="sr-cb" onClick={skipForward} title="Forward 10s"><SkipForward size={14} /></button>

                            <div
                                ref={progressRef}
                                onClick={handleProgressClick}
                                onMouseDown={handleProgressMouseDown}
                                style={{
                                    flex: 1,
                                    height: '20px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    cursor: 'pointer',
                                    padding: '0 4px',
                                }}
                            >
                                <div style={{
                                    width: '100%',
                                    height: '4px',
                                    background: 'var(--border2)',
                                    borderRadius: '4px',
                                    position: 'relative',
                                }}>
                                    <div style={{
                                        position: 'absolute',
                                        left: 0,
                                        top: 0,
                                        height: '100%',
                                        width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%`,
                                        background: 'linear-gradient(90deg, var(--violet), var(--violet2))',
                                        borderRadius: '4px',
                                        pointerEvents: 'none',
                                    }} />
                                    <div style={{
                                        position: 'absolute',
                                        top: '50%',
                                        left: `${duration > 0 ? (currentTime / duration) * 100 : 0}%`,
                                        transform: 'translate(-50%, -50%)',
                                        width: '12px',
                                        height: '12px',
                                        background: 'var(--violet)',
                                        borderRadius: '50%',
                                        boxShadow: '0 0 0 3px var(--vglow)',
                                        pointerEvents: 'none',
                                    }} />
                                </div>
                            </div>

                            <span className="sr-time">{fmt(currentTime)} / {fmt(duration)}</span>

                            <div className="sr-vol">
                                <button className="sr-cb sm" onClick={toggleMute} title={muted ? 'Unmute' : 'Mute'}>
                                    {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                                </button>
                                <input type="range" className="sr-vol-slider" min="0" max="1" step="0.01" value={muted ? 0 : volume} onChange={handleVol} />
                            </div>

                            <button className="sr-speed" onClick={cycleSpeed}>{playbackRate}×</button>
                            <button className="sr-cb sm" onClick={goFullscreen} title="Fullscreen"><Maximize size={13} /></button>
                        </div>
                    </div>

                    {/* RIGHT SIDE — 40% width, tabs + panels */}
                    <div className="right-side">
                        <div className="tab-bar">
                            <div className={`tab ${activeTab === 'ai' ? 'tab-ai-active' : ''}`} onClick={() => setActiveTab('ai')}>
                                ✦ AI Assistant
                            </div>
                            <div className={`tab ${activeTab === 'ts' ? 'tab-ts-active' : ''}`} onClick={() => setActiveTab('ts')}>
                                ◷ Timestamps
                            </div>
                        </div>

                        {activeTab === 'ai' && (
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                                <div style={{ flex: 1, overflowY: 'auto', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                    {aiMessages.map((msg, i) => (
                                        <div key={i} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                                            <div style={{
                                                maxWidth: '80%',
                                                padding: '0.65rem 0.9rem',
                                                borderRadius: '10px',
                                                fontSize: '0.8rem',
                                                lineHeight: '1.6',
                                                background: msg.role === 'user' ? 'rgba(123,123,255,0.15)' : 'var(--surface2)',
                                                border: msg.role === 'user' ? '1px solid rgba(123,123,255,0.3)' : '1px solid var(--border)',
                                                color: 'var(--text)',
                                                whiteSpace: 'pre-wrap'
                                            }}>
                                                {msg.content}
                                            </div>
                                        </div>
                                    ))}
                                    {aiLoading && (
                                        <div style={{ display: 'flex' }}>
                                            <div style={{ padding: '0.65rem 0.9rem', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '10px' }}>
                                                <div className="typing"><span /><span /><span /></div>
                                            </div>
                                        </div>
                                    )}
                                    <div ref={msgsEndRef} />
                                </div>
                                <div style={{ padding: '0.75rem', borderTop: '1px solid var(--border)', display: 'flex', gap: '0.5rem' }}>
                                    <input
                                        style={{ flex: 1, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '8px', padding: '0.6rem 0.9rem', color: 'var(--text)', fontSize: '0.78rem', outline: 'none' }}
                                        value={aiInput}
                                        onChange={e => setAiInput(e.target.value)}
                                        onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleAiSend())}
                                        placeholder="Ask AI anything about this video..."
                                    />
                                    <button className="send-btn" onClick={handleAiSend}>↑</button>
                                </div>
                            </div>
                        )}

                        {activeTab === 'ts' && (
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                                <div style={{ flex: 1, overflowY: 'auto', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                    {tsMessages.length === 0 && (
                                        <div style={{ textAlign: 'center', color: 'var(--text3)', fontSize: '0.78rem', padding: '2rem 1rem' }}>
                                            <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>◷</div>
                                            Ask a question to find its timestamp in the video.
                                        </div>
                                    )}
                                    {tsMessages.map((item, i) => {
                                        const ytUrl = getYouTubeUrl(item.youtube_url, item.timestamp_start);
                                        return (
                                            <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                                {/* Question */}
                                                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                                    <div style={{ background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.25)', borderRadius: '8px', padding: '0.45rem 0.8rem', fontSize: '0.78rem', color: 'var(--text)', maxWidth: '80%' }}>
                                                        {item.question}
                                                    </div>
                                                </div>
                                                {/* Timestamp result */}
                                                <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                                                    {item.timestamp_start == null ? (
                                                        <div style={{ fontSize: '0.75rem', color: 'var(--text3)', padding: '0.5rem' }}>
                                                            No timestamp found.
                                                        </div>
                                                    ) : ytUrl ? (
                                                        <a href={ytUrl} target="_blank" rel="noopener noreferrer"
                                                            style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', padding: '0.55rem 0.9rem', background: 'rgba(17,17,20,0.95)', border: '1px solid rgba(123,123,255,0.3)', borderRadius: '8px', textDecoration: 'none', cursor: 'pointer' }}>
                                                            <div style={{ width: '32px', height: '32px', background: 'linear-gradient(135deg,var(--violet),var(--violet2))', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '0.65rem', flexShrink: 0 }}>▶</div>
                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.05rem' }}>
                                                                <div style={{ fontSize: '0.52rem', fontWeight: 700, color: 'var(--text3)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>WATCH ON YOUTUBE</div>
                                                                <div style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--violet2)' }}>
                                                                    {fmt(item.timestamp_start)}{item.timestamp_end != null ? ` – ${fmt(item.timestamp_end)}` : ''}
                                                                </div>
                                                                <div style={{ fontSize: '0.58rem', color: 'var(--text3)' }}>Click to open ↗</div>
                                                            </div>
                                                        </a>
                                                    ) : (
                                                        <button onClick={() => seekTo(item.timestamp_start)}
                                                            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.9rem', background: 'rgba(123,123,255,0.1)', border: '1px solid rgba(123,123,255,0.3)', borderRadius: '8px', color: 'var(--violet2)', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}>
                                                            ▶ Seek to {fmt(item.timestamp_start)}
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                    {tsLoading && (
                                        <div style={{ padding: '0.5rem' }}>
                                            <div className="typing"><span /><span /><span /></div>
                                        </div>
                                    )}
                                </div>
                                <div style={{ padding: '0.75rem', borderTop: '1px solid var(--border)', display: 'flex', gap: '0.5rem' }}>
                                    <input
                                        style={{ flex: 1, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '8px', padding: '0.6rem 0.9rem', color: 'var(--text)', fontSize: '0.78rem', outline: 'none' }}
                                        value={tsInput}
                                        onChange={e => setTsInput(e.target.value)}
                                        onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleTsSend())}
                                        placeholder="Ask to find a timestamp..."
                                    />
                                    <button className="send-btn" onClick={handleTsSend}>↑</button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
};

/* ═══════════════════════════════════════════════════════════════
   STYLES — embedded, all prefixed with .sr
   ═══════════════════════════════════════════════════════════════ */
const STYLES = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
/* reset scoped */
.study-room-root,.study-room-root *{margin:0;padding:0;box-sizing:border-box}
.study-room-root{--bg:#111114;--surface:#13131a;--surface2:#1a1a24;--surface3:#1e1e28;--border:rgba(255,255,255,.05);--border2:rgba(255,255,255,.1);--violet:#7b7bff;--violet2:#a0a0ff;--vglow:rgba(123,123,255,.15);--amber:#ffaa33;--emerald:#00ffcc;--text:#e8e8f0;--text2:#b0b0c8;--text3:#8888a8;
background:var(--bg);color:var(--text);font-family:'Inter',system-ui,sans-serif;height:100vh;display:flex;flex-direction:column;overflow:hidden;-webkit-font-smoothing:antialiased}

.study-room-root ::-webkit-scrollbar{width:4px;height:4px}
.study-room-root ::-webkit-scrollbar-track{background:transparent}
.study-room-root ::-webkit-scrollbar-thumb{background:rgba(255,255,255,.08);border-radius:4px}

/* ─── TOP BAR ─── */
.sr-top{height:54px;background:rgba(13,13,20,.95);border-bottom:1px solid var(--border);display:flex;align-items:center;padding:0 1.25rem;gap:.85rem;flex-shrink:0;backdrop-filter:blur(20px);position:relative;z-index:10}
.sr-top::after{content:'';position:absolute;bottom:0;left:0;right:0;height:1px;background:linear-gradient(90deg,transparent,rgba(123,123,255,.4),transparent)}

.sr-back{width:32px;height:32px;border:1px solid var(--border);border-radius:7px;background:var(--surface);display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--text3);transition:.2s}
.sr-back:hover{border-color:var(--border2);color:var(--text);background:var(--surface2)}

.sr-logo{display:flex;align-items:center;gap:.5rem}
.sr-logo-icon{width:28px;height:28px;background:linear-gradient(135deg,var(--violet),var(--violet2));border-radius:7px;display:flex;align-items:center;justify-content:center;font-size:.75rem;color:#fff;box-shadow:0 0 16px rgba(123,123,255,.4)}
.sr-logo-t{font-size:.9rem;font-weight:700;color:var(--text);letter-spacing:-.02em}
.sr-logo-t em{font-style:normal;color:var(--violet2)}

.sr-sep{width:1px;height:20px;background:var(--border);flex-shrink:0}

.sr-bc{display:flex;align-items:center;gap:.45rem;font-size:.76rem}
.sr-bc-link{color:var(--text3);cursor:pointer;transition:.2s}.sr-bc-link:hover{color:var(--text2)}
.sr-bc-dot{color:var(--text3);font-size:.7rem}
.sr-bc-cur{color:var(--text2);font-weight:500;max-width:240px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}

.sr-top-r{margin-left:auto;display:flex;align-items:center;gap:.7rem}
.sr-badge-g{display:inline-flex;align-items:center;gap:.35rem;padding:.25rem .7rem;border-radius:6px;font-size:.68rem;font-weight:500;background:rgba(52,211,153,.08);border:1px solid rgba(52,211,153,.2);color:var(--emerald)}
.sr-dot-g{width:5px;height:5px;border-radius:50%;background:var(--emerald);animation:sr-blink 2s ease infinite}
@keyframes sr-blink{0%,100%{opacity:1}50%{opacity:.3}}

.sr-pdf-btn{display:flex;align-items:center;gap:.45rem;padding:.38rem .9rem;background:linear-gradient(135deg,var(--violet),var(--violet2));color:#fff;font-size:.72rem;font-weight:600;border:none;border-radius:8px;cursor:pointer;transition:.25s;box-shadow:0 0 20px rgba(123,123,255,.3),inset 0 1px 0 rgba(255,255,255,.15)}
.sr-pdf-btn:hover{transform:translateY(-1px);box-shadow:0 4px 24px rgba(123,123,255,.45)}

/* ─── MAIN ─── */
.sr-main{flex:1;display:flex;overflow:hidden}

/* ─── VIDEO SIDE ─── */
.sr-vid-side{width:60%;display:flex;flex-direction:column;border-right:1px solid var(--border)}

.sr-vid-area{flex:1;background:#08080e;position:relative;overflow:hidden;display:flex;align-items:center;justify-content:center}
.sr-va-bg{position:absolute;inset:0;background:radial-gradient(ellipse 80% 60% at 50% 50%,rgba(123,123,255,.04),transparent 70%)}
.sr-va-grid{position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,.015) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.015) 1px,transparent 1px);background-size:40px 40px;mask-image:radial-gradient(ellipse 70% 70% at 50% 50%,black,transparent)}
.sr-va-vig{position:absolute;inset:0;background:radial-gradient(ellipse at center,transparent 35%,rgba(8,8,14,.85) 100%);pointer-events:none}

.sr-video-el{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;z-index:1;opacity:0;transition:opacity .5s ease}
.sr-video-el.ready{opacity:1}

/* play placeholder */
.sr-play-ph{z-index:2;display:flex;align-items:center;justify-content:center}
.sr-play-outer{width:90px;height:90px;border:1px solid rgba(123,123,255,.2);border-radius:50%;display:flex;align-items:center;justify-content:center;position:relative}
.sr-play-outer::before{content:'';position:absolute;inset:-8px;border:1px solid rgba(123,123,255,.08);border-radius:50%;animation:sr-orb 4s linear infinite}
@keyframes sr-orb{from{transform:rotate(0)}to{transform:rotate(360deg)}}
.sr-play-inner{width:68px;height:68px;background:linear-gradient(135deg,rgba(123,123,255,.2),rgba(0,255,204,.1));border:1px solid rgba(123,123,255,.35);border-radius:50%;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(10px)}
.sr-play-tri{border-left:22px solid rgba(123,123,255,.9);border-top:13px solid transparent;border-bottom:13px solid transparent;margin-left:5px}

/* play overlay button */
.sr-play-overlay{position:absolute;inset:0;z-index:2;display:flex;align-items:center;justify-content:center;cursor:pointer;background:rgba(0,0,0,.15);transition:background .2s}
.sr-play-overlay:hover{background:rgba(0,0,0,.25)}

/* file chip */
.sr-file-chip{position:absolute;bottom:12px;left:50%;transform:translateX(-50%);z-index:3;display:flex;align-items:center;gap:.4rem;padding:.35rem .8rem;background:rgba(0,0,0,.55);border:1px solid var(--border);border-radius:20px;font-size:.68rem;color:var(--text3);backdrop-filter:blur(12px)}
.sr-file-dot{width:6px;height:6px;background:var(--violet);border-radius:50%;box-shadow:0 0 6px var(--violet)}

/* ─── CHIPS STRIP ─── */
.sr-chips{height:38px;background:var(--surface);border-top:1px solid var(--border);display:flex;align-items:center;padding:0 1rem;gap:.4rem;overflow-x:auto;flex-shrink:0}
.sr-chip-hint{font-size:.62rem;color:var(--text3);white-space:nowrap;font-style:italic}
.sr-chip{padding:.2rem .6rem;border:1px solid var(--border);border-radius:5px;font-size:.62rem;color:var(--text3);white-space:nowrap;cursor:pointer;transition:.2s;font-weight:500;flex-shrink:0;background:transparent}
.sr-chip:hover{border-color:rgba(123,123,255,.4);color:var(--violet2);background:var(--vglow)}
.sr-chip.on{border-color:rgba(123,123,255,.5);color:var(--violet2);background:var(--vglow);box-shadow:0 0 8px rgba(123,123,255,.2)}

/* ─── CONTROLS ─── */
.sr-ctrl{height:58px;background:var(--surface);border-top:1px solid var(--border);display:flex;align-items:center;padding:0 1rem;gap:.6rem;flex-shrink:0}
.sr-cb{width:32px;height:32px;border:1px solid var(--border);border-radius:7px;background:transparent;color:var(--text3);cursor:pointer;display:flex;align-items:center;justify-content:center;transition:.2s;flex-shrink:0}
.sr-cb:hover{border-color:var(--border2);color:var(--text);background:var(--surface2)}
.sr-cb.play{background:var(--violet);border-color:transparent;color:#fff;box-shadow:0 0 14px rgba(123,123,255,.4)}
.sr-cb.play:hover{box-shadow:0 0 22px rgba(123,123,255,.6)}
.sr-cb.sm{width:28px;height:28px;border:none;background:transparent}

/* progress */
.sr-prog{flex:1;height:36px;display:flex;align-items:center;cursor:pointer;position:relative}
.sr-prog-track{width:100%;height:3px;background:rgba(255,255,255,.07);border-radius:4px;position:relative}
.sr-prog-buf{height:100%;background:rgba(255,255,255,.05);border-radius:4px;position:absolute;top:0;left:0;transition:width .3s}
.sr-prog-fill{height:100%;background:linear-gradient(90deg,var(--violet),var(--violet2));border-radius:4px;position:absolute;top:0;left:0}
.sr-prog-thumb{position:absolute;top:50%;transform:translate(-50%,-50%);width:11px;height:11px;background:#fff;border-radius:50%;box-shadow:0 0 0 3px rgba(123,123,255,.4);transition:transform .1s;opacity:0}
.sr-prog:hover .sr-prog-thumb{opacity:1;transform:translate(-50%,-50%) scale(1.15)}

.sr-time{font-size:.64rem;color:var(--text3);font-weight:500;white-space:nowrap;font-variant-numeric:tabular-nums;flex-shrink:0}

.sr-vol{display:flex;align-items:center;gap:.3rem}
.sr-vol-slider{width:52px;height:3px;-webkit-appearance:none;appearance:none;background:rgba(255,255,255,.1);border-radius:4px;outline:none;cursor:pointer}
.sr-vol-slider::-webkit-slider-thumb{-webkit-appearance:none;width:10px;height:10px;border-radius:50%;background:rgba(255,255,255,.6);cursor:pointer}

.sr-speed{padding:.2rem .5rem;border:1px solid var(--border);border-radius:5px;font-size:.62rem;color:var(--text3);background:transparent;cursor:pointer;transition:.2s;flex-shrink:0}
.sr-speed:hover{border-color:var(--border2);color:var(--text)}

/* ─── RIGHT SIDE ─── */
.sr-right{width:40%;display:flex;flex-direction:column;background:var(--surface);overflow:hidden;height:100%}

/* tab bar */
.sr-tab-bar{height:50px;display:flex;flex-direction:row;align-items:center;padding:0 1rem;gap:.5rem;border-bottom:1px solid var(--border);flex-shrink:0}
.sr-tab{flex:1;height:34px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:.72rem;font-weight:500;cursor:pointer;border:1px solid transparent;color:var(--text3);transition:all .2s;gap:.3rem}
.sr-tab:hover{color:var(--text2);background:rgba(255,255,255,.03)}
.sr-tab-ai-on{background:rgba(123,123,255,.1);border-color:rgba(123,123,255,.25);color:var(--violet2)}
.sr-tab-ts-on{background:rgba(251,191,36,.08);border-color:rgba(251,191,36,.2);color:var(--amber)}

/* ─── AI PANEL ─── */
.sr-ai{flex:1;display:flex;flex-direction:column;overflow:hidden}
.sr-msgs{flex:1;overflow-y:auto;padding:1.1rem;display:flex;flex-direction:column;gap:.85rem}

.sr-row{display:flex;gap:.6rem;align-items:flex-start}
.sr-row.u{flex-direction:row-reverse}
.sr-ava{width:28px;height:28px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:.62rem;font-weight:700;flex-shrink:0}
.sr-ava.ai{background:linear-gradient(135deg,rgba(123,123,255,.25),rgba(0,255,204,.15));border:1px solid rgba(123,123,255,.3);color:var(--violet2)}
.sr-ava.u{background:rgba(255,255,255,.06);border:1px solid var(--border2);color:var(--text2)}

.sr-bub{padding:.65rem .85rem;border-radius:10px;font-size:.77rem;line-height:1.65;max-width:88%}
.sr-bub.ai{background:var(--surface2);border:1px solid var(--border);color:var(--text2)}
.sr-bub.u{background:rgba(123,123,255,.1);border:1px solid rgba(123,123,255,.2);color:var(--text)}
.sr-bub-n{font-size:.6rem;font-weight:600;margin-bottom:.3rem;letter-spacing:.01em}
.sr-bub.ai .sr-bub-n{color:var(--violet2)}
.sr-bub.u .sr-bub-n{color:var(--text3);text-align:right}
.sr-bub-t{white-space:pre-wrap;word-break:break-word}

.sr-ts-badge{display:inline-flex;align-items:center;gap:.25rem;background:rgba(251,191,36,.08);border:1px solid rgba(251,191,36,.2);color:var(--amber);font-size:.64rem;font-weight:600;padding:.15rem .48rem;border-radius:4px;cursor:pointer;margin-top:.4rem;transition:.2s}
.sr-ts-badge:hover{background:rgba(251,191,36,.14);box-shadow:0 0 10px rgba(251,191,36,.15)}
.sr-ts-dot{width:4px;height:4px;background:var(--amber);border-radius:50%}

/* typing */
.sr-typing{display:flex;align-items:center;gap:.3rem;padding:.6rem .85rem}
.sr-typing span{width:6px;height:6px;background:var(--text3);border-radius:50%;animation:sr-ty .9s ease infinite}
.sr-typing span:nth-child(2){animation-delay:.15s}
.sr-typing span:nth-child(3){animation-delay:.3s}
@keyframes sr-ty{0%,60%,100%{transform:translateY(0);opacity:.4}30%{transform:translateY(-5px);opacity:1}}

/* input */
.sr-in-bar{padding:.8rem .9rem;border-top:1px solid var(--border);background:var(--surface);display:flex;align-items:center;gap:.55rem;flex-shrink:0}
.sr-in{flex:1;background:var(--surface2);border:1px solid var(--border);border-radius:9px;padding:.55rem .85rem;color:var(--text);font-family:inherit;font-size:.77rem;outline:none;transition:.2s}
.sr-in:focus{border-color:rgba(123,123,255,.4);box-shadow:0 0 0 3px rgba(123,123,255,.08)}
.sr-in::placeholder{color:var(--text3)}
.sr-send{width:34px;height:34px;background:linear-gradient(135deg,var(--violet),var(--violet2));border:none;border-radius:8px;color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 0 14px rgba(123,123,255,.3);transition:.2s;flex-shrink:0;font-size:.85rem}
.sr-send:hover{transform:translateY(-1px);box-shadow:0 4px 20px rgba(123,123,255,.45)}
.sr-send:disabled{opacity:.5;cursor:not-allowed;transform:none}

/* ─── TIMESTAMPS PANEL ─── */
.sr-ts-panel{flex:1;display:flex;flex-direction:column;overflow:hidden}
.sr-ts-head{padding:.8rem .9rem;background:var(--surface);border-bottom:1px solid var(--border);flex-shrink:0}
.sr-ts-search{width:100%;background:var(--surface2);border:1px solid var(--border);border-radius:9px;padding:.55rem .85rem;color:var(--text);font-family:inherit;font-size:.77rem;outline:none;transition:.2s}
.sr-ts-search:focus{border-color:rgba(251,191,36,.35);box-shadow:0 0 0 3px rgba(251,191,36,.06)}
.sr-ts-search::placeholder{color:var(--text3)}
.sr-ts-list{flex:1;overflow-y:auto;padding:.7rem}
.sr-ts-empty{text-align:center;color:var(--text3);font-size:.78rem;padding:3rem 1rem;font-style:italic}
.sr-ts-card{display:flex;align-items:center;gap:.7rem;padding:.7rem .8rem;border-radius:9px;cursor:pointer;border:1px solid transparent;transition:.22s;margin-bottom:.3rem}
.sr-ts-card:hover{background:var(--surface2);border-color:var(--border)}
.sr-ts-card.now{background:rgba(251,191,36,.05);border-color:rgba(251,191,36,.2)}
.sr-ts-t{flex-shrink:0;padding:.24rem .5rem;background:var(--surface2);border:1px solid var(--border);border-radius:5px;font-size:.62rem;color:var(--text3);font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap}
.sr-ts-card.now .sr-ts-t{background:rgba(251,191,36,.1);border-color:rgba(251,191,36,.3);color:var(--amber)}
.sr-ts-title{font-size:.77rem;font-weight:500;color:var(--text);line-height:1.3}

/* ─── THEME TOGGLE BUTTON ─── */
.sr-theme-btn{width:32px;height:32px;border:1px solid var(--border);border-radius:7px;background:var(--surface);cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:.85rem;transition:all .2s}
.sr-theme-btn:hover{border-color:var(--border2);background:var(--surface2);transform:scale(1.05)}

/* ─── LIGHT MODE OVERRIDES ─── */
.study-room-root.light {--bg:#f8fafc;--surface:#ffffff;--surface2:#f1f5f9;--surface3:#e2e8f0;--border:rgba(30,37,48,.07);--border2:rgba(30,37,48,.14);--text:#1e2530;--text2:#475569;--text3:#64748b;--violet:#2563eb;--violet2:#3b82f6;--vglow:rgba(37,99,235,.12);--amber:#d97706;--emerald:#2563eb}

.study-room-root.light .video-area{background:#e2e8f0}
.study-room-root.light .sr-va-bg{background:radial-gradient(ellipse 80% 60% at 50% 50%,rgba(37,99,235,.06),transparent 70%)}
.study-room-root.light .sr-va-grid{background-image:linear-gradient(rgba(0,0,0,.03) 1px,transparent 1px),linear-gradient(90deg,rgba(0,0,0,.03) 1px,transparent 1px)}
.study-room-root.light .sr-va-vig{background:radial-gradient(ellipse at center,transparent 40%,rgba(226,232,240,.6) 100%)}
.study-room-root.light .sr-play-overlay{background:rgba(255,255,255,.15)}
.study-room-root.light .sr-play-overlay:hover{background:rgba(255,255,255,.25)}
.study-room-root.light .sr-play-outer{border-color:rgba(37,99,235,.2)}
.study-room-root.light .sr-play-outer::before{border-color:rgba(37,99,235,.1)}
.study-room-root.light .sr-play-inner{background:linear-gradient(135deg,rgba(37,99,235,.15),rgba(37,99,235,.08));border-color:rgba(37,99,235,.25)}
.study-room-root.light .sr-play-tri{border-left-color:rgba(37,99,235,.8)}
.study-room-root.light .sr-file-chip{background:rgba(255,255,255,.85);color:#475569;border-color:rgba(30,37,48,.1)}
.study-room-root.light .sr-file-dot{background:#2563eb;box-shadow:0 0 6px rgba(37,99,235,.4)}
.study-room-root.light .controls{background:#ffffff;border-top:1px solid rgba(30,37,48,.07)}
.study-room-root.light .sr-cb{color:#64748b;border-color:rgba(30,37,48,.1)}
.study-room-root.light .sr-cb:hover{color:#1e2530;background:#f1f5f9;border-color:rgba(30,37,48,.15)}
.study-room-root.light .sr-cb.play{background:#2563eb;color:#fff;border-color:transparent}
.study-room-root.light .sr-time{color:#64748b}
.study-room-root.light .sr-speed{color:#64748b;border-color:rgba(30,37,48,.1)}
.study-room-root.light .sr-speed:hover{color:#1e2530;border-color:rgba(30,37,48,.2)}
.study-room-root.light .sr-vol-slider{background:rgba(30,37,48,.1)}
.study-room-root.light .sr-vol-slider::-webkit-slider-thumb{background:rgba(30,37,48,.5)}
.study-room-root.light .sr-chip{color:#64748b;border-color:rgba(30,37,48,.1)}
.study-room-root.light .sr-chip:hover{border-color:rgba(37,99,235,.3);color:#2563eb;background:rgba(37,99,235,.06)}
.study-room-root.light .sr-chip.on{border-color:rgba(37,99,235,.4);color:#2563eb;background:rgba(37,99,235,.08)}
.study-room-root.light .sr-chip-hint{color:#94a3b8}
.study-room-root.light .topbar{background:rgba(255,255,255,.97);border-bottom:1px solid rgba(30,37,48,.07)}
.study-room-root.light .topbar::after{background:linear-gradient(90deg,transparent,rgba(37,99,235,.15),transparent)}
.study-room-root.light .sr-back{background:#f1f5f9;border-color:rgba(30,37,48,.1);color:#64748b}
.study-room-root.light .sr-back:hover{background:#e2e8f0;color:#1e2530}
.study-room-root.light .sr-bc-link{color:#64748b}
.study-room-root.light .sr-bc-link:hover{color:#1e2530}
.study-room-root.light .sr-bc-dot{color:#94a3b8}
.study-room-root.light .sr-bc-cur{color:#1e2530}
.study-room-root.light .sr-logo-t{color:#1e2530}
.study-room-root.light .sr-sep{background:rgba(30,37,48,.1)}
.study-room-root.light .sr-badge-g{background:rgba(37,99,235,.06);border-color:rgba(37,99,235,.15);color:#2563eb}
.study-room-root.light .sr-dot-g{background:#2563eb}
.study-room-root.light .sr-bub.ai{background:#f1f5f9;border-color:rgba(30,37,48,.07);color:#475569}
.study-room-root.light .sr-bub.u{background:rgba(37,99,235,.1);border-color:rgba(37,99,235,.2);color:#1e2530}
.study-room-root.light .sr-in,.study-room-root.light .sr-ts-search{background:#f1f5f9;border-color:rgba(30,37,48,.1);color:#1e2530}
.study-room-root.light .sr-ts-card:hover{background:#f1f5f9}
.study-room-root.light .sr-ts-t{background:#e2e8f0;color:#475569}
.study-room-root.light .ts-strip{background:#ffffff}

/* =========================================================================
   NEW CRITICAL LAYOUT CSS (Provided by User)
   ========================================================================= */
.study-room-root { height: 100vh; display: flex; flex-direction: column; overflow: hidden; font-family: 'Inter', sans-serif; background: var(--bg); color: var(--text); }
.topbar { height: 54px; flex-shrink: 0; display: flex; align-items: center; padding: 0 1.5rem; gap: 1rem; background: rgba(13,13,20,0.95); border-bottom: 1px solid var(--border); z-index: 10; }
.main { flex: 1; display: flex; flex-direction: row; overflow: hidden; min-height: 0; }
.video-side { width: 60%; flex-shrink: 0; display: flex; flex-direction: column; border-right: 1px solid var(--border); overflow: hidden; }
.video-area { flex: 1; background: #08080e; position: relative; overflow: hidden; display: flex; align-items: center; justify-content: center; min-height: 0; }
.video-area video { width: 100%; height: 100%; object-fit: contain; display: block; }
.ts-strip { height: 38px; flex-shrink: 0; background: var(--surface); border-top: 1px solid var(--border); display: flex; align-items: center; padding: 0 1rem; gap: 0.4rem; overflow-x: auto; }
.controls { height: 58px; flex-shrink: 0; background: var(--surface); border-top: 1px solid var(--border); display: flex; align-items: center; padding: 0 1.2rem; gap: 0.8rem; }
.right-side { flex: 1; display: flex; flex-direction: column; background: var(--surface); overflow: hidden; min-width: 0; }
.tab-bar { height: 50px; flex-shrink: 0; display: flex; flex-direction: row; align-items: center; padding: 0 1rem; gap: 0.5rem; border-bottom: 1px solid var(--border); }
.tab { flex: 1; height: 34px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 0.72rem; font-weight: 500; cursor: pointer; border: 1px solid transparent; color: var(--text3); transition: all 0.2s; }
.tab:hover { color: var(--text2); background: rgba(255,255,255,0.03); }
.tab-ai-active { background: rgba(123,123,255,0.1); border-color: rgba(123,123,255,0.25); color: var(--violet2); }
.tab-ts-active { background: rgba(251,191,36,0.08); border-color: rgba(251,191,36,0.2); color: var(--amber); }
.ai-panel { flex: 1; display: flex; flex-direction: column; overflow: hidden; min-height: 0; }
.msgs { flex: 1; overflow-y: auto; padding: 1rem; display: flex; flex-direction: column; gap: 0.8rem; min-height: 0; }
.input-bar { flex-shrink: 0; padding: 0.75rem 1rem; border-top: 1px solid var(--border); display: flex; gap: 0.5rem; align-items: center; background: var(--surface); }
.ts-panel { flex: 1; display: flex; flex-direction: column; overflow: hidden; min-height: 0; }
.ts-top { flex-shrink: 0; padding: 0.75rem 1rem; border-bottom: 1px solid var(--border); }
.ts-list { flex: 1; overflow-y: auto; padding: 0.5rem; }
.typing { display:flex; gap:4px; }
.typing span { width:6px; height:6px; background:var(--text3); border-radius:50%; animation:typingBounce 0.9s ease infinite; }
.typing span:nth-child(2) { animation-delay:0.15s; }
.typing span:nth-child(3) { animation-delay:0.3s; }
@keyframes typingBounce { 0%,60%,100%{transform:translateY(0);opacity:0.4} 30%{transform:translateY(-5px);opacity:1} }

/* send button (used in JSX) */
.send-btn{width:34px;height:34px;background:linear-gradient(135deg,var(--violet),var(--violet2));border:none;border-radius:8px;color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 0 14px rgba(123,123,255,.3);transition:.2s;flex-shrink:0;font-size:.85rem}
.send-btn:hover{transform:translateY(-1px);box-shadow:0 4px 20px rgba(123,123,255,.45)}
.send-btn:disabled{opacity:.5;cursor:not-allowed;transform:none}

/* light mode tab hover fix */
.study-room-root.light .tab:hover{color:var(--text2);background:rgba(37,99,235,.04)}
.study-room-root.light .tab-ai-active{background:rgba(37,99,235,.08);border-color:rgba(37,99,235,.2);color:var(--violet)}
.study-room-root.light .send-btn{box-shadow:0 0 14px rgba(37,99,235,.2)}
.study-room-root.light .send-btn:hover{box-shadow:0 4px 20px rgba(37,99,235,.35)}
`;

export default StudyRoom;

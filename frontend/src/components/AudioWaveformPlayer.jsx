import React, { useRef, useState, useEffect, useCallback } from 'react';

/**
 * AudioWaveformPlayer — Plays extracted audio with animated sound bars
 * Uses Web Audio API AnalyserNode for real-time frequency visualization
 * Renders DOM-based bars with smooth CSS transitions for a polished look
 */
const BAR_COUNT = 48;

// Pseudo-random seed per bar index (deterministic)
const idleSeed = (i) => {
    const s = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
    return s - Math.floor(s); // 0..1
};

const AudioWaveformPlayer = ({ videoId, duration }) => {
    const audioRef = useRef(null);
    const analyserRef = useRef(null);
    const sourceRef = useRef(null);
    const animFrameRef = useRef(null);
    const audioCtxRef = useRef(null);
    const barsContainerRef = useRef(null);

    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [totalDuration, setTotalDuration] = useState(duration || 0);
    const [isLoaded, setIsLoaded] = useState(false);
    const [error, setError] = useState(null);
    const [barHeights, setBarHeights] = useState(() => Array(BAR_COUNT).fill(0));
    const [volume, setVolume] = useState(1);

    const token = localStorage.getItem('token');
    const audioUrl = `http://localhost:8000/api/videos/${videoId}/audio/${token ? `?token=${token}` : ''}`;

    // Format seconds to mm:ss
    const fmt = (s) => {
        if (!s || isNaN(s)) return '0:00';
        const m = Math.floor(s / 60);
        const sec = Math.floor(s % 60);
        return `${m}:${sec.toString().padStart(2, '0')}`;
    };

    // Set up Web Audio API context and analyser
    const ensureAudioContext = useCallback(() => {
        if (audioCtxRef.current) return;
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.78;

        const source = ctx.createMediaElementSource(audioRef.current);
        source.connect(analyser);
        analyser.connect(ctx.destination);

        audioCtxRef.current = ctx;
        analyserRef.current = analyser;
        sourceRef.current = source;
    }, []);

    // Animation loop — reads frequency data and pushes heights into state
    const animate = useCallback(() => {
        if (!analyserRef.current) return;
        const analyser = analyserRef.current;
        const bufLen = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufLen);
        analyser.getByteFrequencyData(dataArray);

        const step = Math.floor(bufLen / BAR_COUNT);
        const heights = [];
        for (let i = 0; i < BAR_COUNT; i++) {
            const val = dataArray[i * step] || 0;
            heights.push(Math.max(4, (val / 255) * 100)); // percentage 4–100
        }
        setBarHeights(heights);
        animFrameRef.current = requestAnimationFrame(animate);
    }, []);

    // Generate idle bar heights (static waveform look)
    const getIdleHeights = useCallback(() => {
        return Array.from({ length: BAR_COUNT }, (_, i) => {
            return Math.max(6, (idleSeed(i) * 55 + 10)); // 6–65%
        });
    }, []);

    // When not playing, show idle bars
    useEffect(() => {
        if (!isPlaying) {
            setBarHeights(getIdleHeights());
        }
    }, [isPlaying, getIdleHeights]);

    // Handle play/pause
    const togglePlay = () => {
        if (!audioRef.current) return;
        ensureAudioContext();

        if (audioCtxRef.current?.state === 'suspended') {
            audioCtxRef.current.resume();
        }

        if (isPlaying) {
            audioRef.current.pause();
            cancelAnimationFrame(animFrameRef.current);
            setIsPlaying(false);
        } else {
            audioRef.current.play().then(() => {
                setIsPlaying(true);
                animate();
            }).catch(e => {
                console.error('Audio play failed:', e);
                setError('Could not play audio');
            });
        }
    };

    // Skip forward/backward 10s
    const skip = (seconds) => {
        if (!audioRef.current) return;
        audioRef.current.currentTime = Math.max(0,
            Math.min(audioRef.current.duration || 0, audioRef.current.currentTime + seconds)
        );
    };

    // Click on bars area to seek
    const handleBarsClick = (e) => {
        if (!audioRef.current || !barsContainerRef.current) return;
        const rect = barsContainerRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const ratio = x / rect.width;
        const dur = audioRef.current.duration || totalDuration;
        audioRef.current.currentTime = ratio * dur;
        setCurrentTime(ratio * dur);
    };

    // Volume change
    const handleVolumeChange = (e) => {
        const v = parseFloat(e.target.value);
        setVolume(v);
        if (audioRef.current) audioRef.current.volume = v;
    };

    // Audio event listeners
    useEffect(() => {
        setError(null);
        setIsLoaded(false);
        setIsPlaying(false);
        setCurrentTime(0);

        // Disconnect old audio context when video changes
        if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
            cancelAnimationFrame(animFrameRef.current);
            audioCtxRef.current.close().catch(() => { });
            audioCtxRef.current = null;
            analyserRef.current = null;
            sourceRef.current = null;
        }

        const audio = audioRef.current;
        if (!audio) return;

        const onTimeUpdate = () => setCurrentTime(audio.currentTime);
        const onLoaded = () => {
            setTotalDuration(audio.duration);
            setIsLoaded(true);
        };
        const onEnded = () => {
            setIsPlaying(false);
            cancelAnimationFrame(animFrameRef.current);
        };
        const onError = () => {
            const errCode = audioRef.current?.error?.code;
            console.error('Audio load error:', audioRef.current?.error);
            setError(`Failed to load audio (Code: ${errCode || 'unknown'})`);
        };

        audio.addEventListener('timeupdate', onTimeUpdate);
        audio.addEventListener('loadedmetadata', onLoaded);
        audio.addEventListener('ended', onEnded);
        audio.addEventListener('error', onError);

        return () => {
            audio.removeEventListener('timeupdate', onTimeUpdate);
            audio.removeEventListener('loadedmetadata', onLoaded);
            audio.removeEventListener('ended', onEnded);
            audio.removeEventListener('error', onError);
            cancelAnimationFrame(animFrameRef.current);
        };
    }, [videoId]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            cancelAnimationFrame(animFrameRef.current);
            if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
                audioCtxRef.current.close().catch(() => { });
            }
        };
    }, []);

    // Progress ratio
    const progress = totalDuration > 0 ? currentTime / totalDuration : 0;

    if (error) {
        return (
            <div className="awp-root">
                <div className="awp-header">
                    <span className="awp-icon">🎵</span>
                    <span className="awp-title">Audio Player</span>
                </div>
                <p style={{ color: 'var(--text-tertiary)', fontSize: 'var(--font-sm)', padding: '0 var(--space-4)' }}>
                    {error}
                </p>
            </div>
        );
    }

    return (
        <div className="awp-root">
            {/* Hidden audio element */}
            <audio ref={audioRef} src={audioUrl} preload="metadata" />

            {/* Header */}
            <div className="awp-header">
                <span className="awp-icon">{isPlaying ? '🔊' : '🎵'}</span>
                <span className="awp-title">Audio Player</span>
                {isLoaded && (
                    <span className="awp-duration">{fmt(totalDuration)}</span>
                )}
            </div>

            {/* Sound Bars Visualization */}
            <div
                className="awp-bars-wrap"
                ref={barsContainerRef}
                onClick={handleBarsClick}
                title="Click to seek"
            >
                <div className="awp-bars">
                    {barHeights.map((h, i) => {
                        const barProgress = (i + 0.5) / BAR_COUNT;
                        const isPlayed = barProgress <= progress;
                        return (
                            <div
                                key={i}
                                className={`awp-bar ${isPlaying ? 'awp-bar--active' : ''} ${isPlayed ? 'awp-bar--played' : ''}`}
                                style={{ height: `${h}%` }}
                            />
                        );
                    })}
                </div>
                {/* Progress overlay line */}
                <div
                    className="awp-progress-line"
                    style={{ left: `${progress * 100}%` }}
                />
            </div>

            {/* Controls Row */}
            <div className="awp-controls">
                <div className="awp-time">
                    {fmt(currentTime)} / {fmt(totalDuration)}
                </div>

                <div className="awp-btns">
                    <button className="awp-btn" onClick={() => skip(-10)} title="Back 10s">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polygon points="19 20 9 12 19 4 19 20" /><line x1="5" y1="19" x2="5" y2="5" />
                        </svg>
                    </button>
                    <button className="awp-btn awp-btn--play" onClick={togglePlay} title={isPlaying ? 'Pause' : 'Play'}>
                        {isPlaying ? (
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                                <rect x="6" y="4" width="4" height="16" rx="1" />
                                <rect x="14" y="4" width="4" height="16" rx="1" />
                            </svg>
                        ) : (
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                                <polygon points="5 3 19 12 5 21 5 3" />
                            </svg>
                        )}
                    </button>
                    <button className="awp-btn" onClick={() => skip(10)} title="Forward 10s">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polygon points="5 4 15 12 5 20 5 4" /><line x1="19" y1="5" x2="19" y2="19" />
                        </svg>
                    </button>
                </div>

                <div className="awp-volume">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                        {volume > 0 && <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />}
                        {volume > 0.5 && <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />}
                    </svg>
                    <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={volume}
                        onChange={handleVolumeChange}
                        className="awp-volume-slider"
                        title={`Volume: ${Math.round(volume * 100)}%`}
                    />
                </div>
            </div>
        </div>
    );
};

export default AudioWaveformPlayer;

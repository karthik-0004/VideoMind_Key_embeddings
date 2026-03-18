import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import './SplashScreen.css'; // Reusing splash styles for consistency

// Stages where the video is ready for early access (embeddings done, PDF still generating)
const EARLY_ACCESS_STAGES = ['embedded', 'generating_pdf', 'pdf_generated'];

export const ProcessingScreen = ({ videos, processingStage = 'uploaded', stagePct = 5, videoId }) => {
    const [currentVideoIndex, setCurrentVideoIndex] = useState(0);
    const videoRef = useRef(null);
    const navigate = useNavigate();

    const canAccessEarly = EARLY_ACCESS_STAGES.includes(processingStage);

    const handleVideoEnd = () => {
        // Play next video, loop back to start if at end
        const nextIndex = (currentVideoIndex + 1) % videos.length;
        setCurrentVideoIndex(nextIndex);
    };

    useEffect(() => {
        if (videoRef.current) {
            videoRef.current.load();
            videoRef.current.play().catch(e => console.log('Autoplay prevented:', e));
        }
    }, [currentVideoIndex]);

    const handleGoToStudyRoom = () => {
        if (videoId) {
            // Store video ID so StudyRoom can show PDF notification when ready
            localStorage.setItem('videomind_pending_pdf', JSON.stringify({
                videoId,
                timestamp: Date.now(),
            }));
            navigate(`/study-room/${videoId}`);
        }
    };

    const getStatusText = () => {
        switch (processingStage) {
            case 'uploaded':
                return 'Starting up...';
            case 'compressing':
                return 'Compressing video...';
            case 'audio_converted':
                return 'Converting video to audio...';
            case 'transcribing':
                return 'Transcribing audio...';
            case 'transcribed':
                return 'Transcription complete...';
            case 'embedding':
                return 'Generating embeddings...';
            case 'embedded':
                return 'Embeddings complete!';
            case 'generating_pdf':
                return 'Creating PDF in background...';
            case 'pdf_generated':
            case 'completed':
                return 'Finalizing...';
            default:
                return 'Processing...';
        }
    };

    return (
        <div className="splash-screen" style={{ zIndex: 100 }}>
            <button
                onClick={() => navigate('/dashboard')}
                style={{
                    position: 'fixed',
                    top: '20px',
                    left: '20px',
                    zIndex: 9999,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '12px 22px',
                    background: '#3b82f6',
                    border: 'none',
                    borderRadius: '10px',
                    color: '#ffffff',
                    fontSize: '0.875rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    boxShadow: '0 4px 20px rgba(59,130,246,0.45)',
                    letterSpacing: '0.01em',
                }}
                onMouseEnter={e => {
                    e.currentTarget.style.background = '#2563eb';
                    e.currentTarget.style.transform = 'translateY(-1px)';
                    e.currentTarget.style.boxShadow = '0 6px 24px rgba(59,130,246,0.55)';
                }}
                onMouseLeave={e => {
                    e.currentTarget.style.background = '#3b82f6';
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = '0 4px 20px rgba(59,130,246,0.45)';
                }}
            >
                ← Dashboard
            </button>

            <div className="splash-video-container">
                <video
                    ref={videoRef}
                    autoPlay
                    muted
                    playsInline
                    onEnded={handleVideoEnd}
                    className="splash-video"
                >
                    <source src={videos[currentVideoIndex]} type="video/mp4" />
                </video>
            </div>

            {/* Bottom overlay: status + early access */}
            <div style={{
                position: 'absolute',
                bottom: '4%',
                left: '50%',
                transform: 'translateX(-50%)',
                textAlign: 'center',
                zIndex: 10,
                width: '100%',
            }}>
                <p style={{
                    color: '#111',
                    fontFamily: 'var(--font-family)',
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    letterSpacing: '0.5px',
                    textTransform: 'uppercase',
                    textShadow: '0 1px 3px rgba(255,255,255,0.5)',
                    margin: 0,
                    padding: 0,
                }}>
                    {getStatusText()}
                </p>

                <div style={{
                    position: 'absolute',
                    bottom: '80px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    width: '480px',
                    maxWidth: '90vw',
                    zIndex: 200,
                    textAlign: 'center',
                }}>
                    <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        marginBottom: '8px',
                        color: 'rgba(255,255,255,0.85)',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                    }}>
                        <span>{getStatusText()}</span>
                        <span>{stagePct ?? 5}%</span>
                    </div>
                    <div style={{
                        width: '100%',
                        height: '8px',
                        background: 'rgba(255,255,255,0.15)',
                        borderRadius: '999px',
                        overflow: 'hidden',
                        border: '1px solid rgba(255,255,255,0.2)',
                    }}>
                        <div style={{
                            height: '100%',
                            width: `${stagePct ?? 5}%`,
                            background: 'linear-gradient(90deg, #3b82f6, #a78bfa)',
                            borderRadius: '999px',
                            transition: 'width 0.8s cubic-bezier(0.4, 0, 0.2, 1)',
                            boxShadow: '0 0 12px rgba(139,92,246,0.6)',
                        }} />
                    </div>
                </div>

                {canAccessEarly && videoId && (
                    <div className="processing-early-access">
                        <p className="processing-early-msg">
                            Your video is ready to watch! PDF is still generating.
                        </p>
                        <button
                            className="processing-study-btn"
                            onClick={handleGoToStudyRoom}
                        >
                            Go to Study Room →
                        </button>
                        <p className="processing-early-hint">
                            You'll be notified when the PDF is ready
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};

import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import './SplashScreen.css'; // Reusing splash styles for consistency

// Stages where the video is ready for early access (embeddings done, PDF still generating)
const EARLY_ACCESS_STAGES = ['embedded', 'generating_pdf', 'pdf_generated'];

export const ProcessingScreen = ({ videos, processingStage = 'uploaded', videoId }) => {
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

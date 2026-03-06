import React, { useState, useEffect, useRef } from 'react';
import './SplashScreen.css'; // Reusing splash styles for consistency

export const ProcessingScreen = ({ videos, processingStage = 'uploaded' }) => {
    const [currentVideoIndex, setCurrentVideoIndex] = useState(0);
    const videoRef = useRef(null);

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

    const getStatusText = () => {
        switch (processingStage) {
            case 'uploaded':
                return 'Starting up...';
            case 'compressing':
                return 'Compressing video...';
            case 'audio_converted':
                return 'Converting video to audio...';
            case 'transcribed':
                return 'Transcribing audio to text...';
            case 'embedded':
                return 'Generating embeddings...';
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

            {/* Minimal overlay at center bottom */}
            <div style={{
                position: 'absolute',
                bottom: '10%',
                left: '50%',
                transform: 'translateX(-50%)',
                textAlign: 'center',
                zIndex: 10,
                width: '100%',
            }}>
                <p style={{
                    color: 'white', // Changed to white as requested
                    fontFamily: 'var(--font-family)',
                    fontSize: '0.875rem', // Reduced size (small and visible)
                    fontWeight: 500,
                    letterSpacing: '0.5px',
                    textTransform: 'uppercase',
                    textShadow: '0 2px 4px rgba(0,0,0,0.5)', // Added shadow for visibility against video
                    margin: 0,
                    padding: 0,
                }}>
                    {getStatusText()}
                </p>
            </div>
        </div>
    );
};

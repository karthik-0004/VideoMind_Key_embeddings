import React, { useEffect, useState } from 'react';
import './SplashScreen.css';

export const SplashScreen = ({ onComplete }) => {
    const [videoEnded, setVideoEnded] = useState(false);

    const handleVideoEnd = () => {
        setVideoEnded(true);
        // Navigate to dashboard when video finishes playing
        setTimeout(() => {
            onComplete();
        }, 500); // Small delay for smooth transition
    };

    return (
        <div className="splash-screen">
            <div className="splash-video-container">
                <video
                    ref={(el) => {
                        if (el) el.playbackRate = 1.75;
                    }}
                    autoPlay
                    muted
                    playsInline
                    onEnded={handleVideoEnd}
                    className="splash-video"
                >
                    <source src="/assets/starting_animation.mp4" type="video/mp4" />
                </video>
            </div>
            <div className="splash-overlay">
                <div className="splash-loading">
                    <div className="loading-spinner"></div>
                    <p>Welcome! Preparing your dashboard...</p>
                </div>
            </div>
        </div>
    );
};

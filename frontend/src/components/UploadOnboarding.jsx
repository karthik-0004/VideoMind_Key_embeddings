import React, { useState, useEffect } from 'react';
import './UploadOnboarding.css';

const STORAGE_KEY = 'videomind_upload_onboarding_done';

export const UploadOnboarding = () => {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        try {
            const done = localStorage.getItem(STORAGE_KEY);
            if (!done) setVisible(true);
        } catch {
            // localStorage unavailable — skip onboarding
        }
    }, []);

    const dismiss = () => {
        setVisible(false);
        try {
            localStorage.setItem(STORAGE_KEY, '1');
        } catch {
            // ignore
        }
    };

    if (!visible) return null;

    return (
        <div className="onboarding-overlay" onClick={dismiss}>
            <div className="onboarding-spotlight" />

            <div className="onboarding-tooltip" onClick={(e) => e.stopPropagation()}>
                <div className="onboarding-arrow" />
                <div className="onboarding-content">
                    <h3 className="onboarding-title">Welcome to VideoMind!</h3>
                    <p className="onboarding-message">
                        Upload a video from your device or paste a YouTube link to get started.
                        We'll transcribe, analyze, and create smart notes for you automatically.
                    </p>
                    <button className="onboarding-skip-btn" onClick={dismiss}>
                        Got it
                    </button>
                </div>
            </div>
        </div>
    );
};

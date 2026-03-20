import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './SplashScreen.css';

const STAGE_ANIMATION_MAP = {
    starting_up: '/animations/starting_up.html',
    converting_video_to_audio: '/animations/converting_video_to_audio.html',
    transcribing_audio: '/animations/transcribing_audio.html',
    generating_embeddings: '/animations/generating_embeddings.html',
    creating_pdf: '/animations/creating_pdf.html',
};

const STAGE_LABEL_MAP = {
    starting_up: 'Starting up',
    converting_video_to_audio: 'Converting video to audio',
    transcribing_audio: 'Transcribing audio',
    generating_embeddings: 'Generating embeddings',
    creating_pdf: 'Creating PDF',
};

const FADE_MS = 450;

export const ProcessingScreen = ({
    processingStage = 'starting_up',
    stagePct = 20,
    stageStep = 1,
    stageTotal = 5,
    videoId = null,
}) => {
    const navigate = useNavigate();
    const nextTimeoutRef = useRef(null);
    const nextSrc = useMemo(
        () => STAGE_ANIMATION_MAP[processingStage] || STAGE_ANIMATION_MAP.starting_up,
        [processingStage]
    );

    const [currentSrc, setCurrentSrc] = useState(nextSrc);
    const [incomingSrc, setIncomingSrc] = useState(null);
    const [fadeInIncoming, setFadeInIncoming] = useState(false);

    useEffect(() => {
        if (!nextSrc || nextSrc === currentSrc) {
            return;
        }

        if (nextTimeoutRef.current) {
            clearTimeout(nextTimeoutRef.current);
        }

        setIncomingSrc(nextSrc);
        setFadeInIncoming(false);

        requestAnimationFrame(() => {
            requestAnimationFrame(() => setFadeInIncoming(true));
        });

        nextTimeoutRef.current = setTimeout(() => {
            setCurrentSrc(nextSrc);
            setIncomingSrc(null);
            setFadeInIncoming(false);
            nextTimeoutRef.current = null;
        }, FADE_MS);

        return () => {
            if (nextTimeoutRef.current) {
                clearTimeout(nextTimeoutRef.current);
                nextTimeoutRef.current = null;
            }
        };
    }, [nextSrc, currentSrc]);

    const STAGE_ORDER = [
        'starting_up',
        'converting_video_to_audio',
        'transcribing_audio',
        'generating_embeddings',
        'creating_pdf',
    ];

    const label = STAGE_LABEL_MAP[processingStage] || 'Processing';
    const stageIndex = STAGE_ORDER.indexOf(processingStage);
    const pdfStartIndex = STAGE_ORDER.indexOf('creating_pdf');
    const showEarlyAccess = stageIndex >= pdfStartIndex && Boolean(videoId);

    const handleGoToStudyRoom = () => {
        if (!videoId) return;
        localStorage.setItem('videomind_pending_pdf', JSON.stringify({
            videoId,
            timestamp: Date.now(),
        }));
        navigate(`/study-room/${videoId}`);
    };

    return (
        <div className="processing-fullscreen-root">
            <div className="processing-animation-stage" aria-live="polite">
                <iframe
                    title="Processing animation active"
                    src={currentSrc}
                    className="processing-frame processing-frame-base"
                    frameBorder="0"
                    scrolling="no"
                />

                {incomingSrc && (
                    <iframe
                        title="Processing animation incoming"
                        src={incomingSrc}
                        className={`processing-frame processing-frame-overlay ${fadeInIncoming ? 'is-visible' : ''}`}
                        frameBorder="0"
                        scrolling="no"
                    />
                )}
            </div>

            <div className="processing-hud-bar">
                <div className="processing-hud-meta">{label}</div>
                <div className="processing-hud-meta">Step {stageStep} of {stageTotal}</div>
                <div className="processing-hud-progress-track" aria-label="Stage progress">
                    <div
                        className="processing-hud-progress-fill"
                        style={{ width: `${Math.max(0, Math.min(100, stagePct))}%` }}
                    />
                </div>
            </div>

            {showEarlyAccess && (
                <div className="processing-early-access-banner">
                    <span className="processing-early-access-text">
                        Content is ready! Go to Study Room to start learning while we finish processing.
                    </span>
                    <button className="processing-early-access-btn" onClick={handleGoToStudyRoom}>
                        Go to Study Room →
                    </button>
                </div>
            )}
        </div>
    );
};

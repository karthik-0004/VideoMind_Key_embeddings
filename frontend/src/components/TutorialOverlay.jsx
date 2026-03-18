import React, { useCallback, useEffect, useMemo, useState } from 'react';
import './TutorialOverlay.css';

const STEP_INTERVAL_MS = 3500;
const DONE_DELAY_MS = 1500;
const DOM_SETTLE_MS = 300;
const VIEWPORT_PADDING = 12;
const TOOLTIP_WIDTH = 280;
const TOOLTIP_HEIGHT = 140;
const TOOLTIP_GAP = 16;
const SPOTLIGHT_PADDING = 6;

const PAGE_STEPS = {
    dashboard: [
        {
            targetSelector: ".topnav-tab[href='/upload']",
            message: 'Start here! Upload your first video to get started.',
            arrowDirection: 'top',
        },
        {
            targetSelector: '.kanban-columns, .kanban-column',
            message: 'Your processed videos appear here. Click any card to preview.',
            arrowDirection: 'left',
        },
        {
            targetSelector: ".action-btn, [title='Study Room'], .action-chat",
            message: 'Click Study Room for an immersive learning experience with AI assistance.',
            arrowDirection: 'bottom',
        },
    ],
    upload: [
        {
            targetSelector: '.dropzone',
            message: 'Drag & drop your video here, or click to browse files.',
            arrowDirection: 'top',
        },
        {
            targetSelector: '.upload-mode-toggle',
            message: 'Switch between local file upload and YouTube URL import.',
            arrowDirection: 'left',
        },
    ],
    chat: [
        {
            targetSelector: '.chat-input input',
            message: 'Ask any question about your video — get answers with timestamps!',
            arrowDirection: 'top',
        },
        {
            targetSelector: '.chat-header .btn:last-of-type',
            message: 'Open the AI Assistant panel for a split-screen AI chat experience.',
            arrowDirection: 'top',
        },
    ],
    'study-room': [
        {
            targetSelector: '.sr-vid-area, video.sr-video-el, .video-area',
            message: 'Your video plays here. The AI has analyzed every second of it.',
            arrowDirection: 'right',
        },
        {
            targetSelector: '.sr-ts-list, .sr-ts-panel, .ts-list, .right-side',
            message: 'Jump to any topic instantly — these are AI-extracted timestamps.',
            arrowDirection: 'left',
        },
        {
            targetSelector: '.sr-in, .input-bar input, .right-side input',
            message: 'Ask the AI anything about this video. It knows the full content.',
            arrowDirection: 'bottom',
        },
    ],
};

const findTargetElement = (selector) => {
    if (!selector) return null;
    const selectors = selector.split(',').map((entry) => entry.trim()).filter(Boolean);
    for (const currentSelector of selectors) {
        const element = document.querySelector(currentSelector);
        if (element) return element;
    }
    return null;
};

const getPositionForDirection = (rect, direction) => {
    if (direction === 'top') {
        return {
            top: rect.top - TOOLTIP_HEIGHT - TOOLTIP_GAP,
            left: rect.left + rect.width / 2 - TOOLTIP_WIDTH / 2,
        };
    }
    if (direction === 'bottom') {
        return {
            top: rect.bottom + TOOLTIP_GAP,
            left: rect.left + rect.width / 2 - TOOLTIP_WIDTH / 2,
        };
    }
    if (direction === 'left') {
        return {
            top: rect.top + rect.height / 2 - TOOLTIP_HEIGHT / 2,
            left: rect.left - TOOLTIP_WIDTH - TOOLTIP_GAP,
        };
    }
    return {
        top: rect.top + rect.height / 2 - TOOLTIP_HEIGHT / 2,
        left: rect.right + TOOLTIP_GAP,
    };
};

const clampTooltipToViewport = (position) => {
    const maxLeft = window.innerWidth - TOOLTIP_WIDTH - VIEWPORT_PADDING;
    const maxTop = window.innerHeight - TOOLTIP_HEIGHT - VIEWPORT_PADDING;
    return {
        top: Math.min(Math.max(position.top, VIEWPORT_PADDING), Math.max(maxTop, VIEWPORT_PADDING)),
        left: Math.min(Math.max(position.left, VIEWPORT_PADDING), Math.max(maxLeft, VIEWPORT_PADDING)),
    };
};

const getTooltipPlacement = (rect, arrowDirection) => {
    let resolvedDirection = arrowDirection;
    let position = getPositionForDirection(rect, resolvedDirection);

    if (position.top < VIEWPORT_PADDING && resolvedDirection === 'top') {
        resolvedDirection = 'bottom';
        position = getPositionForDirection(rect, resolvedDirection);
    }

    if (position.top + TOOLTIP_HEIGHT > window.innerHeight - VIEWPORT_PADDING && resolvedDirection === 'bottom') {
        resolvedDirection = 'top';
        position = getPositionForDirection(rect, resolvedDirection);
    }

    if (position.left < VIEWPORT_PADDING && resolvedDirection === 'left') {
        resolvedDirection = 'right';
        position = getPositionForDirection(rect, resolvedDirection);
    }

    if (position.left + TOOLTIP_WIDTH > window.innerWidth - VIEWPORT_PADDING && resolvedDirection === 'right') {
        resolvedDirection = 'left';
        position = getPositionForDirection(rect, resolvedDirection);
    }

    return {
        direction: resolvedDirection,
        position: clampTooltipToViewport(position),
    };
};

export const TutorialOverlay = ({ page }) => {
    const steps = useMemo(() => PAGE_STEPS[page] || [], [page]);
    const [isVisible, setIsVisible] = useState(false);
    const [currentStepIndex, setCurrentStepIndex] = useState(0);
    const [showDone, setShowDone] = useState(false);
    const [targetRect, setTargetRect] = useState(null);
    const [tooltip, setTooltip] = useState({ top: 0, left: 0, direction: 'top' });

    const dismissTutorial = useCallback(() => {
        sessionStorage.setItem('tutorial_dismissed', 'true');
        setShowDone(false);
        setIsVisible(false);
    }, []);

    const goToNextStep = useCallback(() => {
        setCurrentStepIndex((previousIndex) => {
            if (previousIndex >= steps.length - 1) {
                setShowDone(true);
                return previousIndex;
            }
            return previousIndex + 1;
        });
    }, [steps.length]);

    const positionCurrentStep = useCallback(() => {
        const step = steps[currentStepIndex];
        if (!step) return;

        const targetElement = findTargetElement(step.targetSelector);
        if (!targetElement) {
            goToNextStep();
            return;
        }

        const rect = targetElement.getBoundingClientRect();
        const placement = getTooltipPlacement(rect, step.arrowDirection);

        setTargetRect(rect);
        setTooltip({
            top: placement.position.top,
            left: placement.position.left,
            direction: placement.direction,
        });
    }, [currentStepIndex, goToNextStep, steps]);

    useEffect(() => {
        const dismissed = sessionStorage.getItem('tutorial_dismissed');
        if (!dismissed && steps.length > 0) {
            setIsVisible(true);
        }
    }, [steps.length]);

    useEffect(() => {
        if (!isVisible || showDone) return undefined;

        const timer = window.setTimeout(() => {
            goToNextStep();
        }, STEP_INTERVAL_MS);

        return () => window.clearTimeout(timer);
    }, [currentStepIndex, goToNextStep, isVisible, showDone]);

    useEffect(() => {
        if (!isVisible || showDone) return undefined;

        const timer = window.setTimeout(() => {
            positionCurrentStep();
        }, DOM_SETTLE_MS);

        return () => window.clearTimeout(timer);
    }, [currentStepIndex, isVisible, positionCurrentStep, showDone]);

    useEffect(() => {
        if (!isVisible || showDone) return undefined;

        const handleResize = () => {
            positionCurrentStep();
        };

        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [isVisible, positionCurrentStep, showDone]);

    useEffect(() => {
        if (!showDone) return undefined;

        const doneTimer = window.setTimeout(() => {
            dismissTutorial();
        }, DONE_DELAY_MS);

        return () => window.clearTimeout(doneTimer);
    }, [dismissTutorial, showDone]);

    if (!isVisible) {
        return null;
    }

    if (showDone) {
        return (
            <div className="tutorial-overlay-root">
                <div className="tutorial-backdrop" />
                <div className="tutorial-done-msg">You're all set! 🎉</div>
            </div>
        );
    }

    const step = steps[currentStepIndex];
    if (!step || !targetRect) {
        return (
            <div className="tutorial-overlay-root">
                <div className="tutorial-backdrop" />
                <button className="tutorial-skip-btn" onClick={dismissTutorial}>
                    Skip Tutorial
                </button>
            </div>
        );
    }

    return (
        <div className="tutorial-overlay-root" aria-live="polite">
            <div className="tutorial-backdrop" />

            <div
                className="tutorial-spotlight"
                style={{
                    top: targetRect.top - SPOTLIGHT_PADDING,
                    left: targetRect.left - SPOTLIGHT_PADDING,
                    width: targetRect.width + SPOTLIGHT_PADDING * 2,
                    height: targetRect.height + SPOTLIGHT_PADDING * 2,
                }}
            />

            <div
                className="tutorial-tooltip"
                style={{
                    top: tooltip.top,
                    left: tooltip.left,
                }}
            >
                <div className={`tutorial-arrow ${tooltip.direction}`}>
                    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path
                            d="M12 4V18"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        />
                        <path
                            d="M6 12L12 18L18 12"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        />
                    </svg>
                </div>

                <div className="tutorial-step-indicator">
                    Step {Math.min(currentStepIndex + 1, steps.length)} of {steps.length}
                </div>
                <div className="tutorial-message">{step.message}</div>
                <div className="tutorial-actions">
                    <span />
                    <button className="tutorial-next-btn" onClick={goToNextStep}>
                        Next
                    </button>
                </div>
            </div>

            <button className="tutorial-skip-btn" onClick={dismissTutorial}>
                Skip Tutorial
            </button>
        </div>
    );
};

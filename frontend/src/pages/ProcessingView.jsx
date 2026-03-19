import React, { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ProcessingScreen } from '../components/ProcessingScreen';
import { authStorage, videoAPI } from '../services/api';

const STAGE_ORDER = [
    'starting_up',
    'converting_video_to_audio',
    'transcribing_audio',
    'generating_embeddings',
    'creating_pdf',
];

const BACKEND_TO_PIPELINE_STAGE = {
    uploaded: 'starting_up',
    compressing: 'starting_up',
    starting_up: 'starting_up',

    audio_converted: 'converting_video_to_audio',
    converting_video_to_audio: 'converting_video_to_audio',

    transcribing: 'transcribing_audio',
    transcribed: 'transcribing_audio',
    transcribing_audio: 'transcribing_audio',

    embedding: 'generating_embeddings',
    embedded: 'generating_embeddings',
    generating_embeddings: 'generating_embeddings',

    generating_pdf: 'creating_pdf',
    pdf_generated: 'creating_pdf',
    creating_pdf: 'creating_pdf',
    completed: 'creating_pdf',
};

const normalizeStage = (stage) => BACKEND_TO_PIPELINE_STAGE[stage] ?? 'starting_up';

const getStageProgress = (stage) => {
    const index = STAGE_ORDER.indexOf(stage);
    const step = index === -1 ? 1 : index + 1;
    return {
        step,
        total: STAGE_ORDER.length,
        pct: Math.round((step / STAGE_ORDER.length) * 100),
    };
};

export const ProcessingView = () => {
    const { id } = useParams();
    const [processingStage, setProcessingStage] = useState('starting_up');
    const [stagePct, setStagePct] = useState(getStageProgress('starting_up').pct);
    const [stageStep, setStageStep] = useState(1);
    const [stageTotal] = useState(STAGE_ORDER.length);
    const latestStepRef = useRef(1);
    const stageQueueRef = useRef([]);
    const stageTimerRef = useRef(null);

    useEffect(() => {
        if (!id) return;

        let isMounted = true;
        let pollInterval = null;
        let eventSource = null;

        const clearStageTimer = () => {
            if (stageTimerRef.current) {
                clearTimeout(stageTimerRef.current);
                stageTimerRef.current = null;
            }
        };

        const applyStage = (stage) => {
            const progress = getStageProgress(stage);
            latestStepRef.current = progress.step;
            setProcessingStage(stage);
            setStagePct(progress.pct);
            setStageStep(progress.step);
        };

        const drainQueue = () => {
            if (!isMounted || stageQueueRef.current.length === 0) {
                stageTimerRef.current = null;
                return;
            }

            const nextStage = stageQueueRef.current.shift();
            applyStage(nextStage);

            if (stageQueueRef.current.length > 0) {
                stageTimerRef.current = setTimeout(drainQueue, 900);
            } else {
                stageTimerRef.current = null;
            }
        };

        const enqueueStagesThrough = (targetStage) => {
            const targetProgress = getStageProgress(targetStage);
            if (targetProgress.step <= latestStepRef.current) {
                if (targetProgress.step === latestStepRef.current) {
                    applyStage(targetStage);
                }
                return;
            }

            const queued = [];
            for (let i = latestStepRef.current + 1; i <= targetProgress.step; i += 1) {
                queued.push(STAGE_ORDER[i - 1]);
            }

            stageQueueRef.current = queued;
            if (!stageTimerRef.current) {
                drainQueue();
            }
        };

        const applyStatusPayload = (payload) => {
            const rawStage = payload?.processing_stage;
            const normalizedStage = normalizeStage(rawStage);

            if (!isMounted) return;
            enqueueStagesThrough(normalizedStage);
        };

        const poll = async () => {
            try {
                const res = await videoAPI.getVideoStatus(id);
                applyStatusPayload(res?.data || {});
            } catch (error) {
                console.error('ProcessingView poll error:', error);
            }
        };

        const startPollingFallback = () => {
            if (pollInterval) return;
            poll();
            pollInterval = setInterval(poll, 2500);
        };

        const token = authStorage.getToken();
        const streamUrl = token
            ? `http://localhost:8000/api/videos/${id}/status_stream/?token=${encodeURIComponent(token)}`
            : null;

        if (streamUrl) {
            eventSource = new EventSource(streamUrl);

            eventSource.onmessage = (event) => {
                try {
                    const payload = JSON.parse(event.data);
                    applyStatusPayload(payload);
                } catch (error) {
                    console.error('Failed to parse status stream payload:', error);
                }
            };

            eventSource.onerror = () => {
                if (eventSource) {
                    eventSource.close();
                    eventSource = null;
                }
                startPollingFallback();
            };
        } else {
            startPollingFallback();
        }

        poll();

        return () => {
            isMounted = false;
            clearStageTimer();
            if (eventSource) {
                eventSource.close();
            }
            if (pollInterval) {
                clearInterval(pollInterval);
            }
        };
    }, [id]);

    return (
        <ProcessingScreen
            processingStage={processingStage}
            stagePct={stagePct}
            stageStep={stageStep}
            stageTotal={stageTotal}
            videoId={id}
        />
    );
};

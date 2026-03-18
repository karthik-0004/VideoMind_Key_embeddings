import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ProcessingScreen } from '../components/ProcessingScreen';
import { videoAPI } from '../services/api';

const STAGE_MAP = {
    uploaded: 5,
    compressing: 15,
    audio_converted: 35,
    transcribing: 45,
    transcribed: 58,
    embedding: 68,
    embedded: 78,
    generating_pdf: 85,
    pdf_generated: 93,
    completed: 100,
    failed: 100,
};

export const ProcessingView = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const [processingStage, setProcessingStage] = useState('uploaded');
    const [stagePct, setStagePct] = useState(STAGE_MAP.uploaded);

    useEffect(() => {
        if (!id) return;

        let isMounted = true;

        const poll = async () => {
            try {
                const res = await videoAPI.getVideoStatus(id);
                const status = res?.data?.status;
                const stage = res?.data?.processing_stage;

                if (isMounted && stage) {
                    setProcessingStage(stage);
                    setStagePct(STAGE_MAP[stage] ?? 5);
                }

                if (status === 'completed') {
                    navigate('/dashboard');
                }
            } catch (error) {
                console.error('ProcessingView poll error:', error);
            }
        };

        poll();
        const interval = setInterval(poll, 2000);

        return () => {
            isMounted = false;
            clearInterval(interval);
        };
    }, [id, navigate]);

    return (
        <ProcessingScreen
            videos={[
                '/new_anime.mp4',
                '/Robot_and_Human_Collaboration_Animation.mp4',
            ]}
            processingStage={processingStage}
            stagePct={stagePct}
            videoId={id}
        />
    );
};

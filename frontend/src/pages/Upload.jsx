import React, { useMemo, useState, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '../components/AppLayout';
import { Card } from '../components/Card';
import { Badge } from '../components/Badge';
import { ProcessingScreen } from '../components/ProcessingScreen';
import { videoAPI } from '../services/api';
import { Upload as UploadIcon, X } from 'lucide-react';
import { UploadOnboarding } from '../components/UploadOnboarding';
import { TutorialOverlay } from '../components/TutorialOverlay';
import './Upload.css';

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

const STAGE_LABEL_MAP = {
    starting_up: 'Starting up',
    converting_video_to_audio: 'Converting video to audio',
    transcribing_audio: 'Transcribing audio',
    generating_embeddings: 'Generating embeddings',
    creating_pdf: 'Creating PDF',
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

export const Upload = () => {
    const navigate = useNavigate();
    const [uploadQueue, setUploadQueue] = useState([]);
    const [toastVisible, setToastVisible] = useState(false);
    const [toastVideoTitle, setToastVideoTitle] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [currentProcessingVideoId, setCurrentProcessingVideoId] = useState(null);
    const [processingStage, setProcessingStage] = useState('starting_up');
    const [processingError, setProcessingError] = useState('');

    // Poll for status updates for processing items
    useEffect(() => {
        const processingItem = uploadQueue.find(item => item.status === 'processing');

        if (processingItem && processingItem.videoId) {
            setIsProcessing(true);
            setCurrentProcessingVideoId(processingItem.videoId);
            setProcessingError('');

            const interval = setInterval(async () => {
                try {
                    const response = await videoAPI.getVideoStatus(processingItem.videoId);
                    const { status, processing_stage, error_message } = response.data;

                    if (processing_stage) {
                        const normalizedStage = normalizeStage(processing_stage);
                        setProcessingStage(normalizedStage);
                        // Keep queue badge label in sync too
                        const stageInfo = getStageProgress(normalizedStage);
                        if (stageInfo) {
                            setUploadQueue(prev => prev.map(i =>
                                i.id === processingItem.id
                                    ? {
                                        ...i,
                                        stageLabel: normalizedStage.replaceAll('_', ' '),
                                        stagePct: stageInfo.pct,
                                    }
                                    : i
                            ));
                        }
                    }

                    if (status === 'completed') {
                        clearInterval(interval);
                        setUploadQueue(prev => prev.map(i =>
                            i.id === processingItem.id
                                ? { ...i, status: 'completed', message: 'Completed' }
                                : i
                        ));
                        setToastVideoTitle(processingItem.displayName || 'Your video');
                        setToastVisible(true);
                        setIsProcessing(false);
                        // Keep videoId visible for 2 seconds so banner stays accessible
                        setTimeout(() => {
                            setCurrentProcessingVideoId(null);
                        }, 2000);
                        setTimeout(() => {
                            setToastVisible(false);
                        }, 3000);
                    } else if (status === 'failed') {
                        clearInterval(interval);
                        setIsProcessing(false);
                        setProcessingError(error_message || 'Processing failed');
                        setUploadQueue(prev => prev.map(i =>
                            i.id === processingItem.id
                                ? { ...i, status: 'failed', message: error_message || 'Processing failed' }
                                : i
                        ));
                    }
                } catch (error) {
                    console.error('Error polling status:', error);
                }
            }, 3000); // Poll every 3 seconds

            return () => clearInterval(interval);
        }

        setIsProcessing(false);
    }, [uploadQueue, navigate]);

    const onDrop = (acceptedFiles) => {
        acceptedFiles.forEach(file => {
            const item = {
                id: Date.now() + Math.random(),
                file,
                displayName: file.name,
                progress: 0,
                status: 'uploading',
                message: 'Uploading...'
            };

            setUploadQueue(prev => [...prev, item]);

            videoAPI.uploadVideo(file, (progressEvent) => {
                const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
                setUploadQueue(prev => prev.map(i =>
                    i.id === item.id ? { ...i, progress } : i
                ));
            })
                .then(res => {
                    // Update validation: backend response should contain video ID
                    const videoId = res.data.id;
                    setUploadQueue(prev => prev.map(i =>
                        i.id === item.id
                            ? { ...i, status: 'processing', message: 'Processing...', progress: 100, videoId }
                            : i
                    ));
                })
                .catch(err => {
                    const errorMessage = err.response?.data?.error || err.message;
                    setUploadQueue(prev => prev.map(i =>
                        i.id === item.id
                            ? { ...i, status: 'failed', message: errorMessage }
                            : i
                    ));
                });
        });
    };

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: {
            'video/*': ['.mp4', '.mov', '.avi', '.mkv', '.webm']
        },
        disabled: isProcessing // Disable dropzone while processing
    });

    const removeItem = (id) => {
        setUploadQueue(prev => prev.filter(i => i.id !== id));
    };

    const stageProgress = useMemo(
        () => getStageProgress(processingStage),
        [processingStage]
    );

    return (
        <>
            <AppLayout>
                <TutorialOverlay page="upload" />
                {isProcessing && (
                    <ProcessingScreen
                        processingStage={processingStage}
                        stagePct={stageProgress.pct}
                        stageStep={stageProgress.step}
                        stageTotal={stageProgress.total}
                        videoId={currentProcessingVideoId}
                    />
                )}

                <UploadOnboarding />

                <div className="upload-page">
                <h1>Upload Video</h1>

                <div {...getRootProps()} className={`dropzone ${isDragActive ? 'active' : ''}`}>
                    <input {...getInputProps()} />
                    <UploadIcon size={48} color="var(--primary)" />
                    <p className="dropzone-text">
                        {isDragActive ? 'Drop video here...' : 'Drag & drop video here or click to browse'}
                    </p>
                    <p className="dropzone-hint">Supported: MP4, MOV, AVI, MKV, WEBM</p>
                </div>

                {uploadQueue.length > 0 && (
                    <div className="upload-queue">
                        <h2>Upload Queue</h2>
                        {uploadQueue.map(item => (
                            <Card key={item.id} className="upload-item">
                                <div className="upload-item-content">
                                    <div className="upload-info">
                                        <div className="upload-filename">{item.displayName || item.file?.name || 'Video upload'}</div>

                                        {/* Byte-upload progress bar (while file is uploading) */}
                                        {item.status === 'uploading' && (
                                            <div className="progress-bar">
                                                <div className="progress-fill" style={{ width: `${item.progress}%` }} />
                                            </div>
                                        )}

                                        {/* Stage-based progress bar (while backend is processing) */}
                                        {item.status === 'processing' && (
                                            <>
                                                <div className="progress-bar stage-progress-bar">
                                                    <div
                                                        className="progress-fill stage-progress-fill"
                                                        style={{ width: `${item.stagePct ?? 20}%` }}
                                                    />
                                                </div>
                                                <div className="stage-label">
                                                    {item.stageLabel ?? STAGE_LABEL_MAP['starting_up']}
                                                </div>
                                            </>
                                        )}

                                        <div className="upload-status">
                                            <Badge variant={
                                                item.status === 'failed' ? 'error' :
                                                    item.status === 'processing' ? 'warning' : 'info'
                                            }>
                                                {item.status === 'failed'
                                                    ? (item.message || 'Processing failed')
                                                    : item.status === 'processing'
                                                        ? (item.stageLabel ?? STAGE_LABEL_MAP['starting_up'])
                                                        : item.message}
                                            </Badge>
                                        </div>
                                    </div>
                                    <button
                                        className="remove-btn"
                                        onClick={() => removeItem(item.id)}
                                    >
                                        <X size={20} />
                                    </button>
                                </div>
                            </Card>
                        ))}
                    </div>
                )}
                </div>
            </AppLayout>

            {toastVisible && (
                <div style={{
                    position: 'fixed',
                    bottom: '32px',
                    right: '32px',
                    zIndex: 9999,
                    background: 'linear-gradient(135deg, #10b981, #059669)',
                    color: '#fff',
                    padding: '16px 24px',
                    borderRadius: '14px',
                    boxShadow: '0 8px 32px rgba(16,185,129,0.45)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    fontSize: '0.9rem',
                    fontWeight: 600,
                    animation: 'toastSlideIn 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                    minWidth: '300px',
                    border: '1px solid rgba(255,255,255,0.2)',
                }}>
                    <span style={{ fontSize: '1.4rem' }}>✅</span>
                    <div>
                        <div style={{ fontWeight: 700, marginBottom: '2px' }}>Video is Ready to Watch!</div>
                        <div style={{ fontSize: '0.75rem', opacity: 0.85 }}>{toastVideoTitle} — Redirecting to Dashboard...</div>
                    </div>
                </div>
            )}
        </>
    );
};

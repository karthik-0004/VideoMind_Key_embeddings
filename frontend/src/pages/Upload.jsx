import React, { useState, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '../components/AppLayout';
import { Card } from '../components/Card';
import { Badge } from '../components/Badge';
import { ProcessingScreen } from '../components/ProcessingScreen';
import { videoAPI } from '../services/api';
import { Upload as UploadIcon, X } from 'lucide-react';
import './Upload.css';

// Maps backend processing_stage → { pct: progress %, label: human string }
const STAGE_MAP = {
    uploaded: { pct: 5, label: 'Starting… 🔄' },
    compressing: { pct: 15, label: 'Compressing Video ⚡' },
    audio_converted: { pct: 35, label: 'Converting to Audio 🎵' },
    transcribing: { pct: 45, label: 'Transcribing Audio 📝' },
    transcribed: { pct: 58, label: 'Transcription Complete 📝' },
    embedding: { pct: 68, label: 'Generating Embeddings 🧠' },
    embedded: { pct: 78, label: 'Embeddings Complete 🧠' },
    generating_pdf: { pct: 85, label: 'Creating PDF 📄' },
    pdf_generated: { pct: 93, label: 'PDF Ready 📄' },
    completed: { pct: 100, label: 'Completed ✅' },
    failed: { pct: 100, label: 'Failed ❌' },
};

export const Upload = () => {
    const navigate = useNavigate();
    const [uploadQueue, setUploadQueue] = useState([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [processingStage, setProcessingStage] = useState('uploaded');
    const [processingError, setProcessingError] = useState('');
    const [uploadMode, setUploadMode] = useState('local');
    const [youtubeUrl, setYoutubeUrl] = useState('');
    const [youtubeTitle, setYoutubeTitle] = useState('');
    const [youtubeError, setYoutubeError] = useState('');

    // Poll for status updates for processing items
    useEffect(() => {
        const processingItem = uploadQueue.find(item => item.status === 'processing');

        if (processingItem && processingItem.videoId) {
            setIsProcessing(true);
            setProcessingError('');

            const interval = setInterval(async () => {
                try {
                    const response = await videoAPI.getVideoStatus(processingItem.videoId);
                    const { status, processing_stage, error_message } = response.data;

                    if (processing_stage) {
                        setProcessingStage(processing_stage);
                        // Keep queue badge label in sync too
                        const stageInfo = STAGE_MAP[processing_stage];
                        if (stageInfo) {
                            setUploadQueue(prev => prev.map(i =>
                                i.id === processingItem.id
                                    ? { ...i, stageLabel: stageInfo.label, stagePct: stageInfo.pct }
                                    : i
                            ));
                        }
                    }

                    if (status === 'completed') {
                        clearInterval(interval);
                        // Brief pause so the user sees "Completed" before navigating
                        setTimeout(() => navigate('/dashboard'), 800);
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

    // Poll YouTube download tasks for percentage/status updates
    useEffect(() => {
        const youtubeItems = uploadQueue.filter(item =>
            item.youtubeTaskId && ['queued', 'downloading', 'downloaded'].includes(item.status)
        );

        if (youtubeItems.length === 0) {
            return;
        }

        const interval = setInterval(async () => {
            for (const item of youtubeItems) {
                try {
                    const response = await videoAPI.getYouTubeDownloadStatus(item.youtubeTaskId);
                    const task = response.data;

                    setUploadQueue(prev => prev.map(queueItem => {
                        if (queueItem.id !== item.id) {
                            return queueItem;
                        }

                        if (task.status === 'failed') {
                            return {
                                ...queueItem,
                                status: 'failed',
                                progress: 0,
                                message: task.message || 'YouTube download failed',
                            };
                        }

                        if (task.status === 'processing' && task.video_id) {
                            return {
                                ...queueItem,
                                status: 'processing',
                                progress: 100,
                                videoId: task.video_id,
                                displayName: task.title || queueItem.displayName,
                                message: task.message || 'Processing...',
                            };
                        }

                        const progressValue = Number.isFinite(task.progress)
                            ? task.progress
                            : queueItem.progress;

                        let statusMessage = task.message || queueItem.message;
                        if (task.status === 'downloading' && Number.isFinite(progressValue)) {
                            statusMessage = `Downloading from YouTube... ${progressValue}%`;
                        }

                        return {
                            ...queueItem,
                            status: task.status || queueItem.status,
                            progress: progressValue,
                            message: statusMessage,
                            displayName: task.title || queueItem.displayName,
                        };
                    }));
                } catch (error) {
                    console.error('Error polling YouTube status:', error);
                }
            }
        }, 1500);

        return () => clearInterval(interval);
    }, [uploadQueue]);

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

    const isYouTubeUrl = (value) => {
        try {
            const parsed = new URL(value);
            const host = parsed.hostname.toLowerCase();
            return host.includes('youtube.com') || host.includes('youtu.be');
        } catch {
            return false;
        }
    };

    const clearYouTubeInputs = () => {
        setYoutubeUrl('');
        setYoutubeTitle('');
        setYoutubeError('');
    };

    const handleYouTubeUpload = async () => {
        const trimmedUrl = youtubeUrl.trim();
        const trimmedTitle = youtubeTitle.trim();

        if (!trimmedUrl) {
            setYoutubeError('Please paste a YouTube URL.');
            return;
        }

        if (!isYouTubeUrl(trimmedUrl)) {
            setYoutubeError('Only YouTube links are supported.');
            return;
        }

        setYoutubeError('');

        const item = {
            id: Date.now() + Math.random(),
            displayName: trimmedTitle || trimmedUrl,
            progress: 0,
            status: 'queued',
            message: 'Queued for download...'
        };

        setUploadQueue(prev => [...prev, item]);

        try {
            const response = await videoAPI.uploadYouTube(trimmedUrl, trimmedTitle);
            const taskId = response.data.task_id;
            const finalTitle = trimmedTitle || trimmedUrl;

            setUploadQueue(prev => prev.map(i =>
                i.id === item.id
                    ? { ...i, displayName: finalTitle, youtubeTaskId: taskId, status: 'queued', progress: 0, message: 'Queued for download...' }
                    : i
            ));

            clearYouTubeInputs();
        } catch (error) {
            const errorMessage = error.response?.data?.error || error.message;
            setUploadQueue(prev => prev.map(i =>
                i.id === item.id
                    ? { ...i, status: 'failed', message: errorMessage }
                    : i
            ));
        }
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

    return (
        <AppLayout>
            {isProcessing && (
                <ProcessingScreen
                    videos={[
                        '/first.mp4',
                        '/robot_animation.mp4'
                    ]}
                    processingStage={processingStage}
                />
            )}

            <div className="upload-page">
                <h1>Upload Video</h1>

                <div className="upload-mode-toggle">
                    <button
                        type="button"
                        className={`mode-btn ${uploadMode === 'local' ? 'active' : ''}`}
                        onClick={() => setUploadMode('local')}
                        disabled={isProcessing}
                    >
                        Local File
                    </button>
                    <button
                        type="button"
                        className={`mode-btn ${uploadMode === 'youtube' ? 'active' : ''}`}
                        onClick={() => setUploadMode('youtube')}
                        disabled={isProcessing}
                    >
                        YouTube Link
                    </button>
                </div>

                {uploadMode === 'local' ? (
                    <div {...getRootProps()} className={`dropzone ${isDragActive ? 'active' : ''}`}>
                        <input {...getInputProps()} />
                        <UploadIcon size={48} color="var(--primary)" />
                        <p className="dropzone-text">
                            {isDragActive ? 'Drop video here...' : 'Drag & drop video here or click to browse'}
                        </p>
                        <p className="dropzone-hint">Supported: MP4, MOV, AVI, MKV, WEBM</p>
                    </div>
                ) : (
                    <div className="youtube-panel">
                        <label className="youtube-label" htmlFor="youtube-url">YouTube URL</label>
                        <div className="youtube-input-row">
                            <input
                                id="youtube-url"
                                type="url"
                                className="youtube-input"
                                placeholder="https://www.youtube.com/watch?v=..."
                                value={youtubeUrl}
                                onChange={(event) => {
                                    setYoutubeUrl(event.target.value);
                                    if (youtubeError) setYoutubeError('');
                                }}
                                disabled={isProcessing}
                            />
                            <button
                                type="button"
                                className="remove-btn youtube-clear-btn"
                                onClick={clearYouTubeInputs}
                                disabled={isProcessing || (!youtubeUrl && !youtubeTitle)}
                                title="Clear link"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <label className="youtube-label" htmlFor="youtube-title">Title (optional)</label>
                        <input
                            id="youtube-title"
                            type="text"
                            className="youtube-input"
                            placeholder="Custom title"
                            value={youtubeTitle}
                            onChange={(event) => setYoutubeTitle(event.target.value)}
                            disabled={isProcessing}
                        />

                        {youtubeError && <p className="youtube-error">{youtubeError}</p>}

                        <button
                            type="button"
                            className="youtube-submit-btn"
                            onClick={handleYouTubeUpload}
                            disabled={isProcessing || !youtubeUrl.trim()}
                        >
                            Download & Upload
                        </button>
                    </div>
                )}

                {uploadQueue.length > 0 && (
                    <div className="upload-queue">
                        <h2>Upload Queue</h2>
                        {uploadQueue.map(item => (
                            <Card key={item.id} className="upload-item">
                                <div className="upload-item-content">
                                    <div className="upload-info">
                                        <div className="upload-filename">{item.displayName || item.file?.name || 'Video upload'}</div>

                                        {/* Byte-upload progress bar (while file is uploading) */}
                                        {['uploading', 'queued', 'downloading', 'downloaded'].includes(item.status) && (
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
                                                        style={{ width: `${item.stagePct ?? STAGE_MAP['uploaded'].pct}%` }}
                                                    />
                                                </div>
                                                <div className="stage-label">
                                                    {item.stageLabel ?? STAGE_MAP['uploaded'].label}
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
                                                        ? (item.stageLabel ?? STAGE_MAP['uploaded'].label)
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
    );
};

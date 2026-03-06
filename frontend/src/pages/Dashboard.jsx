import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '../components/AppLayout';
import { videoAPI, profileAPI } from '../services/api';
import {
    MessageCircle, FileText, Trash2, Clock, Plus,
    Loader, CheckCircle2, AlertCircle, Upload, Video,
    ChevronRight, BarChart3, Users, GraduationCap
} from 'lucide-react';
import './Dashboard.css';
import AudioWaveformPlayer from '../components/AudioWaveformPlayer';

// Extract YouTube video ID from various URL formats
const getYouTubeId = (url) => {
    if (!url) return '';
    const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([^&?\s]+)/);
    return match ? match[1] : '';
};

// Maps backend processing_stage → { pct: %, label: human string } — same as Upload.jsx
const STAGE_MAP = {
    uploaded: { pct: 5, label: 'Starting… 🔄' },
    compressing: { pct: 15, label: 'Compressing Video ⚡' },
    audio_converted: { pct: 35, label: 'Converting to Audio 🎵' },
    transcribed: { pct: 58, label: 'Transcribing Audio 📝' },
    embedded: { pct: 78, label: 'Generating Embeddings 🧠' },
    pdf_generated: { pct: 93, label: 'Creating PDF 📄' },
    completed: { pct: 100, label: 'Completed ✅' },
    failed: { pct: 100, label: 'Failed ❌' },
};

export const Dashboard = () => {
    const navigate = useNavigate();
    const [stats, setStats] = useState({
        total_videos: 0,
        total_queries: 0,
        total_pdfs: 0,
        total_processing_hours: 0,
    });
    const [videos, setVideos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedVideo, setSelectedVideo] = useState(null);
    const [splitPercent, setSplitPercent] = useState(50);
    const workspaceRef = useRef(null);
    const isDragging = useRef(false);

    const handleMouseDown = useCallback((e) => {
        e.preventDefault();
        isDragging.current = true;
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';

        const handleMouseMove = (e) => {
            if (!isDragging.current || !workspaceRef.current) return;
            const rect = workspaceRef.current.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const percent = (x / rect.width) * 100;
            setSplitPercent(Math.min(75, Math.max(25, percent)));
        };

        const handleMouseUp = () => {
            isDragging.current = false;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    }, []);

    const loadData = () => {
        Promise.all([
            profileAPI.getStats(),
            videoAPI.getVideos()
        ])
            .then(([statsRes, videosRes]) => {
                if (statsRes.data) setStats(statsRes.data);
                const vids = videosRes.data?.results || videosRes.data || [];
                setVideos(vids);
                if (vids.length > 0 && !selectedVideo) {
                    const completed = vids.find(v => v.status === 'completed');
                    setSelectedVideo(completed || vids[0]);
                }
            })
            .catch(err => console.error(err))
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        loadData();
        // Broad refresh every 10 s to pick up newly uploaded videos
        const interval = setInterval(loadData, 10000);
        return () => clearInterval(interval);
    }, []);

    // Targeted 3-second per-video status poller — only runs while any video is processing
    useEffect(() => {
        const processingVids = videos.filter(
            v => v.status === 'processing' || v.status === 'uploading'
        );
        if (processingVids.length === 0) return;

        const interval = setInterval(async () => {
            for (const vid of processingVids) {
                try {
                    const res = await videoAPI.getVideoStatus(vid.id);
                    const { status, processing_stage, error_message } = res.data;

                    setVideos(prev => prev.map(v => {
                        if (v.id !== vid.id) return v;
                        const stageInfo = STAGE_MAP[processing_stage] || null;
                        return {
                            ...v,
                            status,
                            processing_stage,
                            error_message,
                            _stagePct: stageInfo?.pct ?? v._stagePct,
                            _stageLabel: stageInfo?.label ?? v._stageLabel,
                        };
                    }));

                    // If the video we're looking at in the detail panel just finished,
                    // update selectedVideo too so the detail panel refreshes immediately.
                    setSelectedVideo(cur => {
                        if (!cur || cur.id !== vid.id) return cur;
                        const stageInfo = STAGE_MAP[processing_stage] || null;
                        return {
                            ...cur,
                            status,
                            processing_stage,
                            error_message,
                            _stagePct: stageInfo?.pct ?? cur._stagePct,
                            _stageLabel: stageInfo?.label ?? cur._stageLabel,
                        };
                    });
                } catch (err) {
                    console.error('Status poll error for video', vid.id, err);
                }
            }
        }, 3000);

        return () => clearInterval(interval);
    }, [videos]);

    const handleDelete = async (videoId, videoTitle) => {
        if (!window.confirm(`Delete "${videoTitle}"?`)) return;
        try {
            await videoAPI.deleteVideo(videoId);
            setVideos(prev => prev.filter(v => v.id !== videoId));
            if (selectedVideo?.id === videoId) setSelectedVideo(null);
            const statsRes = await profileAPI.getStats();
            if (statsRes.data) setStats(statsRes.data);
        } catch (error) {
            console.error('Error deleting video:', error);
            alert('Failed to delete video.');
        }
    };

    // Group videos by status
    const processing = videos.filter(v => v.status === 'processing' || v.status === 'uploading');
    const ready = videos.filter(v => v.status === 'completed');
    const archived = videos.filter(v => v.status === 'failed');

    const formatDuration = (seconds) => {
        if (!seconds) return '';
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${m}:${s.toString().padStart(2, '0')}`;
    };

    const VideoCard = ({ video }) => {
        const isSelected = selectedVideo?.id === video.id;
        const stageInfo = STAGE_MAP[video.processing_stage];
        const stageLabel = video._stageLabel ?? stageInfo?.label ?? video.processing_stage;
        const stagePct = video._stagePct ?? stageInfo?.pct ?? 20;

        return (
            <div
                className={`kanban-card ${isSelected ? 'selected' : ''}`}
                onClick={() => setSelectedVideo(video)}
            >
                <div className="card-thumb">
                    <Video size={16} />
                </div>
                <div className="card-body">
                    <div className="card-title">{video.title}</div>
                    <div className="card-subtitle">
                        {(video.status === 'processing' || video.status === 'uploading') && stageLabel
                            ? stageLabel
                            : new Date(video.upload_date).toLocaleDateString()}
                    </div>
                    {(video.status === 'processing' || video.status === 'uploading') && (
                        <div className="card-progress">
                            <div className="card-progress-bar">
                                <div
                                    className="card-progress-fill card-progress-fill--real"
                                    style={{ width: `${stagePct}%` }}
                                />
                            </div>
                        </div>
                    )}
                    <div className="card-tags">
                        {video.status === 'completed' && <span className="tag tag-ready">Ready</span>}
                        {video.status === 'processing' && <span className="tag tag-urgent">Processing</span>}
                        {video.status === 'uploading' && <span className="tag tag-urgent">Uploading</span>}
                        {video.status === 'failed' && <span className="tag tag-urgent">Failed</span>}
                    </div>
                </div>
                {video.duration_seconds && (
                    <span className="card-duration">{formatDuration(video.duration_seconds)}</span>
                )}
            </div>
        );
    };

    const KanbanColumn = ({ title, count, videos: colVids, emptyText }) => (
        <div className="kanban-column">
            <div className="column-header">
                <span className="column-title">{title}</span>
                <span className="column-count">{count}</span>
                <button className="column-add" onClick={() => navigate('/upload')}>
                    <Plus size={14} />
                </button>
            </div>
            <div className="column-cards">
                {colVids.length === 0 ? (
                    <div className="column-empty">{emptyText}</div>
                ) : (
                    colVids.map(v => <VideoCard key={v.id} video={v} />)
                )}
            </div>
        </div>
    );

    // Generate fake waveform bars for visual effect


    return (
        <AppLayout>
            <div className="dashboard-workspace">
                {/* ── Top Section ── */}
                <div className="workspace-header">
                    <h1>Video Workflow</h1>
                    <button className="week-board-btn" onClick={() => navigate('/history')}>
                        <Clock size={14} />
                        Week board
                    </button>
                </div>

                {/* ── Main Split ── */}
                <div className="workspace-body" ref={workspaceRef} style={{ gridTemplateColumns: `${splitPercent}% 6px 1fr` }}>
                    {/* Left: Kanban Board */}
                    <div className="kanban-board">
                        {loading ? (
                            <div className="kanban-loading">
                                <Loader size={22} className="spin" />
                                <span>Loading workspace...</span>
                            </div>
                        ) : (
                            <div className="kanban-columns">
                                <KanbanColumn
                                    title="Processing"
                                    count={processing.length}
                                    videos={processing}
                                    emptyText="No videos in queue"
                                />
                                <KanbanColumn
                                    title="Ready"
                                    count={ready.length}
                                    videos={ready}
                                    emptyText="No completed videos"
                                />
                                <KanbanColumn
                                    title="Archived"
                                    count={archived.length}
                                    videos={archived}
                                    emptyText="No archived items"
                                />
                            </div>
                        )}
                    </div>

                    {/* Resize Handle */}
                    <div className="resize-handle" onMouseDown={handleMouseDown}>
                        <div className="resize-handle-line" />
                    </div>

                    {/* Right: Detail Panel */}
                    <div className="detail-panel">
                        {selectedVideo ? (
                            <div className="detail-content">
                                <h2 className="detail-title">{selectedVideo.title}</h2>
                                <div className="detail-tags">
                                    <span className={`detail-tag status-${selectedVideo.status}`}>
                                        {selectedVideo.status === 'completed' ? 'Ready' :
                                            selectedVideo.status === 'processing' ? 'Processing' :
                                                selectedVideo.status === 'uploading' ? 'Uploading' : 'Failed'}
                                    </span>
                                    {/* Live stage badge while processing */}
                                    {(selectedVideo.status === 'processing' || selectedVideo.status === 'uploading') && (
                                        <span className="detail-tag detail-tag-stage">
                                            {selectedVideo._stageLabel
                                                ?? STAGE_MAP[selectedVideo.processing_stage]?.label
                                                ?? 'Processing…'}
                                        </span>
                                    )}
                                    <span className="detail-tag editable">Editable tags</span>
                                </div>

                                {/* Stage progress bar in detail panel */}
                                {(selectedVideo.status === 'processing' || selectedVideo.status === 'uploading') && (
                                    <div className="detail-stage-progress">
                                        <div
                                            className="detail-stage-fill"
                                            style={{
                                                width: `${selectedVideo._stagePct
                                                    ?? STAGE_MAP[selectedVideo.processing_stage]?.pct
                                                    ?? 10
                                                    }%`
                                            }}
                                        />
                                    </div>
                                )}

                                {/* Error message for failed videos */}
                                {selectedVideo.status === 'failed' && selectedVideo.error_message && (
                                    <div className="detail-error">
                                        <AlertCircle size={14} />
                                        <span>{selectedVideo.error_message}</span>
                                    </div>
                                )}

                                {/* Video Player Area */}
                                <div className="detail-video-player">
                                    {selectedVideo.youtube_url ? (
                                        <iframe
                                            className="video-iframe"
                                            src={`https://www.youtube.com/embed/${getYouTubeId(selectedVideo.youtube_url)}?rel=0`}
                                            title={selectedVideo.title}
                                            frameBorder="0"
                                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                            allowFullScreen
                                        />
                                    ) : selectedVideo.file ? (
                                        <video
                                            className="video-native"
                                            controls
                                            preload="metadata"
                                            key={selectedVideo.id}
                                        >
                                            <source
                                                src={selectedVideo.file.startsWith('http')
                                                    ? selectedVideo.file
                                                    : `http://localhost:8000${selectedVideo.file}`}
                                                type="video/mp4"
                                            />
                                            Your browser does not support video playback.
                                        </video>
                                    ) : (
                                        <div className="video-thumb-placeholder">
                                            <Video size={32} />
                                            <p style={{ fontSize: 'var(--font-xs)', color: 'var(--text-tertiary)', marginTop: '8px' }}>
                                                Video file not available
                                            </p>
                                        </div>
                                    )}
                                </div>

                                {/* Transcript Preview */}
                                <div className="detail-section">
                                    <h3>Transcript Preview</h3>
                                    <p className="transcript-text">
                                        {selectedVideo.status === 'completed'
                                            ? 'First few sentences of the auto-generated transcript. The AI has processed and analyzed the video content for you to explore...'
                                            : 'Transcript will be available after processing completes.'}
                                        {selectedVideo.status === 'completed' && (
                                            <span className="more-link"> more</span>
                                        )}
                                    </p>
                                </div>

                                {/* Key Takeaways */}
                                {selectedVideo.status === 'completed' && (
                                    <div className="detail-section">
                                        <h3>Key Takeaways</h3>
                                        <ul className="takeaways-list">
                                            <li>AI-extracted key points from the video content</li>
                                            <li>Important topics and concepts discussed</li>
                                            <li>Summary of main themes and conclusions</li>
                                        </ul>
                                    </div>
                                )}

                                {/* Action Buttons */}
                                <div className="detail-actions">
                                    {selectedVideo.status === 'completed' && (
                                        <>
                                            <button
                                                className="action-btn action-chat"
                                                onClick={() => navigate(`/chat/${selectedVideo.id}`)}
                                            >
                                                <MessageCircle size={15} />
                                                Chat with AI
                                            </button>
                                            <button
                                                className="action-btn action-pdf"
                                                onClick={() => navigate(`/pdf/${selectedVideo.id}`)}
                                            >
                                                <FileText size={15} />
                                                Download (PDF)
                                            </button>
                                        </>
                                    )}
                                    <button
                                        className="action-btn action-delete"
                                        onClick={() => handleDelete(selectedVideo.id, selectedVideo.title)}
                                    >
                                        <Trash2 size={15} />
                                        Delete
                                    </button>
                                </div>

                                {/* Study Room Card */}
                                {selectedVideo.status === 'completed' && (
                                    <div
                                        onClick={() => navigate(`/study-room/${selectedVideo.id}`)}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '1rem',
                                            padding: '1rem 1.25rem',
                                            background: 'linear-gradient(135deg, rgba(124,111,247,0.1), rgba(167,139,250,0.05))',
                                            border: '1px solid rgba(124,111,247,0.25)',
                                            borderRadius: '12px',
                                            cursor: 'pointer',
                                            transition: 'all 0.2s',
                                            marginTop: '0.75rem',
                                        }}
                                        onMouseEnter={e => {
                                            e.currentTarget.style.background = 'linear-gradient(135deg, rgba(124,111,247,0.2), rgba(167,139,250,0.1))';
                                            e.currentTarget.style.borderColor = 'rgba(124,111,247,0.5)';
                                            e.currentTarget.style.transform = 'translateY(-1px)';
                                        }}
                                        onMouseLeave={e => {
                                            e.currentTarget.style.background = 'linear-gradient(135deg, rgba(124,111,247,0.1), rgba(167,139,250,0.05))';
                                            e.currentTarget.style.borderColor = 'rgba(124,111,247,0.25)';
                                            e.currentTarget.style.transform = 'translateY(0)';
                                        }}
                                    >
                                        <div style={{
                                            width: '40px',
                                            height: '40px',
                                            background: 'linear-gradient(135deg, #7c6ff7, #a78bfa)',
                                            borderRadius: '10px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            fontSize: '1.1rem',
                                            flexShrink: 0,
                                            boxShadow: '0 0 16px rgba(124,111,247,0.4)',
                                        }}>
                                            🎓
                                        </div>
                                        <div>
                                            <div style={{
                                                fontWeight: 600,
                                                fontSize: '0.9rem',
                                                color: 'var(--text-primary, #f1f0ff)',
                                                marginBottom: '0.2rem',
                                            }}>
                                                Open Study Room
                                            </div>
                                            <div style={{
                                                fontSize: '0.72rem',
                                                color: 'var(--text-secondary, #9b99b8)',
                                            }}>
                                                Watch video · AI Assistant · Timestamps
                                            </div>
                                        </div>
                                        <div style={{
                                            marginLeft: 'auto',
                                            color: 'var(--primary)',
                                            fontSize: '1.1rem',
                                        }}>
                                            →
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="detail-empty">
                                <Video size={40} />
                                <h3>Select a video</h3>
                                <p>Click any video card to see details here.</p>
                                {videos.length === 0 && !loading && (
                                    <button className="upload-cta" onClick={() => navigate('/upload')}>
                                        <Upload size={15} />
                                        Upload Your First Video
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* ── Bottom Stats Strip ── */}
                <div className="stats-strip">
                    <div className="stat-item">
                        <span><strong>{stats.total_videos}</strong> Active Videos</span>
                    </div>
                    <div className="stat-item">
                        <span><strong>{processing.length}</strong> Processing</span>
                    </div>
                    <div className="stat-item">
                        <span><strong>{ready.length}</strong> Ready</span>
                    </div>
                    <div className="stat-item">
                        <span>Avg. Processing Time: <strong>{stats.total_processing_hours > 0 ? `${(stats.total_processing_hours * 60).toFixed(0)}m` : '—'}</strong></span>
                    </div>
                    <div className="stat-item">
                        <span>Questions Asked: <strong>{stats.total_queries}</strong></span>
                    </div>
                </div>
            </div>
        </AppLayout>
    );
};

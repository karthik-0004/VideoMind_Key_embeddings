import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from './Card';
import { Badge } from './Badge';
import { Button } from './Button';
import { MessageCircle, FileText, Trash2, Calendar, GraduationCap } from 'lucide-react';
import './DailyBucket.css';

export const DailyBucket = ({ date, displayDate, count, videos, onDelete, onRefresh }) => {
    const navigate = useNavigate();

    const getStatusBadge = (status) => {
        const variants = {
            completed: 'success',
            processing: 'warning',
            failed: 'error',
            uploading: 'info'
        };
        return <Badge variant={variants[status] || 'info'}>{status}</Badge>;
    };

    const handleDelete = async (videoId, videoTitle) => {
        if (onDelete) {
            await onDelete(videoId, videoTitle);
        }
    };

    return (
        <div className="daily-bucket">
            <div className="bucket-header">
                <div className="bucket-date-info">
                    <Calendar size={24} className="bucket-icon" />
                    <div>
                        <h2 className="bucket-date">{displayDate}</h2>
                        <p className="bucket-subtitle">{date}</p>
                    </div>
                </div>
                <div className="bucket-count">
                    <Badge variant="info">{count} video{count !== 1 ? 's' : ''}</Badge>
                </div>
            </div>

            <div className="bucket-videos">
                {videos.length === 0 ? (
                    <Card>
                        <p style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
                            No videos converted on this day
                        </p>
                    </Card>
                ) : (
                    videos.map(video => (
                        <Card key={video.id} hover className="video-card">
                            <div className="video-info">
                                <h3 className="video-title">{video.title}</h3>
                                <div className="video-meta">
                                    <span className="video-time">
                                        {new Date(video.upload_date).toLocaleTimeString([], {
                                            hour: '2-digit',
                                            minute: '2-digit'
                                        })}
                                    </span>
                                    {getStatusBadge(video.status)}
                                    {video.duration_seconds && (
                                        <span className="video-duration">
                                            {Math.floor(video.duration_seconds / 60)}m {Math.floor(video.duration_seconds % 60)}s
                                        </span>
                                    )}
                                </div>
                            </div>

                            <div className="video-actions">
                                {video.status === 'completed' && (
                                    <>
                                        <Button
                                            size="sm"
                                            variant="secondary"
                                            onClick={() => navigate(`/chat/${video.id}`)}
                                        >
                                            <MessageCircle size={16} />
                                            Chat
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="secondary"
                                            onClick={() => navigate(`/pdf/${video.id}`)}
                                        >
                                            <FileText size={16} />
                                            PDF
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="secondary"
                                            onClick={() => navigate(`/study-room/${video.id}`)}
                                        >
                                            <GraduationCap size={16} />
                                            Study Room
                                        </Button>
                                    </>
                                )}
                                {(video.status === 'failed' || video.status === 'completed') && (
                                    <Button
                                        size="sm"
                                        variant="danger"
                                        onClick={() => handleDelete(video.id, video.title)}
                                    >
                                        <Trash2 size={16} />
                                    </Button>
                                )}
                            </div>
                        </Card>
                    ))
                )}
            </div>
        </div>
    );
};

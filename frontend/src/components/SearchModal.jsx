import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Video, MessageCircle, GraduationCap, FileText, X, Clock } from 'lucide-react';
import { videoAPI } from '../services/api';
import './SearchModal.css';

export const SearchModal = ({ isOpen, onClose }) => {
    const navigate = useNavigate();
    const inputRef = useRef(null);
    const [query, setQuery] = useState('');
    const [videos, setVideos] = useState([]);
    const [loading, setLoading] = useState(false);
    const [selectedIdx, setSelectedIdx] = useState(0);

    // Fetch videos once when modal opens
    useEffect(() => {
        if (!isOpen) return;
        setQuery('');
        setSelectedIdx(0);
        setLoading(true);
        videoAPI.getVideos()
            .then(res => {
                const list = Array.isArray(res.data) ? res.data : res.data.results || [];
                setVideos(list);
            })
            .catch(() => setVideos([]))
            .finally(() => setLoading(false));

        // Focus input after render
        setTimeout(() => inputRef.current?.focus(), 50);
    }, [isOpen]);

    // Filter videos by query
    const filtered = videos.filter(v =>
        v.title.toLowerCase().includes(query.toLowerCase())
    );

    // Reset selection when filter changes
    useEffect(() => { setSelectedIdx(0); }, [query]);

    const handleSelect = useCallback((video) => {
        onClose();
        if (video.status === 'completed' || ['embedded', 'generating_pdf', 'pdf_generated'].includes(video.processing_stage)) {
            navigate(`/study-room/${video.id}`);
        } else {
            navigate('/dashboard');
        }
    }, [navigate, onClose]);

    // Keyboard navigation
    const handleKeyDown = useCallback((e) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelectedIdx(prev => Math.min(prev + 1, filtered.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelectedIdx(prev => Math.max(prev - 1, 0));
        } else if (e.key === 'Enter' && filtered[selectedIdx]) {
            e.preventDefault();
            handleSelect(filtered[selectedIdx]);
        } else if (e.key === 'Escape') {
            onClose();
        }
    }, [filtered, selectedIdx, handleSelect, onClose]);

    if (!isOpen) return null;

    const formatDate = (dateStr) => {
        const d = new Date(dateStr);
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    };

    const getStatusInfo = (video) => {
        if (video.status === 'completed') return { label: 'Ready', className: 'search-status-ready' };
        if (video.status === 'processing') return { label: 'Processing', className: 'search-status-processing' };
        if (video.status === 'failed') return { label: 'Failed', className: 'search-status-failed' };
        return { label: 'Uploading', className: 'search-status-uploading' };
    };

    return (
        <div className="search-overlay" onClick={onClose}>
            <div className="search-modal" onClick={e => e.stopPropagation()}>
                {/* Search Input */}
                <div className="search-input-row">
                    <Search size={16} className="search-input-icon" />
                    <input
                        ref={inputRef}
                        className="search-input"
                        placeholder="Search videos..."
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        onKeyDown={handleKeyDown}
                        autoFocus
                    />
                    <kbd className="search-kbd">ESC</kbd>
                </div>

                {/* Results */}
                <div className="search-results">
                    {loading ? (
                        <div className="search-empty">
                            <div className="search-spinner" />
                            <span>Loading videos...</span>
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="search-empty">
                            <Video size={24} />
                            <span>{query ? 'No videos match your search' : 'No videos found'}</span>
                        </div>
                    ) : (
                        filtered.map((video, i) => {
                            const statusInfo = getStatusInfo(video);
                            const isActive = i === selectedIdx;
                            return (
                                <div
                                    key={video.id}
                                    className={`search-result-item ${isActive ? 'active' : ''}`}
                                    onClick={() => handleSelect(video)}
                                    onMouseEnter={() => setSelectedIdx(i)}
                                >
                                    <div className="search-result-icon">
                                        <Video size={16} />
                                    </div>
                                    <div className="search-result-info">
                                        <div className="search-result-title">{video.title}</div>
                                        <div className="search-result-meta">
                                            <Clock size={10} />
                                            <span>{formatDate(video.upload_date)}</span>
                                            {video.duration_seconds && (
                                                <span>· {Math.floor(video.duration_seconds / 60)}:{String(Math.floor(video.duration_seconds % 60)).padStart(2, '0')}</span>
                                            )}
                                        </div>
                                    </div>
                                    <span className={`search-status ${statusInfo.className}`}>
                                        {statusInfo.label}
                                    </span>
                                    <div className="search-result-actions">
                                        {(video.status === 'completed' || ['embedded', 'generating_pdf', 'pdf_generated'].includes(video.processing_stage)) && (
                                            <>
                                                <button
                                                    className="search-action-btn"
                                                    title="Study Room"
                                                    onClick={e => { e.stopPropagation(); onClose(); navigate(`/study-room/${video.id}`); }}
                                                >
                                                    <GraduationCap size={13} />
                                                </button>
                                                <button
                                                    className="search-action-btn"
                                                    title="Chat"
                                                    onClick={e => { e.stopPropagation(); onClose(); navigate(`/chat/${video.id}`); }}
                                                >
                                                    <MessageCircle size={13} />
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>

                {/* Footer */}
                <div className="search-footer">
                    <span><kbd>↑↓</kbd> Navigate</span>
                    <span><kbd>↵</kbd> Open</span>
                    <span><kbd>ESC</kbd> Close</span>
                </div>
            </div>
        </div>
    );
};

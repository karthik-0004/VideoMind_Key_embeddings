import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AppLayout } from '../components/AppLayout';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { AIChatPanel } from '../components/AIChatPanel';
import { videoAPI } from '../services/api';
import { ArrowLeft, Eraser, FileText, Send, Sparkles, GripVertical } from 'lucide-react';
import './Chat.css';

export const Chat = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const chatStorageKey = `video_chat_messages_${id}`;
    const [video, setVideo] = useState(null);
    const [messages, setMessages] = useState([]);
    const [isMessagesHydrated, setIsMessagesHydrated] = useState(false);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [showAI, setShowAI] = useState(false);
    const messagesEndRef = useRef(null);

    // Draggable divider state
    const [leftWidth, setLeftWidth] = useState(40); // percent
    const isDragging = useRef(false);
    const dragStartX = useRef(0);
    const dragStartWidth = useRef(40);
    const chatBodyRef = useRef(null);

    useEffect(() => {
        videoAPI.getVideo(id)
            .then(res => setVideo(res.data))
            .catch(err => console.error(err));
    }, [id]);

    useEffect(() => {
        setIsMessagesHydrated(false);
        try {
            const savedMessages = localStorage.getItem(chatStorageKey);
            if (savedMessages) {
                const parsed = JSON.parse(savedMessages);
                if (Array.isArray(parsed)) {
                    setMessages(parsed);
                    setIsMessagesHydrated(true);
                    return;
                }
            }

            setMessages([]);
            setIsMessagesHydrated(true);
        } catch (error) {
            console.error('Failed to load saved chat messages:', error);
            setMessages([]);
            setIsMessagesHydrated(true);
        }
    }, [chatStorageKey]);

    useEffect(() => {
        if (!isMessagesHydrated) {
            return;
        }

        try {
            localStorage.setItem(chatStorageKey, JSON.stringify(messages));
        } catch (error) {
            console.error('Failed to save chat messages:', error);
        }
    }, [messages, chatStorageKey, isMessagesHydrated]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // Reset to 40/60 split when AI closes
    useEffect(() => {
        if (!showAI) {
            setLeftWidth(40);
        }
    }, [showAI]);

    const formatTime = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    // Build a YouTube URL that starts at the given second
    const getYouTubeTimestampUrl = (youtubeUrl, secondsFloat) => {
        if (!youtubeUrl || secondsFloat == null) return null;
        const seconds = Math.floor(secondsFloat);
        try {
            // Handle youtu.be short links
            if (youtubeUrl.includes('youtu.be/')) {
                const videoId = youtubeUrl.split('youtu.be/')[1].split(/[?&#]/)[0];
                return `https://www.youtube.com/watch?v=${videoId}&t=${seconds}s`;
            }
            // Handle youtube.com/watch?v=... links
            const url = new URL(youtubeUrl);
            const videoId = url.searchParams.get('v');
            if (videoId) {
                return `https://www.youtube.com/watch?v=${videoId}&t=${seconds}s`;
            }
        } catch (e) {
            // fallback: append &t= directly
            const base = youtubeUrl.split('&t=')[0].split('?t=')[0];
            return `${base}${base.includes('?') ? '&' : '?'}t=${seconds}s`;
        }
        return null;
    };

    const getPdfUrl = (fileUrl) => {
        if (!fileUrl) return '';
        if (fileUrl.startsWith('http')) return fileUrl;
        return `http://localhost:8000${fileUrl}`;
    };

    const handleOpenPdf = async () => {
        try {
            const pdfRes = await videoAPI.getPDF(id);
            const fileUrl = pdfRes?.data?.file;

            if (!fileUrl) {
                alert('PDF is not available yet for this video.');
                return;
            }

            window.open(getPdfUrl(fileUrl), '_blank', 'noopener,noreferrer');
        } catch (error) {
            console.error('Failed to open PDF:', error);
            alert('Could not open PDF right now. Please try again.');
        }
    };

    const handleSend = async () => {
        if (!input.trim() || loading) return;

        const userMessage = { role: 'user', content: input };
        setMessages(prev => [...prev, userMessage]);
        setInput('');
        setLoading(true);

        try {
            const res = await videoAPI.queryVideo(id, input);
            const aiMessage = {
                role: 'assistant',
                content: res.data.answer,
                timestamp_start: res.data.timestamp_start,
                timestamp_end: res.data.timestamp_end,
                youtube_url: res.data.youtube_url || '',
            };
            setMessages(prev => [...prev, aiMessage]);
        } catch (err) {
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: 'Sorry, there was an error processing your question.'
            }]);
        } finally {
            setLoading(false);
        }
    };

    const handleClearChat = () => {
        if (!window.confirm('Clear this chat history?')) {
            return;
        }

        setMessages([]);
        localStorage.removeItem(chatStorageKey);
    };

    // Drag handlers
    const onDividerMouseDown = useCallback((e) => {
        isDragging.current = true;
        dragStartX.current = e.clientX;
        dragStartWidth.current = leftWidth;
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';

        const onMouseMove = (e) => {
            if (!isDragging.current || !chatBodyRef.current) return;
            const bodyWidth = chatBodyRef.current.getBoundingClientRect().width;
            const delta = e.clientX - dragStartX.current;
            const deltaPercent = (delta / bodyWidth) * 100;
            const newWidth = Math.min(70, Math.max(20, dragStartWidth.current + deltaPercent));
            setLeftWidth(newWidth);
        };

        const onMouseUp = () => {
            isDragging.current = false;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
    }, [leftWidth]);

    return (
        <AppLayout>
            <div className={`chat-page ${showAI ? 'chat-split' : ''}`}>
                <div className="chat-header">
                    <Button variant="secondary" onClick={() => navigate('/dashboard')}>
                        <ArrowLeft size={20} />
                        Back
                    </Button>
                    <h2>{video?.title || 'Loading...'}</h2>
                    <Button
                        variant="secondary"
                        onClick={handleOpenPdf}
                        disabled={!video}
                    >
                        <FileText size={18} />
                        PDF
                    </Button>
                    <Button
                        variant="secondary"
                        onClick={handleClearChat}
                        disabled={messages.length === 0}
                    >
                        <Eraser size={18} />
                        Clear Chat
                    </Button>
                    <Button
                        variant={showAI ? 'primary' : 'secondary'}
                        onClick={() => setShowAI(!showAI)}
                    >
                        <Sparkles size={18} />
                        {showAI ? 'Close AI' : 'AI Help'}
                    </Button>
                </div>

                <div className="chat-body" ref={chatBodyRef}>
                    {/* Left Panel — Existing video Q&A */}
                    <Card
                        className="chat-container chat-left-panel"
                        style={showAI ? { width: `${leftWidth}%`, flex: 'none' } : {}}
                    >
                        <div className="messages">
                            {messages.length === 0 && (
                                <div className="empty-state">
                                    Ask any question about this video!
                                </div>
                            )}

                            {messages.map((msg, idx) => (
                                <div key={idx} className={`message ${msg.role}`}>
                                    <div className="message-content">
                                        {msg.content}
                                        {msg.timestamp_start && (() => {
                                            const ytUrl = getYouTubeTimestampUrl(msg.youtube_url, msg.timestamp_start);
                                            const timeLabel = `${formatTime(msg.timestamp_start)} – ${formatTime(msg.timestamp_end)}`;
                                            return (
                                                <div
                                                    className="ts-neon"
                                                    onClick={ytUrl ? () => window.open(ytUrl, '_blank', 'noopener,noreferrer') : undefined}
                                                    title={ytUrl ? `Open on YouTube at ${timeLabel}` : timeLabel}
                                                    style={ytUrl ? { cursor: 'pointer' } : {}}
                                                >
                                                    <div className="ts-ring">
                                                        <span className="ts-emoji">{ytUrl ? '▶️' : '🕰️'}</span>
                                                    </div>
                                                    <div className="ts-content">
                                                        <span className="ts-label">{ytUrl ? 'Watch on YouTube' : 'Timestamp'}</span>
                                                        <span className="ts-time">{timeLabel}</span>
                                                        {ytUrl && (
                                                            <span className="ts-link">Click to open ↗</span>
                                                        )}
                                                        {!ytUrl && (
                                                            <span className="ts-video">{video?.title}</span>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })()}
                                    </div>
                                </div>
                            ))}

                            {loading && (
                                <div className="message assistant">
                                    <div className="message-content">
                                        <div className="typing-indicator">
                                            <span></span><span></span><span></span>
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div ref={messagesEndRef} />
                        </div>

                        <div className="chat-input">
                            <input
                                type="text"
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                                placeholder="Ask a question..."
                                disabled={loading}
                            />
                            <Button onClick={handleSend} disabled={loading || !input.trim()}>
                                <Send size={20} />
                            </Button>
                        </div>
                    </Card>

                    {/* Drag Divider — only when AI panel is open */}
                    {showAI && (
                        <div
                            className="chat-divider"
                            onMouseDown={onDividerMouseDown}
                            title="Drag to resize panels"
                        >
                            <GripVertical size={14} />
                        </div>
                    )}

                    {/* Right Panel — AI Chatbot */}
                    {showAI && (
                        <div
                            className="chat-right-panel"
                            style={{ flex: 1, minWidth: 0 }}
                        >
                            <AIChatPanel videoId={id} onClose={() => setShowAI(false)} />
                        </div>
                    )}
                </div>
            </div>
        </AppLayout>
    );
};

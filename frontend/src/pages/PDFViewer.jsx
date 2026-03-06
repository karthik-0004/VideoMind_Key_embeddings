import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AppLayout } from '../components/AppLayout';
import { Button } from '../components/Button';
import { videoAPI } from '../services/api';
import { ArrowLeft, Download, ExternalLink } from 'lucide-react';
import './PDFViewer.css';

export const PDFViewer = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const [pdf, setPdf] = useState(null);
    const [video, setVideo] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        Promise.all([
            videoAPI.getVideo(id),
            videoAPI.getPDF(id)
        ])
            .then(([videoRes, pdfRes]) => {
                setVideo(videoRes.data);
                setPdf(pdfRes.data);
            })
            .catch(err => console.error(err))
            .finally(() => setLoading(false));
    }, [id]);

    const getPdfUrl = (fileUrl) => {
        if (!fileUrl) return '';
        if (fileUrl.startsWith('http')) return fileUrl;
        return `http://localhost:8000${fileUrl}`;
    };

    const handleDownload = async () => {
        if (pdf?.file) {
            try {
                const pdfUrl = getPdfUrl(pdf.file);
                const response = await fetch(pdfUrl);
                const blob = await response.blob();
                const fileName = video?.title ? `${video.title}.pdf` : 'document.pdf';

                if (window.showSaveFilePicker) {
                    try {
                        const handle = await window.showSaveFilePicker({
                            suggestedName: fileName,
                            types: [{
                                description: 'PDF Document',
                                accept: { 'application/pdf': ['.pdf'] },
                            }],
                        });
                        const writable = await handle.createWritable();
                        await writable.write(blob);
                        await writable.close();
                    } catch (err) {
                        // User cancelled or other error, fallback if not abort
                        if (err.name !== 'AbortError') {
                            console.error('File picker error:', err);
                            // Fallback to default download
                            const link = document.createElement('a');
                            link.href = URL.createObjectURL(blob);
                            link.download = fileName;
                            link.click();
                            URL.revokeObjectURL(link.href);
                        }
                    }
                } else {
                    // Fallback for browsers without File System Access API
                    const link = document.createElement('a');
                    link.href = URL.createObjectURL(blob);
                    link.download = fileName;
                    link.click();
                    URL.revokeObjectURL(link.href);
                }
            } catch (error) {
                console.error('Download failed:', error);
                // Last resort fallback using original URL
                const link = document.createElement('a');
                link.href = getPdfUrl(pdf.file);
                link.download = video?.title || 'document.pdf';
                link.click();
            }
        }
    };

    const handleOpenNewTab = () => {
        if (pdf?.file) {
            window.open(getPdfUrl(pdf.file), '_blank');
        }
    };

    return (
        <AppLayout>
            <div className="pdf-viewer-page">
                <div className="pdf-header">
                    <Button variant="secondary" onClick={() => navigate('/dashboard')}>
                        <ArrowLeft size={20} />
                        Back
                    </Button>
                    <h2>{video?.title || 'PDF Ready'}</h2>
                </div>

                {loading ? (
                    <div className="loading-state">Preparing your document...</div>
                ) : pdf ? (
                    <div style={{
                        flex: 1,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '2rem',
                        textAlign: 'center'
                    }}>
                        <div style={{
                            background: 'white',
                            padding: '3rem',
                            borderRadius: '16px',
                            boxShadow: 'var(--shadow-lg)',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: '1.5rem',
                            maxWidth: '400px',
                            width: '100%'
                        }}>
                            <div style={{
                                width: '80px',
                                height: '80px',
                                background: '#EFF6FF',
                                borderRadius: '50%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: 'var(--primary)'
                            }}>
                                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                                    <polyline points="14 2 14 8 20 8" />
                                </svg>
                            </div>

                            <div>
                                <h3 style={{ margin: '0 0 0.5rem 0', color: 'var(--primary)' }}>Document Ready</h3>
                                <p style={{ margin: 0, color: 'var(--text-secondary)' }}>Your comprehensive study guide has been generated.</p>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%' }}>
                                <Button onClick={handleOpenNewTab} style={{ width: '100%', justifyContent: 'center' }}>
                                    <ExternalLink size={20} />
                                    Open in New Tab
                                </Button>
                                <Button variant="secondary" onClick={handleDownload} style={{ width: '100%', justifyContent: 'center' }}>
                                    <Download size={20} />
                                    Download PDF
                                </Button>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="error-state">
                        PDF not found. Please try regenerating.
                    </div>
                )}
            </div>
        </AppLayout>
    );
};

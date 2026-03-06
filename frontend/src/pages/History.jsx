import React, { useState, useEffect } from 'react';
import { AppLayout } from '../components/AppLayout';
import { DailyBucket } from '../components/DailyBucket';
import { DateNavigator } from '../components/DateNavigator';
import { Button } from '../components/Button';
import { videoAPI } from '../services/api';
import { History as HistoryIcon, RefreshCw } from 'lucide-react';
import './History.css';

export const History = () => {
    const [dailyData, setDailyData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [currentFilter, setCurrentFilter] = useState({ days: 30, filter: 'month' });
    const [refreshing, setRefreshing] = useState(false);

    const loadData = async (params = currentFilter) => {
        try {
            setLoading(true);
            const response = await videoAPI.getVideosByDate(params);
            setDailyData(response.data || []);
        } catch (error) {
            console.error('Error loading daily data:', error);
            setDailyData([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData(currentFilter);
    }, []);

    const handleDateChange = (params) => {
        setCurrentFilter(params);
        loadData(params);
    };

    const handleRefresh = async () => {
        setRefreshing(true);
        await loadData(currentFilter);
        setRefreshing(false);
    };

    const handleDelete = async (videoId, videoTitle) => {
        if (!window.confirm(`Are you sure you want to delete "${videoTitle}"?`)) {
            return;
        }

        try {
            await videoAPI.deleteVideo(videoId);
            // Reload data after deletion
            await loadData(currentFilter);
        } catch (error) {
            console.error('Error deleting video:', error);
            alert('Failed to delete video. Please try again.');
        }
    };

    const totalVideos = dailyData.reduce((sum, day) => sum + day.count, 0);

    return (
        <AppLayout>
            <div className="history-page">
                <div className="history-header">
                    <div className="header-title">
                        <HistoryIcon size={32} />
                        <div>
                            <h1>Conversion History</h1>
                            <p className="header-subtitle">
                                View and manage your video conversions organized by date
                            </p>
                        </div>
                    </div>
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={handleRefresh}
                        disabled={refreshing}
                    >
                        <RefreshCw size={16} className={refreshing ? 'spinning' : ''} />
                        Refresh
                    </Button>
                </div>

                <DateNavigator
                    onDateChange={handleDateChange}
                    selectedRange={currentFilter}
                />

                <div className="history-summary">
                    <p>
                        Showing <strong>{totalVideos}</strong> video{totalVideos !== 1 ? 's' : ''}
                        {currentFilter.filter && ` from ${currentFilter.filter.replace('_', ' ')}`}
                    </p>
                </div>

                {loading ? (
                    <div className="loading-state">
                        <p>Loading your conversion history...</p>
                    </div>
                ) : dailyData.length === 0 ? (
                    <div className="empty-state">
                        <HistoryIcon size={64} className="empty-icon" />
                        <h2>No conversions found</h2>
                        <p>You haven't converted any videos in this time period.</p>
                        <Button variant="primary" onClick={() => window.location.href = '/upload'}>
                            Upload Your First Video
                        </Button>
                    </div>
                ) : (
                    <div className="daily-buckets-container">
                        {dailyData.map((day) => (
                            <DailyBucket
                                key={day.date}
                                date={day.date}
                                displayDate={day.display_date}
                                count={day.count}
                                videos={day.videos}
                                onDelete={handleDelete}
                                onRefresh={() => loadData(currentFilter)}
                            />
                        ))}
                    </div>
                )}
            </div>
        </AppLayout>
    );
};

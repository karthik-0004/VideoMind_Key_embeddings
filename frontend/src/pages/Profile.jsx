import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '../components/AppLayout';
import { Card } from '../components/Card';
import { useAuth } from '../context/AuthContext';
import { profileAPI } from '../services/api';
import { Mail, LogOut, RefreshCw, Shield } from 'lucide-react';
import './Profile.css';

export const Profile = () => {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const [avatarError, setAvatarError] = useState(false);
    const [stats, setStats] = useState({
        total_videos: 0,
        total_queries: 0,
        total_pdfs: 0,
        total_processing_hours: 0,
    });

    useEffect(() => {
        profileAPI.getStats()
            .then(res => setStats(res.data))
            .catch(err => console.error(err));
    }, []);

    const getInitials = (name) => {
        return (name || 'User').split(' ').map(n => n[0]).join('').toUpperCase();
    };

    const handleLogout = () => {
        if (window.confirm('Are you sure you want to sign out?')) {
            logout();
        }
    };

    const handleSwitchAccount = () => {
        if (window.confirm('Switch to a different account? You will be logged out.')) {
            logout();
        }
    };

    return (
        <AppLayout>
            <div className="profile-page">
                <h1>My Account</h1>

                {/* Profile Header */}
                <div className="profile-header-card">
                    <div className="profile-avatar-large">
                        {user?.picture && !avatarError ? (
                            <img
                                src={user.picture}
                                alt={user?.name || 'User'}
                                referrerPolicy="no-referrer"
                                onError={() => setAvatarError(true)}
                            />
                        ) : (
                            <div className="avatar-placeholder">
                                {getInitials(user?.name)}
                            </div>
                        )}
                    </div>

                    <div className="profile-header-info">
                        <h2>{user?.name || 'User'}</h2>
                        <p className="profile-email">
                            <Mail size={20} />
                            {user?.email || 'No email available'}
                        </p>
                        <div className="profile-badge">
                            <Shield size={16} />
                            Secure Account Active
                        </div>
                    </div>
                </div>

                {/* Account Management */}
                <div className="account-section">
                    <h2>Account Management</h2>
                    <div className="account-actions">
                        <div className="action-card" onClick={handleSwitchAccount}>
                            <div className="action-card-icon">
                                <RefreshCw size={24} />
                            </div>
                            <h3>Switch Account</h3>
                            <p>Sign out and log in with a different registered account</p>
                        </div>

                        <div className="action-card" onClick={handleLogout}>
                            <div className="action-card-icon">
                                <LogOut size={24} />
                            </div>
                            <h3>Sign Out</h3>
                            <p>Logout from your current session</p>
                        </div>
                    </div>
                </div>

                {/* Statistics */}
                <div className="stats-section">
                    <h2>Your Activity</h2>
                    <div className="stats-grid">
                        <Card className="stat-card">
                            <div className="stat-icon">🎥</div>
                            <div className="stat-value">{stats.total_videos}</div>
                            <div className="stat-label">Videos Processed</div>
                        </Card>

                        <Card className="stat-card">
                            <div className="stat-icon">💬</div>
                            <div className="stat-value">{stats.total_queries}</div>
                            <div className="stat-label">Questions Asked</div>
                        </Card>

                        <Card className="stat-card">
                            <div className="stat-icon">📄</div>
                            <div className="stat-value">{stats.total_pdfs}</div>
                            <div className="stat-label">PDFs Generated</div>
                        </Card>

                        <Card className="stat-card">
                            <div className="stat-icon">⏱️</div>
                            <div className="stat-value">{stats.total_processing_hours.toFixed(1)}</div>
                            <div className="stat-label">Hours Processed</div>
                        </Card>
                    </div>
                </div>
            </div>
        </AppLayout>
    );
};

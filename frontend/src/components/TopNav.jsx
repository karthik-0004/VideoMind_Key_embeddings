import React, { useState, useRef, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { LayoutDashboard, Video, BarChart3, Clock, User, LogOut, Search, Settings, Sun, Moon } from 'lucide-react';
import './TopNav.css';

export const TopNav = () => {
    const { user, logout } = useAuth();
    const { theme, toggleTheme } = useTheme();
    const navigate = useNavigate();
    const [showDropdown, setShowDropdown] = useState(false);
    const dropdownRef = useRef(null);

    useEffect(() => {
        const handleClickOutside = (e) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
                setShowDropdown(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleLogout = () => {
        if (window.confirm('Are you sure you want to sign out?')) {
            logout();
        }
    };

    const tabs = [
        { path: '/dashboard', label: 'Overview', icon: LayoutDashboard },
        { path: '/upload', label: 'Videos', icon: Video },
        { path: '/profile', label: 'Analytics', icon: BarChart3 },
        { path: '/history', label: 'History', icon: Clock },
    ];

    const getInitials = (name) => {
        return (name || 'U')
            .split(' ')
            .map(p => p[0])
            .join('')
            .slice(0, 2)
            .toUpperCase();
    };

    const displayName = user?.name || 'User';
    const shortName = displayName.length > 10
        ? displayName.slice(0, 8) + '.'
        : displayName;

    return (
        <nav className="topnav">
            <div className="topnav-inner">
                {/* Logo */}
                <div className="topnav-logo" onClick={() => navigate('/dashboard')}>
                    <div className="logo-icon">V</div>
                    <span>VideoMind</span>
                </div>

                {/* Tabs */}
                <div className="topnav-tabs">
                    {tabs.map(tab => (
                        <NavLink
                            key={tab.path}
                            to={tab.path}
                            className={({ isActive }) => `topnav-tab ${isActive ? 'active' : ''}`}
                        >
                            <tab.icon size={15} />
                            <span>{tab.label}</span>
                        </NavLink>
                    ))}
                </div>

                {/* Right side: Search + Settings + User */}
                <div className="topnav-right">
                    <div className="topnav-search">
                        <Search size={14} />
                        <span>Search</span>
                    </div>

                    <button className="topnav-icon-btn theme-toggle" onClick={toggleTheme} title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}>
                        {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
                    </button>

                    <button className="topnav-icon-btn" onClick={() => navigate('/profile')}>
                        <Settings size={16} />
                    </button>

                    {/* User */}
                    <div className="topnav-user" ref={dropdownRef}>
                        <button
                            className="topnav-avatar-btn"
                            onClick={() => setShowDropdown(!showDropdown)}
                        >
                            {user?.picture ? (
                                <img
                                    src={user.picture}
                                    alt={user.name}
                                    className="topnav-avatar-img"
                                    referrerPolicy="no-referrer"
                                    onError={(e) => { e.target.style.display = 'none'; }}
                                />
                            ) : (
                                <div className="topnav-avatar-fallback">
                                    {getInitials(user?.name)}
                                </div>
                            )}
                        </button>
                        <span className="topnav-username">{shortName}</span>

                        {showDropdown && (
                            <div className="topnav-dropdown">
                                <div className="topnav-dropdown-header">
                                    <span className="dropdown-name">{user?.name || 'User'}</span>
                                    <span className="dropdown-email">{user?.email || ''}</span>
                                </div>
                                <div className="topnav-dropdown-divider" />
                                <button className="topnav-dropdown-item" onClick={() => { navigate('/profile'); setShowDropdown(false); }}>
                                    <User size={14} />
                                    My Profile
                                </button>
                                <button className="topnav-dropdown-item logout" onClick={handleLogout}>
                                    <LogOut size={14} />
                                    Sign Out
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </nav>
    );
};

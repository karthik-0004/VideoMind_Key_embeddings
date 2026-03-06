import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GoogleOAuthProvider, GoogleLogin } from '@react-oauth/google';
import { useAuth } from '../context/AuthContext';
import { authAPI } from '../services/api';
import { ShieldCheck, Mail, Lock, UserPlus, LogIn } from 'lucide-react';
import './Login.css';

export const Login = () => {
    const { login, register, isAuthenticated } = useAuth();
    const navigate = useNavigate();
    const [mode, setMode] = useState('login');
    const [form, setForm] = useState({ email: '', password: '', confirmPassword: '' });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const [googleLoading, setGoogleLoading] = useState(false);

    useEffect(() => {
        if (isAuthenticated) {
            navigate('/dashboard');
        }
    }, [isAuthenticated, navigate]);

    const handleChange = (field, value) => {
        setForm(prev => ({ ...prev, [field]: value }));
    };

    const handleGoogleSuccess = async (credentialResponse) => {
        setError('');
        setMessage('');

        if (!credentialResponse?.credential) {
            setError('Google login failed. Please try again.');
            return;
        }

        try {
            setGoogleLoading(true);
            const response = await authAPI.googleLogin(credentialResponse.credential);
            login(response.data);
            setMessage(response.data?.message || 'Google login successful. Redirecting...');
            navigate('/dashboard');
        } catch (requestError) {
            const backendMessage = requestError?.response?.data?.error
                || 'Google login failed. Please try again.';
            setError(backendMessage);
        } finally {
            setGoogleLoading(false);
        }
    };

    const handleGoogleError = () => {
        setError('Google login failed. Please try again.');
    };

    const handleSubmit = async (event) => {
        event.preventDefault();
        setError('');
        setMessage('');

        const email = form.email.trim().toLowerCase();
        const password = form.password;

        if (!email || !password) {
            setError('Email and password are required.');
            return;
        }

        if (!email.endsWith('@gmail.com')) {
            setError('Please use a valid Gmail address.');
            return;
        }

        if (mode === 'register' && form.confirmPassword !== password) {
            setError('Passwords do not match.');
            return;
        }

        try {
            setLoading(true);

            if (mode === 'register') {
                const response = await authAPI.register(email, password, form.confirmPassword);
                register(response.data);
                setMessage('Registration complete. Welcome to VideoMind.');
            } else {
                const response = await authAPI.login(email, password);
                login(response.data);
                setMessage('Login successful. Redirecting...');
            }

            navigate('/dashboard');
        } catch (requestError) {
            const backendMessage = requestError?.response?.data?.error
                || requestError?.response?.data?.email?.[0]
                || requestError?.response?.data?.confirm_password?.[0]
                || requestError?.response?.data?.password?.[0]
                || 'Authentication failed. Please try again.';

            setError(backendMessage);
        } finally {
            setLoading(false);
        }
    };

    return (
        <GoogleOAuthProvider clientId={import.meta.env.VITE_GOOGLE_CLIENT_ID}>
            <div className="login-page">
                <div className="login-container">
                    <div className="login-card">
                        <div className="login-header">
                            <div className="login-logo">
                                <ShieldCheck size={36} />
                            </div>
                            <h1>VideoMind Workspace Access</h1>
                            <p>Secure SaaS authentication for your personal video conversion history</p>
                        </div>

                        <div className="auth-toggle">
                            <button
                                type="button"
                                className={`auth-tab ${mode === 'login' ? 'active' : ''}`}
                                onClick={() => {
                                    setMode('login');
                                    setError('');
                                    setMessage('');
                                }}
                            >
                                <LogIn size={16} /> Login
                            </button>
                            <button
                                type="button"
                                className={`auth-tab ${mode === 'register' ? 'active' : ''}`}
                                onClick={() => {
                                    setMode('register');
                                    setError('');
                                    setMessage('');
                                }}
                            >
                                <UserPlus size={16} /> Register
                            </button>
                        </div>

                        <div className="google-auth-block">
                            <p>Or continue with Google</p>
                            <GoogleLogin
                                onSuccess={handleGoogleSuccess}
                                onError={handleGoogleError}
                                size="large"
                                theme="outline"
                                text="continue_with"
                                shape="rectangular"
                                width="320"
                            />
                            {googleLoading && <span className="google-loading">Verifying Google account...</span>}
                        </div>

                        <form className="login-content" onSubmit={handleSubmit}>
                            <label className="auth-label" htmlFor="email">
                                Gmail Address
                            </label>
                            <div className="auth-input-wrap">
                                <Mail size={16} />
                                <input
                                    id="email"
                                    type="email"
                                    placeholder="you@gmail.com"
                                    value={form.email}
                                    onChange={(event) => handleChange('email', event.target.value)}
                                    autoComplete="email"
                                />
                            </div>

                            <label className="auth-label" htmlFor="password">
                                Password
                            </label>
                            <div className="auth-input-wrap">
                                <Lock size={16} />
                                <input
                                    id="password"
                                    type="password"
                                    placeholder="Enter your password"
                                    value={form.password}
                                    onChange={(event) => handleChange('password', event.target.value)}
                                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                                />
                            </div>

                            {mode === 'register' && (
                                <>
                                    <label className="auth-label" htmlFor="confirmPassword">
                                        Confirm Password
                                    </label>
                                    <div className="auth-input-wrap">
                                        <Lock size={16} />
                                        <input
                                            id="confirmPassword"
                                            type="password"
                                            placeholder="Re-enter password"
                                            value={form.confirmPassword}
                                            onChange={(event) => handleChange('confirmPassword', event.target.value)}
                                            autoComplete="new-password"
                                        />
                                    </div>
                                </>
                            )}

                            {error && <div className="auth-error">{error}</div>}
                            {message && <div className="auth-success">{message}</div>}

                            <button type="submit" className="auth-submit-btn" disabled={loading}>
                                {loading
                                    ? 'Please wait...'
                                    : mode === 'register'
                                        ? 'Create Account'
                                        : 'Login to Workspace'}
                            </button>

                            <p className="login-note">
                                {mode === 'register'
                                    ? 'Already registered? Switch to Login and enter your email/password.'
                                    : 'New user? Register first using your Gmail/password or continue with Google.'}
                            </p>
                        </form>
                    </div>
                </div>
            </div>
        </GoogleOAuthProvider>
    );
};

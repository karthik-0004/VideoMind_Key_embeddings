import React, { createContext, useContext, useState, useEffect } from 'react';
import { authAPI, authStorage } from '../services/api';

const AuthContext = createContext();

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within AuthProvider');
    }
    return context;
};

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    const getUsernameFromEmail = (email) => {
        if (!email || typeof email !== 'string') return '';
        return email.split('@')[0] || '';
    };

    const normalizeUser = (rawUser) => {
        if (!rawUser) return null;

        const picture =
            rawUser.picture ||
            rawUser.avatar ||
            rawUser.avatarUrl ||
            rawUser.imageUrl ||
            '';

        const email = (rawUser.email || '').toLowerCase();
        const username = getUsernameFromEmail(email);

        return {
            name: rawUser.name || rawUser.fullName || email || 'User',
            email,
            username,
            picture,
            googleId: rawUser.googleId || rawUser.sub || '',
        };
    };

    useEffect(() => {
        const initializeAuth = async () => {
            const token = authStorage.getToken();
            if (!token) {
                setLoading(false);
                return;
            }

            try {
                const response = await authAPI.getMe();
                const normalizedUser = normalizeUser(response.data?.user);
                setUser(normalizedUser);
                localStorage.setItem('user', JSON.stringify(normalizedUser));
            } catch (error) {
                authStorage.clearToken();
                localStorage.removeItem('user');
                setUser(null);
            } finally {
                setLoading(false);
            }
        };

        initializeAuth();
    }, []);

    const login = (payload) => {
        const token = payload?.token;
        const userPayload = payload?.user;
        const userData = normalizeUser(userPayload);

        if (!token || !userData) {
            throw new Error('Invalid login payload');
        }

        authStorage.setToken(token);
        setUser(userData);
        localStorage.setItem('user', JSON.stringify(userData));
    };

    const register = (payload) => {
        login(payload);
    };

    const logout = async () => {
        try {
            await authAPI.logout();
        } catch (error) {
            // Ignore logout API failures and clear client session regardless
        }

        setUser(null);
        localStorage.removeItem('user');
        authStorage.clearToken();
        window.location.href = '/login';
    };

    const isAuthenticated = !!user;

    return (
        <AuthContext.Provider value={{ user, loading, isAuthenticated, login, register, logout }}>
            {children}
        </AuthContext.Provider>
    );
};

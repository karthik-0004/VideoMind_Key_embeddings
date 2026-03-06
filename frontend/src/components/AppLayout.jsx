import React from 'react';
import { TopNav } from './TopNav';
import './AppLayout.css';

export const AppLayout = ({ children }) => {
    return (
        <div className="app-layout">
            <div className="app-container">
                <TopNav />
                <main className="main-content">
                    {children}
                </main>
            </div>
        </div>
    );
};

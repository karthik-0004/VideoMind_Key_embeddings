import React from 'react';
import './Badge.css';

export const Badge = ({ children, variant = 'info' }) => {
    return <span className={`badge badge-${variant}`}>{children}</span>;
};

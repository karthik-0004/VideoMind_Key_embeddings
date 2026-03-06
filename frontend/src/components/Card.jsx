import React from 'react';
import './Card.css';

export const Card = ({ children, hover = false, className = '', ...props }) => {
    return (
        <div className={`card glass-card ${hover ? 'card-hover' : ''} ${className}`} {...props}>
            {children}
        </div>
    );
};

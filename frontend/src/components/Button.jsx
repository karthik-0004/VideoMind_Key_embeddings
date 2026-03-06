import React from 'react';
import './Button.css';

export const Button = ({
    children,
    variant = 'primary',
    size = 'md',
    loading = false,
    disabled = false,
    onClick,
    ...props
}) => {
    return (
        <button
            className={`btn btn-${variant} btn-${size} ${loading ? 'btn-loading' : ''}`}
            disabled={disabled || loading}
            onClick={onClick}
            {...props}
        >
            {loading ? <span className="spinner"></span> : children}
        </button>
    );
};

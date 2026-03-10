import React, { useEffect, useRef } from 'react';
import { AlertTriangle, Trash2, LogOut, Info, Eraser, X } from 'lucide-react';
import './ConfirmModal.css';

const VARIANTS = {
    delete:  { icon: Trash2,        className: 'confirm--delete',  confirmLabel: 'Delete' },
    warning: { icon: AlertTriangle,  className: 'confirm--warning', confirmLabel: 'OK' },
    info:    { icon: Info,           className: 'confirm--info',    confirmLabel: 'OK' },
    logout:  { icon: LogOut,         className: 'confirm--logout',  confirmLabel: 'Sign Out' },
    clear:   { icon: Eraser,         className: 'confirm--clear',   confirmLabel: 'Clear' },
};

export const ConfirmModal = ({
    isOpen,
    title,
    message,
    onConfirm,
    onCancel,
    variant = 'delete',
    confirmLabel,
    cancelLabel,
    alertOnly = false,
}) => {
    const modalRef = useRef(null);
    const v = VARIANTS[variant] || VARIANTS.delete;
    const IconComp = v.icon;

    useEffect(() => {
        if (!isOpen) return;
        const handleKey = (e) => {
            if (e.key === 'Escape') (onCancel || onConfirm)();
        };
        document.addEventListener('keydown', handleKey);
        return () => document.removeEventListener('keydown', handleKey);
    }, [isOpen, onCancel, onConfirm]);

    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => { document.body.style.overflow = ''; };
    }, [isOpen]);

    if (!isOpen) return null;

    const handleOverlayClick = (e) => {
        if (e.target === e.currentTarget) (onCancel || onConfirm)();
    };

    return (
        <div className="confirm-overlay" onClick={handleOverlayClick}>
            <div className={`confirm-modal ${v.className}`} ref={modalRef}>
                <button className="confirm-close" onClick={onCancel || onConfirm}>
                    <X size={18} />
                </button>

                <div className="confirm-icon-wrap">
                    <div className="confirm-icon">
                        <IconComp size={28} />
                    </div>
                </div>

                <h3 className="confirm-title">{title}</h3>
                <p className="confirm-message">{message}</p>

                <div className="confirm-actions">
                    {!alertOnly && (
                        <button className="confirm-btn confirm-btn-cancel" onClick={onCancel}>
                            {cancelLabel || 'Cancel'}
                        </button>
                    )}
                    <button className={`confirm-btn confirm-btn-primary ${alertOnly ? 'confirm-btn-full' : ''}`} onClick={onConfirm}>
                        {confirmLabel || v.confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
};

import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import '../styles/ConfirmDialog.scss';

const ConfirmDialog = ({
  isOpen,
  onConfirm,
  onCancel,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  type = 'default' // 'upgrade' or 'downgrade'
}) => {
  // Close on Escape key
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onCancel();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      // Prevent body scroll when dialog is open
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  // Detect if Pro theme is active by checking if .pro-theme class exists in the DOM
  const isProTheme = document.querySelector('.pro-theme') !== null;

  // Detect light/dark theme
  const isLightTheme = document.body.classList.contains('light');

  // Build wrapper class names
  const wrapperClasses = [
    isProTheme && 'pro-theme',
    isLightTheme && 'light'
  ].filter(Boolean).join(' ');

  const dialogContent = (
    <div className={`confirm-dialog-wrapper ${wrapperClasses}`}>
      <div className="confirm-dialog-overlay" onClick={onCancel}>
        <div
          className={`confirm-dialog ${type}`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="confirm-dialog-header">
            <h3>{title}</h3>
          </div>

          <div className="confirm-dialog-body">
            <p>{message}</p>
          </div>

          <div className="confirm-dialog-footer">
            <button
              className="confirm-btn cancel-btn"
              onClick={onCancel}
            >
              {cancelText}
            </button>
            <button
              className={`confirm-btn confirm-action-btn ${type}`}
              onClick={onConfirm}
            >
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(dialogContent, document.body);
};

export default ConfirmDialog;

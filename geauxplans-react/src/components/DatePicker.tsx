import React, { useRef } from 'react';

interface DatePickerProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
  required?: boolean;
  min?: string;
  max?: string;
}

/**
 * DatePicker component that forces calendar selection
 * - Shows calendar icon prominently
 * - Prevents manual typing
 * - Opens calendar on click
 */
const DatePicker: React.FC<DatePickerProps> = ({
  value,
  onChange,
  className = '',
  placeholder = 'Select date',
  required = false,
  min,
  max,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  // Force open the native date picker
  const openCalendar = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (inputRef.current) {
      inputRef.current.showPicker();
    }
  };

  // Prevent keyboard input - force calendar selection only
  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Allow Tab for navigation, Enter/Space to open picker
    if (e.key === 'Tab') return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (inputRef.current) {
        inputRef.current.showPicker();
      }
      return;
    }
    // Block all typing
    e.preventDefault();
  };

  // Prevent paste
  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
  };

  return (
    <div
      className="date-picker-wrapper"
      onClick={openCalendar}
      style={{ position: 'relative', cursor: 'pointer' }}
    >
      {/* Styled date input - visible but read-only appearance */}
      <input
        ref={inputRef}
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onClick={openCalendar}
        min={min}
        max={max}
        required={required}
        className={`form-control ${className}`}
        style={{
          cursor: 'pointer',
          paddingRight: '40px',
        }}
      />
      {/* Calendar icon overlay */}
      <div
        style={{
          position: 'absolute',
          right: '10px',
          top: '50%',
          transform: 'translateY(-50%)',
          pointerEvents: 'none',
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ color: '#6c757d' }}
        >
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
          <line x1="16" y1="2" x2="16" y2="6"></line>
          <line x1="8" y1="2" x2="8" y2="6"></line>
          <line x1="3" y1="10" x2="21" y2="10"></line>
        </svg>
      </div>
    </div>
  );
};

export default DatePicker;

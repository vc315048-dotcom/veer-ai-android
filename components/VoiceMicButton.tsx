import React from 'react';

type VoiceMicButtonProps = {
  isListening?: boolean;
  isLoading?: boolean;
  onClick?: () => void;
  disabled?: boolean;
};

export function VoiceMicButton({
  isListening = false,
  isLoading = false,
  onClick,
  disabled = false,
}: VoiceMicButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || isLoading}
      aria-label={isListening ? 'आवाज़ सुनना बंद करें' : 'बोलने के लिए दबाएँ'}
      style={{
        width: 72,
        height: 72,
        borderRadius: '50%',
        border: 'none',
        background: isListening ? '#dc2626' : '#f97316',
        color: '#ffffff',
        fontSize: 28,
        cursor: disabled || isLoading ? 'not-allowed' : 'pointer',
      }}
    >
      {isLoading ? '…' : isListening ? '■' : '🎙️'}
    </button>
  );
}

export default VoiceMicButton;

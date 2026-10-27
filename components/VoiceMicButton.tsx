import React, { useEffect, useRef } from 'react';

type VoiceMicButtonProps = {
  isListening?: boolean;
  isLoading?: boolean;
  isSpeaking?: boolean;
  onClick: () => void;
  disabled?: boolean;
  autoListenTrigger?: number;
  continuousModeEnabled?: boolean;
  onListeningStateChange?: (text: string) => void;
  onStopPlayback?: () => void;
  onSendMessage?: (text: string) => void;
  onToggleContinuousMode?: () => void;
};

export function VoiceMicButton({
  isListening = false,
  isLoading = false,
  isSpeaking = false,
  onClick,
  disabled = false,
  autoListenTrigger = 0,
  continuousModeEnabled = false,
  onStopPlayback,
  onToggleContinuousMode,
}: VoiceMicButtonProps) {
  const previousTrigger = useRef(autoListenTrigger);

  useEffect(() => {
    if (previousTrigger.current !== autoListenTrigger) {
      previousTrigger.current = autoListenTrigger;

      if (continuousModeEnabled && !isLoading && !isSpeaking) {
        onClick();
      }
    }
  }, [
    autoListenTrigger,
    continuousModeEnabled,
    isLoading,
    isSpeaking,
    onClick,
  ]);

  const handleClick = () => {
    if (disabled || isLoading) return;

    if (isSpeaking) {
      onStopPlayback?.();
      return;
    }

    onClick();
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
      }}
    >
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled || isLoading}
        aria-label={
          isSpeaking
            ? 'आवाज़ रोकें'
            : isListening
              ? 'सुनना बंद करें'
              : 'बोलने के लिए दबाएँ'
        }
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
        {isLoading ? '…' : isListening ? '■' : '🎙'}
      </button>

      <button
        type="button"
        onClick={onToggleContinuousMode}
        aria-pressed={continuousModeEnabled}
        style={{
          padding: '10px 14px',
          borderRadius: 12,
          border: '1px solid #475569',
          background: continuousModeEnabled ? '#166534' : '#334155',
          color: '#ffffff',
        }}
      >
        {continuousModeEnabled
          ? 'लगातार सुनना चालू'
          : 'लगातार सुनना बंद'}
      </button>
    </div>
  );
}

export default VoiceMicButton;

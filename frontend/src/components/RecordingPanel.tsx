import React, { useState, useEffect, useRef } from 'react';
import { useEEGStore } from '../store/eeg';
import { Recording } from '../types';

const CHANNEL_NAMES: Record<string, string> = {
  Fp1: '左前额', Fp2: '右前额', F3: '左额', F4: '右额',
  C3: '左中央', C4: '右中央', P3: '左顶', P4: '右顶',
  O1: '左枕', O2: '右枕'
};

const formatDuration = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const formatTime = (ms: number): string => {
  return new Date(ms).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const RecordingPanel: React.FC = () => {
  const {
    isRecording,
    currentRecordingFrames,
    recordings,
    playbackMode,
    activeRecording,
    playbackState,
    startRecording,
    stopRecording,
    deleteRecording,
    enterPlaybackMode,
    exitPlaybackMode,
    setPlaybackTime,
    togglePlayback,
    setPlaybackPlaying,
    selectedChannel,
    brainState,
    bandPower,
    correlationData,
  } = useEEGStore();

  const [recordingName, setRecordingName] = useState('');
  const [showNameDialog, setShowNameDialog] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const timerRef = useRef<number | null>(null);
  const playbackTimerRef = useRef<number | null>(null);
  // 播放锚点：anchorTime 为锚点时刻的回放时间，anchorWall 为对应的墙钟时间。
  // tick 时按墙钟差推进，暂停 / 跳转只重设锚点，保证恢复播放从正确帧继续、
  // 连续跳转与播放推进共用同一条时间线。
  const anchorRef = useRef<{ time: number; wall: number } | null>(null);

  useEffect(() => {
    if (isRecording) {
      timerRef.current = window.setInterval(() => {
        setElapsedTime(currentRecordingFrames.length * 3);
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setElapsedTime(0);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRecording, currentRecordingFrames.length]);

  useEffect(() => {
    if (playbackState.isPlaying && activeRecording) {
      anchorRef.current = {
        time: useEEGStore.getState().playbackState.currentTime,
        wall: performance.now(),
      };
      playbackTimerRef.current = window.setInterval(() => {
        const state = useEEGStore.getState();
        const rec = state.activeRecording;
        const anchor = anchorRef.current;
        if (!rec || !anchor) return;
        const elapsed = (performance.now() - anchor.wall) / 1000;
        const newTime = anchor.time + elapsed;
        if (newTime >= rec.duration) {
          state.setPlaybackTime(rec.duration);
          state.setPlaybackPlaying(false);
          anchorRef.current = null;
        } else {
          state.setPlaybackTime(newTime);
        }
      }, 100);
    } else {
      if (playbackTimerRef.current) {
        clearInterval(playbackTimerRef.current);
        playbackTimerRef.current = null;
      }
      anchorRef.current = null;
    }
    return () => {
      if (playbackTimerRef.current) clearInterval(playbackTimerRef.current);
    };
  }, [playbackState.isPlaying, activeRecording]);

  const handleStartRecording = () => {
    startRecording();
  };

  const handleStopRecording = () => {
    setShowNameDialog(true);
  };

  const handleConfirmSave = () => {
    stopRecording(recordingName.trim());
    setRecordingName('');
    setShowNameDialog(false);
  };

  const handleCancelSave = () => {
    useEEGStore.setState({
      isRecording: false,
      recordingStartTime: 0,
      currentRecordingFrames: [],
    });
    setShowNameDialog(false);
    setRecordingName('');
  };

  const handlePlayRecording = (recording: Recording) => {
    enterPlaybackMode(recording);
  };

  const reanchor = (time: number) => {
    // 跳转后从新位置继续计时，避免播放锚点把时间拽回旧位置
    anchorRef.current = { time, wall: performance.now() };
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    setPlaybackTime(time);
    reanchor(time);
  };

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!activeRecording) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, x / rect.width));
    const time = percentage * activeRecording.duration;
    setPlaybackTime(time);
    reanchor(time);
  };

  return (
    <div style={{ padding: '16px', background: '#fff', borderRadius: '12px', margin: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
      <h3 style={{ margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ fontSize: '20px' }}>⏺</span>
        录制与回放
      </h3>

      {!playbackMode && (
        <div style={{ marginBottom: '16px' }}>
          {!isRecording ? (
            <button
              onClick={handleStartRecording}
              style={{
                width: '100%',
                padding: '12px',
                background: 'linear-gradient(135deg, #d32f2f, #b71c1c)',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                transition: 'transform 0.2s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.02)')}
              onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
            >
              <span style={{ fontSize: '16px' }}>⏺</span>
              开始录制 ({CHANNEL_NAMES[selectedChannel] || selectedChannel})
            </button>
          ) : (
            <div>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px',
                background: '#ffebee',
                borderRadius: '8px',
                marginBottom: '12px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{
                    width: '10px',
                    height: '10px',
                    borderRadius: '50%',
                    background: '#d32f2f',
                    animation: 'pulse 1s infinite',
                  }} />
                  <span style={{ fontSize: '13px', fontWeight: 500, color: '#d32f2f' }}>录制中</span>
                </div>
                <span style={{ fontSize: '14px', fontWeight: 600, color: '#333' }}>
                  {formatDuration(elapsedTime)} · {currentRecordingFrames.length} 帧
                </span>
              </div>
              <button
                onClick={handleStopRecording}
                style={{
                  width: '100%',
                  padding: '10px',
                  background: '#757575',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                ⏹ 停止录制
              </button>
            </div>
          )}
        </div>
      )}

      {playbackMode && activeRecording && (
        <div style={{
          marginBottom: '16px',
          padding: '14px',
          background: 'linear-gradient(135deg, #e3f2fd, #bbdefb)',
          borderRadius: '10px',
          border: '1px solid #90caf9',
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '12px',
          }}>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#1565c0' }}>
                {activeRecording.name}
              </div>
              <div style={{ fontSize: '11px', color: '#666', marginTop: '2px' }}>
                {CHANNEL_NAMES[activeRecording.channel] || activeRecording.channel} · {formatDuration(activeRecording.duration)}
              </div>
            </div>
            <button
              onClick={exitPlaybackMode}
              style={{
                padding: '6px 12px',
                background: '#fff',
                color: '#1565c0',
                border: '1px solid #90caf9',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              退出回放
            </button>
          </div>

          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            marginBottom: '10px',
          }}>
            <button
              onClick={togglePlayback}
              style={{
                width: '44px',
                height: '44px',
                borderRadius: '50%',
                background: '#1565c0',
                color: '#fff',
                border: 'none',
                fontSize: '18px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              {playbackState.isPlaying ? '⏸' : '▶'}
            </button>

            <div style={{ flex: 1 }}>
              <div
                onClick={handleProgressClick}
                style={{
                  height: '8px',
                  background: '#90caf9',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  position: 'relative',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    background: '#1565c0',
                    width: `${(playbackState.currentTime / activeRecording.duration) * 100}%`,
                    borderRadius: '4px',
                    transition: 'width 0.1s linear',
                  }}
                />
              </div>
              <input
                type="range"
                min="0"
                max={activeRecording.duration}
                step="0.1"
                value={playbackState.currentTime}
                onChange={handleSeek}
                style={{
                  width: '100%',
                  marginTop: '4px',
                  opacity: 0,
                  position: 'absolute',
                  pointerEvents: 'none',
                }}
              />
            </div>

            <span style={{ fontSize: '12px', color: '#666', minWidth: '70px', textAlign: 'right' }}>
              {formatDuration(playbackState.currentTime)} / {formatDuration(activeRecording.duration)}
            </span>
          </div>

          {playbackState.currentFrame && brainState && bandPower && correlationData ? (
            <div>
              <div style={{
                display: 'flex',
                gap: '8px',
                flexWrap: 'wrap',
                padding: '8px',
                background: 'rgba(255,255,255,0.5)',
                borderRadius: '6px',
                marginBottom: '6px',
              }}>
                <span style={{ fontSize: '11px', color: '#1976d2' }}>专注: {brainState.focus.toFixed(0)}</span>
                <span style={{ fontSize: '11px', color: '#388e3c' }}>放松: {brainState.relaxation.toFixed(0)}</span>
                <span style={{ fontSize: '11px', color: '#d32f2f' }}>疲劳: {brainState.fatigue.toFixed(0)}</span>
                <span style={{ fontSize: '11px', color: '#666' }}>|</span>
                <span style={{ fontSize: '11px', color: '#1565c0' }}>α: {bandPower.alpha.toFixed(2)}</span>
                <span style={{ fontSize: '11px', color: '#e53935' }}>β: {bandPower.beta.toFixed(2)}</span>
                <span style={{ fontSize: '11px', color: '#2e7d32' }}>θ: {bandPower.theta.toFixed(2)}</span>
              </div>
              <div style={{
                display: 'flex',
                gap: '8px',
                flexWrap: 'wrap',
                padding: '8px',
                background: 'rgba(255,255,255,0.5)',
                borderRadius: '6px',
              }}>
                <span style={{ fontSize: '11px', color: '#666', fontWeight: 500 }}>相关度:</span>
                {correlationData.correlations
                  .filter(c => c.channel !== correlationData.targetChannel)
                  .slice(0, 3)
                  .map((c, i) => (
                    <span key={i} style={{ fontSize: '11px', color: '#6a1b9a' }}>
                      {c.channel}: {(Math.abs(c.correlation) * 100).toFixed(0)}%
                    </span>
                  ))}
              </div>
            </div>
          ) : (
            <div style={{
              padding: '10px',
              background: 'rgba(255,255,255,0.5)',
              borderRadius: '6px',
              fontSize: '11px',
              color: '#666',
            }}>
              当前时间点 / 通道 {selectedChannel} 无回放帧，已清空评分（不沿用旧通道数据）
            </div>
          )}
        </div>
      )}

      <div>
        <div style={{
          fontSize: '12px',
          color: '#666',
          marginBottom: '8px',
          fontWeight: 500,
        }}>
          历史录制 ({recordings.length})
        </div>
        {recordings.length === 0 ? (
          <div style={{
            padding: '24px',
            textAlign: 'center',
            color: '#999',
            fontSize: '13px',
            border: '1px dashed #e0e0e0',
            borderRadius: '8px',
          }}>
            暂无录制记录
          </div>
        ) : (
          <div style={{ maxHeight: '280px', overflow: 'auto' }}>
            {[...recordings].reverse().map((recording) => (
              <div
                key={recording.id}
                style={{
                  padding: '12px',
                  borderRadius: '8px',
                  border: activeRecording?.id === recording.id
                    ? '2px solid #1565c0'
                    : '1px solid #e0e0e0',
                  marginBottom: '8px',
                  background: activeRecording?.id === recording.id ? '#e3f2fd' : '#fff',
                }}
              >
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  marginBottom: '6px',
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: '13px',
                      fontWeight: 600,
                      color: '#333',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}>
                      {recording.name}
                    </div>
                    <div style={{ fontSize: '11px', color: '#999', marginTop: '2px' }}>
                      {formatTime(recording.startTime)} · {CHANNEL_NAMES[recording.channel] || recording.channel}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                    <button
                      onClick={() => handlePlayRecording(recording)}
                      style={{
                        padding: '4px 10px',
                        background: activeRecording?.id === recording.id ? '#1565c0' : '#f5f5f5',
                        color: activeRecording?.id === recording.id ? '#fff' : '#1565c0',
                        border: 'none',
                        borderRadius: '4px',
                        fontSize: '11px',
                        fontWeight: 500,
                        cursor: 'pointer',
                      }}
                    >
                      {activeRecording?.id === recording.id ? '回放中' : '▶ 回放'}
                    </button>
                    <button
                      onClick={() => deleteRecording(recording.id)}
                      style={{
                        padding: '4px 8px',
                        background: '#ffebee',
                        color: '#d32f2f',
                        border: 'none',
                        borderRadius: '4px',
                        fontSize: '11px',
                        cursor: 'pointer',
                      }}
                    >
                      🗑
                    </button>
                  </div>
                </div>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}>
                  <span style={{ fontSize: '11px', color: '#666' }}>
                    时长: {formatDuration(recording.duration)} · {recording.frames.length} 帧
                  </span>
                  <span style={{ fontSize: '11px', color: '#999' }}>
                    {recording.channel}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showNameDialog && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }}>
          <div style={{
            background: '#fff',
            padding: '24px',
            borderRadius: '12px',
            width: '320px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
          }}>
            <h4 style={{ margin: '0 0 16px', fontSize: '16px', color: '#333' }}>
              保存录制
            </h4>
            <input
              type="text"
              value={recordingName}
              onChange={(e) => setRecordingName(e.target.value)}
              placeholder="输入录制名称（可选）"
              autoFocus
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid #e0e0e0',
                borderRadius: '8px',
                fontSize: '14px',
                marginBottom: '16px',
                boxSizing: 'border-box',
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleConfirmSave();
              }}
            />
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button
                onClick={handleCancelSave}
                style={{
                  padding: '8px 16px',
                  background: '#f5f5f5',
                  color: '#666',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '13px',
                  cursor: 'pointer',
                }}
              >
                取消
              </button>
              <button
                onClick={handleConfirmSave}
                style={{
                  padding: '8px 16px',
                  background: '#1565c0',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.1); }
        }
      `}</style>
    </div>
  );
};

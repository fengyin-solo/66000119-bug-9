import React from 'react';
import { useEEGStore } from '../store/eeg';

const CHANNEL_NAMES: Record<string, string> = {
  Fp1: '左前额', Fp2: '右前额', F3: '左额', F4: '右额',
  C3: '左中央', C4: '右中央', P3: '左顶', P4: '右顶',
  O1: '左枕', O2: '右枕'
};

const ScoreBar: React.FC<{ label: string; value: number; color: string; icon: string }> = ({ label, value, color, icon }) => {
  return (
    <div style={{ marginBottom: '14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
        <span style={{ fontSize: '13px', fontWeight: 500, color: '#333', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span>{icon}</span>
          {label}
        </span>
        <span style={{ fontSize: '16px', fontWeight: 700, color }}>{value.toFixed(1)}</span>
      </div>
      <div style={{ height: '10px', background: '#e0e0e0', borderRadius: '5px', overflow: 'hidden' }}>
        <div
          style={{
            height: '100%',
            width: `${Math.min(100, Math.max(0, value))}%`,
            background: color,
            borderRadius: '5px',
            transition: 'width 0.5s ease-out',
          }}
        />
      </div>
    </div>
  );
};

export const BrainStateDashboard: React.FC = () => {
  const { brainState, selectedChannel, playbackMode, activeRecording, playbackState } = useEEGStore();
  const channelName = CHANNEL_NAMES[selectedChannel] || selectedChannel;

  if (!brainState) {
    return (
      <div style={{ padding: '16px', background: '#fff', borderRadius: '12px', margin: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
        <div style={{ marginBottom: '16px', padding: '16px', background: 'linear-gradient(135deg, #1565c0, #0d47a1)', borderRadius: '10px', color: '#fff', textAlign: 'center' }}>
          <div style={{ fontSize: '11px', opacity: 0.8, marginBottom: '4px' }}>当前关注通道</div>
          <div style={{ fontSize: '28px', fontWeight: 800, letterSpacing: '2px' }}>{selectedChannel}</div>
          <div style={{ fontSize: '12px', opacity: 0.8, marginTop: '2px' }}>{channelName}</div>
        </div>
        <h3 style={{ margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span>🧠</span>
          {playbackMode ? '回放脑状态' : '实时脑状态'}
          {playbackMode && <span style={{ fontSize: '12px', color: '#1565c0', fontWeight: 500 }}>⏮ 回放中</span>}
        </h3>
        <div style={{ color: '#999', padding: '40px 0', textAlign: 'center' }}>
          {playbackMode
            ? (activeRecording && selectedChannel !== activeRecording.channel
              ? `${selectedChannel} 在当前帧无评分数据`
              : '当前时间点暂无帧数据，未沿用旧评分')
            : '等待数据中...'}
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '16px', background: '#fff', borderRadius: '12px', margin: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
      <div style={{
        marginBottom: '16px',
        padding: '16px',
        background: playbackMode
          ? 'linear-gradient(135deg, #6a1b9a, #4a148c)'
          : 'linear-gradient(135deg, #1565c0, #0d47a1)',
        borderRadius: '10px',
        color: '#fff',
        textAlign: 'center',
        boxShadow: playbackMode
          ? '0 4px 12px rgba(106, 27, 154, 0.4)'
          : '0 4px 12px rgba(21, 101, 192, 0.4)',
        transition: 'all 0.3s ease',
      }}>
        <div style={{ fontSize: '11px', opacity: 0.85, marginBottom: '4px' }}>
          {playbackMode ? '回放通道' : '当前关注通道'}
        </div>
        <div style={{ fontSize: '32px', fontWeight: 800, letterSpacing: '2px' }}>{selectedChannel}</div>
        <div style={{ fontSize: '13px', opacity: 0.85, marginTop: '2px' }}>{channelName}</div>
        {playbackMode && activeRecording && (
          <div style={{ fontSize: '11px', opacity: 0.7, marginTop: '6px' }}>
            📼 {activeRecording.name} · {playbackState.currentTime.toFixed(1)}s
          </div>
        )}
      </div>

      <h3 style={{ margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        <span>🧠</span>
        {playbackMode ? '回放脑状态' : '实时脑状态'}
        {playbackMode && <span style={{ fontSize: '12px', color: '#1565c0', fontWeight: 500 }}>⏮ 回放模式</span>}
      </h3>

      <div
        style={{
          padding: '20px',
          borderRadius: '12px',
          background: `linear-gradient(135deg, ${brainState.statusColor}15, ${brainState.statusColor}08)`,
          border: `2px solid ${brainState.statusColor}`,
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div>
          <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>当前状态</div>
          <div style={{ fontSize: '32px', fontWeight: 800, color: brainState.statusColor, letterSpacing: '2px' }}>
            {brainState.statusLabel}
          </div>
        </div>
        <div
          style={{
            width: '60px',
            height: '60px',
            borderRadius: '50%',
            background: brainState.statusColor,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '30px',
            boxShadow: `0 0 20px ${brainState.statusColor}40`,
            animation: 'pulse 2s infinite',
          }}
        >
          {brainState.status === 'focused' ? '🎯' : brainState.status === 'relaxed' ? '🍃' : brainState.status === 'fatigued' ? '😴' : '🧘'}
        </div>
      </div>

      <ScoreBar label="专注度" value={brainState.focus} color="#1976d2" icon="🎯" />
      <ScoreBar label="放松度" value={brainState.relaxation} color="#388e3c" icon="🍃" />
      <ScoreBar label="疲劳度" value={brainState.fatigue} color="#d32f2f" icon="😴" />

      <div style={{ marginTop: '16px', paddingTop: '12px', borderTop: '1px solid #eee', fontSize: '11px', color: '#999', textAlign: 'right' }}>
        最后更新: {new Date(brainState.timestamp).toLocaleTimeString()}
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.08); opacity: 0.85; }
        }
      `}</style>
    </div>
  );
};

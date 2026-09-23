import React from 'react';
import { useEEGStore } from '../store/eeg';

const CHANNELS = ['Fp1','Fp2','F3','F4','C3','C4','P3','P4','O1','O2'];
const CHANNEL_NAMES: Record<string, string> = {
  Fp1: '左前额', Fp2: '右前额', F3: '左额', F4: '右额',
  C3: '左中央', C4: '右中央', P3: '左顶', P4: '右顶',
  O1: '左枕', O2: '右枕'
};

export const ChannelSelector: React.FC = () => {
  const { selectedChannel, setChannel, playbackMode, activeRecording } = useEEGStore();

  return (
    <div style={{ padding: '16px' }}>
      <h3 style={{ margin: '0 0 12px', fontSize: '14px', color: '#90caf9' }}>通道选择</h3>
      <div style={{ marginBottom: '16px', padding: '12px', background: 'rgba(21, 101, 192, 0.2)', borderRadius: '8px', border: '2px solid #1565c0' }}>
        <div style={{ fontSize: '11px', color: '#90caf9', marginBottom: '4px' }}>当前关注</div>
        <div style={{ fontSize: '24px', fontWeight: 800, color: '#fff', letterSpacing: '1px' }}>{selectedChannel}</div>
        <div style={{ fontSize: '12px', color: '#90caf9', marginTop: '2px' }}>{CHANNEL_NAMES[selectedChannel]}</div>
        {playbackMode && activeRecording && (
          <div style={{ fontSize: '11px', color: selectedChannel === activeRecording.channel ? '#ffd54f' : '#ce93d8', marginTop: '4px' }}>
            {selectedChannel === activeRecording.channel
              ? `📼 录制通道 · 切换通道将按该时间线重算`
              : `录制通道为 ${activeRecording.channel}，当前为波形重算结果`}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
        {CHANNELS.map(ch => (
          <button
            key={ch}
            onClick={() => setChannel(ch)}
            title={CHANNEL_NAMES[ch]}
            style={{
              padding: selectedChannel === ch ? '8px 14px' : '6px 12px',
              borderRadius: '16px',
              border: selectedChannel === ch ? '2px solid #64b5f6' : '1px solid #37474f',
              background: selectedChannel === ch ? '#1565c0' : '#1e293b',
              color: selectedChannel === ch ? '#fff' : '#94a3b8',
              cursor: 'pointer',
              fontSize: selectedChannel === ch ? '13px' : '12px',
              fontWeight: selectedChannel === ch ? 700 : 400,
              transition: 'all 0.2s ease',
              boxShadow: selectedChannel === ch ? '0 2px 8px rgba(21, 101, 192, 0.5)' : 'none',
              transform: selectedChannel === ch ? 'scale(1.05)' : 'scale(1)'
            }}
          >
            {ch}
          </button>
        ))}
      </div>
    </div>
  );
};

import React from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, Legend } from 'recharts';
import { useEEGStore } from '../store/eeg';

const CHANNEL_NAMES: Record<string, string> = {
  Fp1: '左前额', Fp2: '右前额', F3: '左额', F4: '右额',
  C3: '左中央', C4: '右中央', P3: '左顶', P4: '右顶',
  O1: '左枕', O2: '右枕'
};

export const CorrelationChart: React.FC = () => {
  const { correlationData, selectedChannel, playbackMode } = useEEGStore();
  const channelName = CHANNEL_NAMES[selectedChannel] || selectedChannel;

  if (!correlationData) {
    return (
      <div style={{ padding: '16px', background: '#fff', borderRadius: '12px', margin: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
        <h3 style={{ margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '20px' }}>🔗</span>
          <span>{selectedChannel}</span>
          <span style={{ fontSize: '13px', color: '#666', fontWeight: 400 }}>{channelName} · 通道相关分析</span>
          {playbackMode && <span style={{ fontSize: '12px', color: '#1565c0', fontWeight: 500 }}>⏮ 回放中</span>}
        </h3>
        <div style={{ color: '#999', padding: '40px 0', textAlign: 'center' }}>
          {playbackMode ? `当前时间点 ${selectedChannel} 通道无帧，相关分析已清空` : '等待数据中...'}
        </div>
      </div>
    );
  }

  const chartData = correlationData.correlations
    .filter(c => c.channel !== selectedChannel)
    .map(c => ({
      name: c.channel,
      nameCn: CHANNEL_NAMES[c.channel] || c.channel,
      correlation: Math.abs(c.correlation) * 100,
      coherence: c.coherence * 100,
      isTarget: c.channel === selectedChannel
    }));

  const getCorrelationColor = (value: number) => {
    if (value >= 80) return '#2e7d32';
    if (value >= 60) return '#689f38';
    if (value >= 40) return '#f9a825';
    if (value >= 20) return '#ef6c00';
    return '#c62828';
  };

  return (
    <div style={{ padding: '16px', background: '#fff', borderRadius: '12px', margin: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
      <h3 style={{ margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '20px' }}>🔗</span>
        <span>{selectedChannel}</span>
        <span style={{ fontSize: '13px', color: '#666', fontWeight: 400 }}>{channelName} · 通道相关分析</span>
        {playbackMode && <span style={{ fontSize: '12px', color: '#1565c0', fontWeight: 500 }}>⏮ 回放模式</span>}
      </h3>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
        {chartData.slice(0, 3).map((item, i) => (
          <div key={i} style={{ flex: 1, minWidth: '120px', padding: '12px', borderRadius: '8px', background: `linear-gradient(135deg, ${getCorrelationColor(item.correlation)}15, ${getCorrelationColor(item.correlation)}08)`, border: `1px solid ${getCorrelationColor(item.correlation)}30` }}>
            <div style={{ fontSize: '11px', color: '#666', marginBottom: '4px' }}>与 {item.name} 相关度</div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: getCorrelationColor(item.correlation) }}>{item.correlation.toFixed(1)}%</div>
            <div style={{ fontSize: '11px', color: '#999', marginTop: '2px' }}>{item.nameCn}</div>
          </div>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={250}>
        <BarChart data={chartData} barGap={4}>
          <XAxis dataKey="name" tick={{ fontSize: 10 }} />
          <YAxis tick={{ fontSize: 10 }} domain={[0, 100]} />
          <Tooltip
            formatter={(value: number, name: string) => [
              `${value.toFixed(1)}%`,
              name === 'correlation' ? '相关性' : '相干性'
            ]}
            labelFormatter={(label: string) => `${label} (${CHANNEL_NAMES[label] || label})`}
          />
          <Legend wrapperStyle={{ fontSize: '11px' }} />
          <Bar dataKey="correlation" name="相关性" radius={[4, 4, 0, 0]}>
            {chartData.map((d, i) => (
              <Cell key={i} fill={getCorrelationColor(d.correlation)} />
            ))}
          </Bar>
          <Bar dataKey="coherence" name="Alpha相干性" fill="#1565c0" radius={[4, 4, 0, 0]} opacity={0.7} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

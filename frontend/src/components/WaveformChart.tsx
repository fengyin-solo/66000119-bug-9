import React, { useEffect, useState, useRef } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { useEEGStore } from '../store/eeg';
import axios from 'axios';

const CHANNEL_NAMES: Record<string, string> = {
  Fp1: '左前额', Fp2: '右前额', F3: '左额', F4: '右额',
  C3: '左中央', C4: '右中央', P3: '左顶', P4: '右顶',
  O1: '左枕', O2: '右枕'
};

export const WaveformChart: React.FC = () => {
  const {
    eegData, selectedChannel, isRecording, playbackMode,
  } = useEEGStore();
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState(false);
  const intervalRef = useRef<number | null>(null);

  const fetchEEG = async () => {
    const state = useEEGStore.getState();
    if (state.playbackMode) return;
    const requestedChannel = state.selectedChannel;
    setLoading(true);
    try {
      const { data } = await axios.get(`/api/eeg/sample/${requestedChannel}?duration=3`);
      // 响应返回时若已进入回放或已切换通道，丢弃过期响应，不覆盖当前面板状态
      const latest = useEEGStore.getState();
      if (latest.playbackMode || latest.selectedChannel !== requestedChannel) return;
      if (!data?.eeg || !data?.bands || !data?.brainState || !data?.correlation) {
        throw new Error('invalid response');
      }
      latest.setEEGData(data.eeg);
      latest.setBandPower(data.bands);
      latest.setBrainState(data.brainState);
      latest.setCorrelationData(data.correlation);
      if (latest.isRecording) {
        latest.addRecordingFrame(data.eeg, data.bands, data.brainState, data.correlation);
      }
      setFetchError(false);
    } catch {
      // 请求失败：保留原有数据/回放状态，不用本地随机数据顶替；录制中也不补假帧
      setFetchError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (playbackMode) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }
    fetchEEG();
    intervalRef.current = window.setInterval(fetchEEG, 3000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [selectedChannel, playbackMode]);

  const chartData = eegData?.data[selectedChannel]?.map((v: number, i: number) => ({
    t: eegData.time[i]?.toFixed(3), value: v.toFixed(4)
  })) || [];

  const channelName = CHANNEL_NAMES[selectedChannel] || selectedChannel;

  return (
    <div style={{ padding: '16px', background: '#fff', borderRadius: '12px', margin: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
      <h3 style={{ margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ fontSize: '20px' }}>📈</span>
        <span>{selectedChannel}</span>
        <span style={{ fontSize: '13px', color: '#666', fontWeight: 400 }}>{channelName} · 波形图</span>
        {isRecording && (
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: '#d32f2f', fontWeight: 500 }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#d32f2f', animation: 'pulse 1s infinite' }} />
            录制中
          </span>
        )}
        {playbackMode && (
          <span style={{ fontSize: '12px', color: '#1565c0', fontWeight: 500 }}>⏮ 回放模式</span>
        )}
        {loading && !playbackMode && <span style={{ fontSize: '12px', color: '#999' }}>刷新中...</span>}
        {fetchError && !playbackMode && (
          <span style={{ fontSize: '12px', color: '#d32f2f', fontWeight: 500 }}>接口请求失败，保留当前数据</span>
        )}
      </h3>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={chartData}>
          <XAxis dataKey="t" tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 10 }} /><Tooltip />
          <Line type="monotone" dataKey="value" stroke="#1565c0" dot={false} strokeWidth={1.5} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

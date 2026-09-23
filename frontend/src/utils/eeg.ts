import { EEGData, BandPower, BrainState, CorrelationData } from '../types';

const ALL_CHANNELS = ['Fp1', 'Fp2', 'F3', 'F4', 'C3', 'C4', 'P3', 'P4', 'O1', 'O2'];

// Goertzel：单个目标频率的能量，避免引入额外 FFT 依赖
const goertzelPower = (x: number[], targetFreq: number, sampleRate: number): number => {
  const n = x.length;
  if (n === 0) return 0;
  const k = (2 * Math.PI * targetFreq) / sampleRate;
  const coeff = 2 * Math.cos(k);
  let q1 = 0, q2 = 0;
  for (let i = 0; i < n; i++) {
    const q0 = coeff * q1 - q2 + x[i];
    q2 = q1;
    q1 = q0;
  }
  return (q1 * q1 + q2 * q2 - coeff * q1 * q2) / (n * n);
};

const BAND_RANGES: Record<keyof BandPower, [number, number]> = {
  delta: [0.5, 4],
  theta: [4, 8],
  alpha: [8, 13],
  beta: [13, 30],
  gamma: [30, 45],
};

// 由时域信号确定性估计频段能量：在频带内多点（1Hz 步长）求 Goertzel 能量并求和，
// 避免单点评估在周期信号上因 DFT 正交性漏能量（与后端 Welch 频带积分对齐）
export const computeBandPowerFromSignal = (
  channelData: number[],
  sampleRate: number,
): BandPower => {
  const result = {} as BandPower;
  (Object.keys(BAND_RANGES) as (keyof BandPower)[]).forEach((band) => {
    const [low, high] = BAND_RANGES[band];
    let power = 0;
    let count = 0;
    for (let f = low; f <= high + 1e-9; f += 1) {
      power += goertzelPower(channelData, f, sampleRate);
      count += 1;
    }
    result[band] = (power / count) * 1000;
  });
  return result;
};

// 确定性脑状态：评分只取决于频段构成与帧时间戳，不含随机量
export const computeBrainStateFromSignal = (
  channelData: number[],
  sampleRate: number,
  timestamp: number,
): BrainState => {
  const bands = computeBandPowerFromSignal(channelData, sampleRate);
  const total = bands.delta + bands.theta + bands.alpha + bands.beta + bands.gamma + 1e-10;
  const focus = Math.min(100, Math.max(0, (bands.beta / total) * 320));
  const relaxation = Math.min(100, Math.max(0, (bands.alpha / total) * 320));
  const fatigue = Math.min(100, Math.max(0, (bands.theta / total) * 320));
  const scores = { focused: focus, relaxed: relaxation, fatigued: fatigue };
  const maxScore = Math.max(...Object.values(scores));
  let status: BrainState['status'] = 'neutral';
  let statusLabel = '平稳';
  let statusColor = '#757575';
  if (maxScore >= 40) {
    const maxKey = Object.keys(scores).find(
      (k) => scores[k as keyof typeof scores] === maxScore,
    ) as keyof typeof scores;
    status = maxKey;
    if (status === 'focused') { statusLabel = '专注'; statusColor = '#1976d2'; }
    else if (status === 'relaxed') { statusLabel = '放松'; statusColor = '#388e3c'; }
    else { statusLabel = '疲劳'; statusColor = '#d32f2f'; }
  }
  return {
    focus: Math.round(focus * 10) / 10,
    relaxation: Math.round(relaxation * 10) / 10,
    fatigue: Math.round(fatigue * 10) / 10,
    status,
    statusLabel,
    statusColor,
    timestamp,
  };
};

// 确定性通道相关分析（回放切通道时可复现，不使用随机数）
export const computeCorrelation = (targetChannel: string, eegData: EEGData): CorrelationData => {
  const targetData = eegData.data[targetChannel] ?? [];
  const correlations = ALL_CHANNELS.map((ch) => {
    if (ch === targetChannel) {
      return { channel: ch, targetChannel, correlation: 1.0, coherence: 1.0 };
    }
    const chData = eegData.data[ch] ?? [];
    let sumXY = 0, sumX = 0, sumY = 0, sumX2 = 0, sumY2 = 0;
    const n = Math.min(targetData.length, chData.length);
    for (let i = 0; i < n; i++) {
      sumXY += targetData[i] * chData[i];
      sumX += targetData[i];
      sumY += chData[i];
      sumX2 += targetData[i] * targetData[i];
      sumY2 += chData[i] * chData[i];
    }
    const denom = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
    const corr = denom === 0 ? 0 : (n * sumXY - sumX * sumY) / denom;
    const coherence = Math.min(1, Math.abs(corr) * 0.6 + 0.3);
    return {
      channel: ch,
      targetChannel,
      correlation: Math.round(corr * 10000) / 10000,
      coherence: Math.round(coherence * 10000) / 10000,
    };
  });
  return { targetChannel, correlations };
};

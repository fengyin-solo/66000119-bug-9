import { BandPower, BrainState, CorrelationData, EEGData } from '../types';

export const ALL_CHANNELS = ['Fp1', 'Fp2', 'F3', 'F4', 'C3', 'C4', 'P3', 'P4', 'O1', 'O2'];

export const BAND_RANGES: Record<keyof BandPower, [number, number]> = {
  delta: [0.5, 4],
  theta: [4, 8],
  alpha: [8, 13],
  beta: [13, 30],
  gamma: [30, 100],
};

/**
 * 从原始脑电数据按通道做确定性分析。回放切通道时，同一帧的任何通道都能得到
 * 与该帧时间线一致的频段能量 / 脑状态评分，不依赖再次请求，也不引入随机数，
 * 因此同一帧同一通道每次得到的结果完全相同。
 */

const mean = (xs: number[]): number => {
  if (xs.length === 0) return 0;
  let s = 0;
  for (let i = 0; i < xs.length; i++) s += xs[i];
  return s / xs.length;
};

/**
 * DFT 旋转因子表，按 (数据长度, 最大 bin) 缓存，索引 [k * n + i]。
 * 回放每帧长度固定（256Hz × 3s），首帧计算后后续切帧 / 切通道无需重复三角函数。
 */
interface Twiddle {
  n: number;
  cos: Float64Array;
  sin: Float64Array;
}
const twiddleCache = new Map<string, Twiddle>();

const getTwiddle = (n: number, maxBin: number): Twiddle => {
  const key = `${n}:${maxBin}`;
  const cached = twiddleCache.get(key);
  if (cached) return cached;
  const cos = new Float64Array((maxBin + 1) * n);
  const sin = new Float64Array((maxBin + 1) * n);
  for (let k = 0; k <= maxBin; k++) {
    const base = k * n;
    for (let i = 0; i < n; i++) {
      const angle = (2 * Math.PI * k * i) / n;
      cos[base + i] = Math.cos(angle);
      sin[base + i] = Math.sin(angle);
    }
  }
  const twiddle = { n, cos, sin };
  twiddleCache.set(key, twiddle);
  return twiddle;
};

/** 一次求出 bin 1..maxBin 的实部 / 虚部。 */
const dftBins = (xs: number[], maxBin: number): { re: Float64Array; im: Float64Array } => {
  const n = xs.length;
  const { cos, sin } = getTwiddle(n, maxBin);
  const re = new Float64Array(maxBin + 1);
  const im = new Float64Array(maxBin + 1);
  for (let k = 1; k <= maxBin; k++) {
    const base = k * n;
    let sr = 0;
    let si = 0;
    for (let i = 0; i < n; i++) {
      const x = xs[i];
      sr += x * cos[base + i];
      si -= x * sin[base + i];
    }
    re[k] = sr;
    im[k] = si;
  }
  return { re, im };
};

/**
 * 频段能量：用 DFT 在各频段内对功率谱求和。结果为相对能量，用于脑状态评分
 * 与频段柱状图展示，回放中对同一段数据稳定可复现。
 */
export const computeBandPowerFromSignal = (signal: number[], sampleRate: number): BandPower => {
  const empty = { delta: 0, theta: 0, alpha: 0, beta: 0, gamma: 0 };
  const n = signal.length;
  if (n === 0) return empty;

  // 去直流，保证低频能量不被均值主导
  const avg = mean(signal);
  const centered = new Array<number>(n);
  for (let i = 0; i < n; i++) centered[i] = signal[i] - avg;

  const maxFreq = Math.min(100, sampleRate / 2);
  const maxBin = Math.max(1, Math.floor((maxFreq * n) / sampleRate));
  const { re, im } = dftBins(centered, maxBin);
  const power = new Float64Array(maxBin + 1);
  for (let k = 1; k <= maxBin; k++) power[k] = (re[k] * re[k] + im[k] * im[k]) / (n * n);

  const result = { ...empty } as BandPower;
  (Object.keys(BAND_RANGES) as (keyof BandPower)[]).forEach((name) => {
    const [low, high] = BAND_RANGES[name];
    const kLow = Math.max(1, Math.ceil((low * n) / sampleRate));
    const kHigh = Math.min(maxBin, Math.floor((Math.min(high, maxFreq) * n) / sampleRate));
    let sum = 0;
    for (let k = kLow; k <= kHigh; k++) sum += power[k];
    result[name] = sum;
  });
  return result;
};

/**
 * 由频段能量推断专注 / 放松 / 疲劳评分。确定性计算，无随机扰动，
 * 保证同一帧切换通道后评分与当前帧严格对应。
 */
export const deriveBrainState = (bands: BandPower, timestamp: number): BrainState => {
  const total = bands.delta + bands.theta + bands.alpha + bands.beta + bands.gamma + 1e-10;
  const focus = Math.min(100, Math.max(0, (bands.beta / total) * 300));
  const relaxation = Math.min(100, Math.max(0, (bands.alpha / total) * 300));
  const fatigue = Math.min(100, Math.max(0, (bands.theta / total) * 300));

  const scores: Array<[BrainState['status'], number]> = [
    ['focused', focus],
    ['relaxed', relaxation],
    ['fatigued', fatigue],
  ];
  let status: BrainState['status'] = 'neutral';
  let statusLabel = '平稳';
  let statusColor = '#757575';
  const top = scores.reduce((a, b) => (b[1] > a[1] ? b : a));
  if (top[1] >= 50) {
    status = top[0];
    if (status === 'focused') {
      statusLabel = '专注';
      statusColor = '#1976d2';
    } else if (status === 'relaxed') {
      statusLabel = '放松';
      statusColor = '#388e3c';
    } else {
      statusLabel = '疲劳';
      statusColor = '#d32f2f';
    }
  }

  const round1 = (v: number) => Math.round(v * 10) / 10;
  return {
    focus: round1(focus),
    relaxation: round1(relaxation),
    fatigue: round1(fatigue),
    status,
    statusLabel,
    statusColor,
    timestamp,
  };
};

const pearson = (xs: number[], ys: number[]): number => {
  const n = Math.min(xs.length, ys.length);
  if (n === 0) return 0;
  let mx = 0;
  let my = 0;
  for (let i = 0; i < n; i++) {
    mx += xs[i];
    my += ys[i];
  }
  mx /= n;
  my /= n;
  let num = 0;
  let dx2 = 0;
  let dy2 = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    num += dx * dy;
    dx2 += dx * dx;
    dy2 += dy * dy;
  }
  const den = Math.sqrt(dx2 * dy2);
  return den === 0 ? 0 : num / den;
};

/**
 * 以 targetChannel 为关注通道，从同一帧的原始多通道数据计算相关性与 alpha
 * 相干性。结果确定可复现，使相关分析面板跟随通道切换。
 */
export const deriveCorrelation = (targetChannel: string, eeg: EEGData): CorrelationData => {
  const target = eeg.data[targetChannel];
  const channels = eeg.channels.length > 0 ? eeg.channels : ALL_CHANNELS;
  const n = target ? target.length : 0;
  const sr = eeg.sample_rate;
  const kLow = n > 0 ? Math.max(1, Math.ceil((8 * n) / sr)) : 0;
  const kHigh = n > 0 ? Math.min(Math.floor(n / 2), Math.floor((13 * n) / sr)) : 0;
  const twiddle = n > 0 ? getTwiddle(n, kHigh) : null;
  const dftChannel = (data: number[]) => {
    const re = new Float64Array(kHigh + 1);
    const im = new Float64Array(kHigh + 1);
    if (!twiddle) return { re, im };
    for (let k = kLow; k <= kHigh; k++) {
      const base = k * n;
      let sr2 = 0;
      let si = 0;
      for (let i = 0; i < n; i++) {
        sr2 += data[i] * twiddle.cos[base + i];
        si -= data[i] * twiddle.sin[base + i];
      }
      re[k] = sr2;
      im[k] = si;
    }
    return { re, im };
  };

  const targetDft = target ? dftChannel(target) : null;

  const correlations = channels.map((ch) => {
    if (ch === targetChannel || !target || !targetDft) {
      return { channel: ch, targetChannel, correlation: 1, coherence: 1 };
    }
    const other = eeg.data[ch];
    if (!other || other.length === 0) {
      return { channel: ch, targetChannel, correlation: 0, coherence: 0 };
    }
    const correlation = Math.round(pearson(target, other) * 10000) / 10000;

    // alpha 频段（8~13Hz）相干性：alpha bin 互功率 / 自功率几何平均
    const otherDft = dftChannel(other);
    let cross = 0;
    let powX = 0;
    let powY = 0;
    for (let k = kLow; k <= kHigh; k++) {
      const rx = targetDft.re[k];
      const ix = targetDft.im[k];
      const ry = otherDft.re[k];
      const iy = otherDft.im[k];
      cross += Math.abs(rx * ry + ix * iy);
      powX += rx * rx + ix * ix;
      powY += ry * ry + iy * iy;
    }
    const cohDen = Math.sqrt(powX * powY);
    const coherence = cohDen === 0 ? 0 : cross / cohDen;

    return {
      channel: ch,
      targetChannel,
      correlation,
      coherence: Math.round(Math.max(0, Math.min(1, coherence)) * 10000) / 10000,
    };
  });
  return { targetChannel, correlations };
};

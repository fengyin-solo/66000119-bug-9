import { RecordingFrame } from '../types';
import { computeBandPowerFromSignal, deriveBrainState, deriveCorrelation } from './eegAnalysis';

/**
 * 回放时间线上的“视图帧”：由某个录制帧 + 关注通道派生。
 * 通道与录制帧原通道一致时直接复用录制时保存的结果；否则从该帧原始脑电
 * 数据按新通道重新推导，保证专注 / 放松 / 疲劳、频段、相关度与当前帧时间线
 * 严格对应。
 */
export interface PlaybackView {
  frame: RecordingFrame;
  eeg: RecordingFrame['eeg'];
  bands: RecordingFrame['bands'];
  brainState: RecordingFrame['brainState'];
  correlation: RecordingFrame['correlation'];
}

/**
 * 按时间线查找帧：取 relativeTime <= time 的最后一帧。
 * time 落在第一帧之前时返回 null（此时不应沿用旧帧数据）。
 */
export const resolveFrameAt = (frames: RecordingFrame[], time: number): RecordingFrame | null => {
  if (frames.length === 0 || time < frames[0].relativeTime) return null;
  let frame: RecordingFrame | null = null;
  for (const f of frames) {
    if (f.relativeTime <= time) frame = f;
    else break;
  }
  // 最后一帧覆盖到录制结束，循环播放到 duration 仍展示该帧
  return frame ?? frames[frames.length - 1];
};

/**
 * 由帧与关注通道派生视图。通道在该帧中没有波形数据（无帧可依）时返回 null，
 * 调用方必须据此清空评分，而不是沿用上一个通道的结果。
 */
export const deriveView = (frame: RecordingFrame | null, channel: string): PlaybackView | null => {
  if (!frame) return null;
  const signal = frame.eeg.data[channel];
  if (!signal || signal.length === 0) return null;

  if (frame.correlation.targetChannel === channel) {
    return {
      frame,
      eeg: frame.eeg,
      bands: frame.bands,
      brainState: frame.brainState,
      correlation: frame.correlation,
    };
  }

  // 评分时间戳沿用该帧时间线，避免“评分与当前帧时间对不上”
  const bands = computeBandPowerFromSignal(signal, frame.eeg.sample_rate);
  return {
    frame,
    eeg: frame.eeg,
    bands,
    brainState: deriveBrainState(bands, frame.brainState.timestamp),
    correlation: deriveCorrelation(channel, frame.eeg),
  };
};

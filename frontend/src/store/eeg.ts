import { create } from 'zustand';
import { EEGData, BandPower, BrainState, CorrelationData, Recording, RecordingFrame, PlaybackState } from '../types';
import {
  computeBandPowerFromSignal,
  computeBrainStateFromSignal,
  computeCorrelation,
} from '../utils/eeg';
const STORAGE_KEY = 'eeg_recordings';

const loadRecordings = (): Recording[] => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
};

const saveRecordings = (recordings: Recording[]) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(recordings));
  } catch {}
};

// 时间线上 currentTime 对应的最新一帧；首帧之前返回 null（无帧不能沿用旧数据）
const resolveFrame = (recording: Recording, time: number): RecordingFrame | null => {
  let frame: RecordingFrame | null = null;
  for (const f of recording.frames) {
    if (f.relativeTime <= time + 1e-6) {
      frame = f;
    } else {
      break;
    }
  }
  return frame;
};

interface PlaybackSnapshot {
  eegData: EEGData | null;
  bandPower: BandPower | null;
  brainState: BrainState | null;
  correlationData: CorrelationData | null;
}

const EMPTY_SNAPSHOT: PlaybackSnapshot = {
  eegData: null,
  bandPower: null,
  brainState: null,
  correlationData: null,
};

// 同一时间线、同一帧下，按关注通道派生面板数据：
// - 录制通道直接使用录制时保存的响应
// - 其他通道由该帧原始波形确定性重算，不沿用旧通道评分
// - 通道无数据或无帧时返回空快照
const deriveSnapshot = (frame: RecordingFrame | null, channel: string): PlaybackSnapshot => {
  if (!frame) return EMPTY_SNAPSHOT;
  if (frame.correlation.targetChannel === channel) {
    return {
      eegData: frame.eeg,
      bandPower: frame.bands,
      brainState: frame.brainState,
      correlationData: frame.correlation,
    };
  }
  const channelData = frame.eeg.data[channel];
  if (!channelData) return { ...EMPTY_SNAPSHOT, eegData: frame.eeg };
  const sampleRate = frame.eeg.sample_rate;
  return {
    eegData: frame.eeg,
    bandPower: computeBandPowerFromSignal(channelData, sampleRate),
    brainState: computeBrainStateFromSignal(channelData, sampleRate, frame.brainState.timestamp),
    correlationData: computeCorrelation(channel, frame.eeg),
  };
};

interface EEGState {
  eegData: EEGData | null;
  selectedChannel: string;
  bandPower: BandPower | null;
  isStreaming: boolean;
  brainState: BrainState | null;
  correlationData: CorrelationData | null;
  isRecording: boolean;
  recordingStartTime: number;
  currentRecordingFrames: RecordingFrame[];
  recordings: Recording[];
  playbackMode: boolean;
  activeRecording: Recording | null;
  liveChannel: string;
  playbackState: PlaybackState;
  setEEGData: (d: EEGData | null) => void;
  setChannel: (c: string) => void;
  setBandPower: (b: BandPower | null) => void;
  setStreaming: (v: boolean) => void;
  setBrainState: (s: BrainState | null) => void;
  setCorrelationData: (c: CorrelationData | null) => void;
  startRecording: () => void;
  stopRecording: (name: string) => void;
  addRecordingFrame: (eeg: EEGData, bands: BandPower, brainState: BrainState, correlation: CorrelationData) => void;
  deleteRecording: (id: string) => void;
  enterPlaybackMode: (recording: Recording) => void;
  exitPlaybackMode: () => void;
  setPlaybackTime: (time: number) => void;
  togglePlayback: () => void;
  setPlaybackPlaying: (playing: boolean) => void;
}

export const useEEGStore = create<EEGState>((set, get) => ({
  eegData: null,
  selectedChannel: 'Fp1',
  bandPower: null,
  isStreaming: false,
  brainState: null,
  correlationData: null,
  isRecording: false,
  recordingStartTime: 0,
  currentRecordingFrames: [],
  recordings: loadRecordings(),
  playbackMode: false,
  activeRecording: null,
  liveChannel: 'Fp1',
  playbackState: {
    isPlaying: false,
    currentTime: 0,
    currentFrame: null,
  },
  setEEGData: (d) => set({ eegData: d }),
  setChannel: (c) => {
    // 回放中切通道：时间线不动，只按新通道重新派生当前帧快照
    const { playbackMode, activeRecording, playbackState } = get();
    set({ selectedChannel: c });
    if (playbackMode && activeRecording) {
      const frame = resolveFrame(activeRecording, playbackState.currentTime);
      set({
        playbackState: { ...playbackState, currentFrame: frame },
        ...deriveSnapshot(frame, c),
      });
    }
  },
  setBandPower: (b) => set({ bandPower: b }),
  setStreaming: (v) => set({ isStreaming: v }),
  setBrainState: (s) => set({ brainState: s }),
  setCorrelationData: (c) => set({ correlationData: c }),
  startRecording: () => {
    set({
      isRecording: true,
      recordingStartTime: Date.now(),
      currentRecordingFrames: [],
      playbackMode: false,
      activeRecording: null,
      ...EMPTY_SNAPSHOT,
    });
  },
  stopRecording: (name: string) => {
    const { currentRecordingFrames, recordingStartTime, selectedChannel } = get();
    if (currentRecordingFrames.length === 0) {
      set({ isRecording: false, currentRecordingFrames: [] });
      return;
    }
    const endTime = Date.now();
    const duration = (endTime - recordingStartTime) / 1000;
    const newRecording: Recording = {
      id: `rec_${endTime}`,
      name: name || `录制 ${new Date(recordingStartTime).toLocaleString()}`,
      channel: selectedChannel,
      startTime: recordingStartTime,
      endTime,
      duration,
      frames: currentRecordingFrames,
    };
    const recordings = [...get().recordings, newRecording];
    saveRecordings(recordings);
    set({
      isRecording: false,
      recordingStartTime: 0,
      currentRecordingFrames: [],
      recordings,
    });
  },
  addRecordingFrame: (eeg, bands, brainState, correlation) => {
    const { isRecording, recordingStartTime, currentRecordingFrames } = get();
    if (!isRecording) return;
    const relativeTime = (Date.now() - recordingStartTime) / 1000;
    const frame: RecordingFrame = { relativeTime, eeg, bands, brainState, correlation };
    set({ currentRecordingFrames: [...currentRecordingFrames, frame] });
  },
  deleteRecording: (id) => {
    const recordings = get().recordings.filter(r => r.id !== id);
    saveRecordings(recordings);
    const { activeRecording, liveChannel } = get();
    if (activeRecording?.id === id) {
      // 删除正在回放的录制：一并清理回放临时状态并回到实时通道，其余录制保留
      set({
        recordings,
        playbackMode: false,
        activeRecording: null,
        selectedChannel: liveChannel,
        playbackState: { isPlaying: false, currentTime: 0, currentFrame: null },
        ...EMPTY_SNAPSHOT,
      });
    } else {
      set({ recordings });
    }
  },
  enterPlaybackMode: (recording) => {
    if (recording.frames.length === 0) return;
    const { selectedChannel, playbackMode } = get();
    const channel = recording.channel;
    const startTime = recording.frames[0].relativeTime;
    const frame = recording.frames[0];
    set({
      playbackMode: true,
      activeRecording: recording,
      // 记住进入回放前的实时通道，退出时恢复；回放从录制通道开始
      liveChannel: playbackMode ? get().liveChannel : selectedChannel,
      selectedChannel: channel,
      playbackState: {
        isPlaying: false,
        currentTime: startTime,
        currentFrame: frame,
      },
      ...deriveSnapshot(frame, channel),
    });
  },
  exitPlaybackMode: () => {
    // 回到实时页面：清理所有回放临时面板数据并恢复实时通道，录制记录不受影响
    set({
      playbackMode: false,
      activeRecording: null,
      selectedChannel: get().liveChannel,
      playbackState: {
        isPlaying: false,
        currentTime: 0,
        currentFrame: null,
      },
      ...EMPTY_SNAPSHOT,
    });
  },
  setPlaybackTime: (time) => {
    const { activeRecording, selectedChannel, playbackState } = get();
    if (!activeRecording || activeRecording.frames.length === 0) return;
    // 连续跳转、播放推进统一走这里：时间钳制在录制范围内
    const clamped = Math.max(0, Math.min(time, activeRecording.duration));
    const frame = resolveFrame(activeRecording, clamped);
    set({
      playbackState: {
        ...playbackState,
        currentTime: clamped,
        currentFrame: frame,
      },
      ...deriveSnapshot(frame, selectedChannel),
    });
  },
  togglePlayback: () => {
    const { playbackState, activeRecording } = get();
    if (!activeRecording) return;
    if (!playbackState.isPlaying && activeRecording.frames.length > 0) {
      // 已在结尾（暂停后再播放）：回到首帧重新播放，而不是停在越界的上一帧
      if (playbackState.currentTime >= activeRecording.duration - 1e-6) {
        get().setPlaybackTime(activeRecording.frames[0].relativeTime);
      }
    }
    set({
      playbackState: {
        ...get().playbackState,
        isPlaying: !get().playbackState.isPlaying,
      },
    });
  },
  setPlaybackPlaying: (playing) => {
    set({
      playbackState: {
        ...get().playbackState,
        isPlaying: playing,
      },
    });
  },
}));

import { create } from 'zustand';
import { EEGData, BandPower, BrainState, CorrelationData, Recording, RecordingFrame, PlaybackState } from '../types';
import { deriveView, resolveFrameAt } from '../utils/playback';

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

interface EEGState {
  eegData: EEGData | null;
  selectedChannel: string;
  liveChannel: string;
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
  liveChannel: 'Fp1',
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
  playbackState: {
    isPlaying: false,
    currentTime: 0,
    currentFrame: null,
  },
  setEEGData: (d) => set({ eegData: d }),
  setChannel: (c) => {
    const { playbackMode, activeRecording, playbackState } = get();
    if (playbackMode && activeRecording) {
      // 通道切换与时间跳转走同一条时间线：按当前时间重新派生新通道的视图，
      // 新通道在该帧无数据时清空评分，绝不沿用旧通道结果。
      const frame = resolveFrameAt(activeRecording.frames, playbackState.currentTime);
      const view = deriveView(frame, c);
      set({
        selectedChannel: c,
        playbackState: {
          ...playbackState,
          currentFrame: frame,
        },
        eegData: view ? view.eeg : null,
        bandPower: view ? view.bands : null,
        brainState: view ? view.brainState : null,
        correlationData: view ? view.correlation : null,
      });
      return;
    }
    set({ selectedChannel: c });
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
      // 删除的正是当前回放：彻底回到实时页并恢复进入回放前的关注通道。
      // recordings 已先落盘，其它已有录制不受影响。
      set({
        recordings,
        playbackMode: false,
        activeRecording: null,
        playbackState: { isPlaying: false, currentTime: 0, currentFrame: null },
        selectedChannel: liveChannel,
        eegData: null,
        bandPower: null,
        brainState: null,
        correlationData: null,
      });
    } else {
      set({ recordings });
    }
  },
  enterPlaybackMode: (recording) => {
    if (recording.frames.length === 0) return;
    const { selectedChannel, playbackMode } = get();
    // 记录实时页当前关注通道，退出回放时恢复；从实时页首次进入时保存，
    // 在回放中切换到另一条录制则沿用已有快照。
    const liveChannel = playbackMode ? get().liveChannel : selectedChannel;
    const channel = recording.channel;
    const firstFrame = recording.frames[0];
    // 时间线起点对齐第一帧，暂停 / 播放 / 跳转都以同一时间为准
    const startTime = firstFrame.relativeTime;
    const view = deriveView(firstFrame, channel);
    set({
      playbackMode: true,
      activeRecording: recording,
      liveChannel,
      selectedChannel: channel,
      playbackState: {
        isPlaying: false,
        currentTime: startTime,
        currentFrame: firstFrame,
      },
      eegData: view ? view.eeg : null,
      bandPower: view ? view.bands : null,
      brainState: view ? view.brainState : null,
      correlationData: view ? view.correlation : null,
    });
  },
  exitPlaybackMode: () => {
    const { liveChannel } = get();
    // 回到实时页：清理全部回放临时视图与播放状态，恢复进入前的关注通道。
    // 不清空 recordings，已有录制保留。
    set({
      playbackMode: false,
      activeRecording: null,
      selectedChannel: liveChannel,
      playbackState: {
        isPlaying: false,
        currentTime: 0,
        currentFrame: null,
      },
      eegData: null,
      bandPower: null,
      brainState: null,
      correlationData: null,
    });
  },
  setPlaybackTime: (time) => {
    const { activeRecording, selectedChannel, playbackState } = get();
    if (!activeRecording || activeRecording.frames.length === 0) return;
    const clamped = Math.max(0, Math.min(activeRecording.duration, time));
    const frame = resolveFrameAt(activeRecording.frames, clamped);
    const view = deriveView(frame, selectedChannel);
    // 通道变更、播放推进、连续跳转共用此路径；无帧时视图字段全部置空
    set({
      playbackState: {
        ...playbackState,
        currentTime: clamped,
        currentFrame: frame,
      },
      eegData: view ? view.eeg : null,
      bandPower: view ? view.bands : null,
      brainState: view ? view.brainState : null,
      correlationData: view ? view.correlation : null,
    });
  },
  togglePlayback: () => {
    const { playbackState, activeRecording } = get();
    if (!playbackState.isPlaying && activeRecording && playbackState.currentTime >= activeRecording.duration) {
      // 已播放到末尾再按播放：从第一帧重新开始
      const firstTime = activeRecording.frames[0]?.relativeTime ?? 0;
      get().setPlaybackTime(firstTime);
      set({ playbackState: { ...get().playbackState, isPlaying: true } });
      return;
    }
    // 只切换播放标志，不改动 currentTime / 当前帧，
    // 因此暂停后恢复一定从暂停时的帧继续
    set({
      playbackState: {
        ...playbackState,
        isPlaying: !playbackState.isPlaying,
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

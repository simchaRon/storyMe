import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { useCallback, useEffect, useRef, useState } from 'react';

import { discardRecordingFile } from './recordingFile';

export type RecorderPhase = 'ready' | 'recording' | 'review';
/** A translation key for what went wrong, or null. */
export type RecorderProblem = 'record.noPermission' | 'record.failed' | 'record.tooShort' | null;

type Options = {
  /** A recording shorter than this is thrown away (it is probably a mistake). */
  minSeconds: number;
  /** The recording stops by itself at this length. */
  maxSeconds: number;
};

/**
 * Records the microphone, lets the user listen to the result, and keeps the temporary file under control.
 * Used by the "read a story aloud" screen and the "record a voice sample" screen.
 *
 * Rules this hook keeps:
 * - The microphone never starts after the user left the screen, even if they left while the phone was asking
 *   for permission or while the recorder was getting ready.
 * - When the user leaves, the microphone is stopped, the audio mode is put back for playback, and the
 *   temporary recording file is deleted from the phone.
 * - A second tap while something is starting or stopping is ignored.
 */
export function useSpeechRecorder({ minSeconds, maxSeconds }: Options) {
  const [phase, setPhase] = useState<RecorderPhase>('ready');
  const [problem, setProblem] = useState<RecorderProblem>(null);
  const [uri, setUri] = useState<string | null>(null);
  const [finalSeconds, setFinalSeconds] = useState(0);

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder);
  const lastSeconds = useRef(0); // the length so far, kept for when the recorder stops
  const keptUri = useRef<string | null>(null); // the recorded file on the phone, so it can always be deleted
  const alive = useRef(true);
  const busy = useRef(false);

  // To listen to the recording before it is saved.
  const player = useAudioPlayer(phase === 'review' ? uri : null);
  const playerStatus = useAudioPlayerStatus(player);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    if (phase === 'recording') lastSeconds.current = recorderState.durationMillis / 1000;
  }, [phase, recorderState.durationMillis]);

  useEffect(() => {
    if (phase === 'recording' && recorderState.durationMillis / 1000 >= maxSeconds) void stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, recorderState.durationMillis]);

  useEffect(() => {
    return () => {
      try {
        if (recorder.isRecording) void recorder.stop();
      } catch {
        /* nothing to stop */
      }
      void setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
      discardRecordingFile(keptUri.current);
      keptUri.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const start = useCallback(async () => {
    if (busy.current || phase !== 'ready') return; // a second tap must not start the recorder again
    setProblem(null);
    busy.current = true;
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!alive.current) return; // the user left while the phone asked for permission
      if (!permission.granted) return setProblem('record.noPermission');
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      if (!alive.current) {
        // The user left while the recorder was getting ready. The microphone must stay off.
        void setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
        return;
      }
      lastSeconds.current = 0;
      recorder.record();
      setPhase('recording');
    } catch {
      setProblem('record.failed');
    } finally {
      busy.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recorder, phase]);

  const stop = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      await recorder.stop();
      // The length from the recorder itself is more exact than the one we counted while recording.
      const seconds = Math.max(lastSeconds.current, recorder.getStatus().durationMillis / 1000);
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }); // play through the speaker
      const file = recorder.uri;
      if (!alive.current) {
        discardRecordingFile(file); // the user left while it was stopping: the cleanup already ran, so delete the file here
        return;
      }
      if (!file) throw new Error('no file');
      keptUri.current = file; // from now on it is deleted when we are done with it
      if (seconds < minSeconds) {
        discardRecordingFile(file);
        keptUri.current = null;
        setPhase('ready');
        return setProblem('record.tooShort');
      }
      setUri(file);
      setFinalSeconds(seconds);
      setPhase('review');
    } catch {
      if (alive.current) {
        setPhase('ready');
        setProblem('record.failed');
      }
    } finally {
      busy.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recorder, minSeconds]);

  const togglePlay = useCallback(() => {
    if (playerStatus.playing) {
      player.pause();
      return;
    }
    if (playerStatus.didJustFinish || (playerStatus.duration > 0 && playerStatus.currentTime >= playerStatus.duration)) {
      void player.seekTo(0);
    }
    player.play();
  }, [player, playerStatus]);

  const pause = useCallback(() => {
    try {
      player.pause();
    } catch {
      /* not playing */
    }
  }, [player]);

  /** Throw the recording away and go back to the start ("record again"). */
  const discard = useCallback(() => {
    pause();
    discardRecordingFile(keptUri.current);
    keptUri.current = null;
    setUri(null);
    setProblem(null);
    setPhase('ready');
  }, [pause]);

  /** Call this after the file was uploaded: the phone no longer needs its copy. */
  const releaseFile = useCallback(() => {
    discardRecordingFile(keptUri.current);
    keptUri.current = null;
  }, []);

  return {
    phase,
    problem,
    clearProblem: () => setProblem(null),
    start,
    stop,
    discard,
    releaseFile,
    pause,
    togglePlay,
    uri,
    /** Length of the finished recording, in seconds. */
    finalSeconds,
    /** Length while recording, in seconds. */
    liveSeconds: recorderState.durationMillis / 1000,
    playing: playerStatus.playing,
    /** Is the screen still open? (for code that runs after a slow upload) */
    isAlive: () => alive.current,
    maxSeconds,
  };
}

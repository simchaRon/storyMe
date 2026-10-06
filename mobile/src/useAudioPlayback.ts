import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useCallback, useEffect, useRef, useState } from 'react';

const START_TIMEOUT_MS = 15000; // if the audio has not started by then, give up

export type Playback = {
  /** Which audio is playing (the key given to `play`), or null. */
  playingKey: string | null;
  /** Play the audio at `uri`. Any other audio stops first. */
  play: (key: string, uri: string) => Promise<void>;
  stop: () => void;
};

/**
 * One audio player for a whole screen, so two sounds can never play together.
 * `onFailed` runs when the audio never starts (an expired link, a deleted file, no network).
 */
export function useAudioPlayback(onFailed: () => void): Playback {
  const [source, setSource] = useState<{ uri: string } | null>(null);
  const [playingKey, setPlayingKey] = useState<string | null>(null);
  const [wantPlay, setWantPlay] = useState(false);

  const player = useAudioPlayer(source);
  const status = useAudioPlayerStatus(player);
  const statusRef = useRef(status);
  statusRef.current = status;
  const failedRef = useRef(onFailed);
  failedRef.current = onFailed;

  const request = useRef(0); // each play or stop gets a number. An older play that is still waiting is dropped

  const halt = useCallback(() => {
    try {
      player.pause();
    } catch {
      /* not playing */
    }
    setWantPlay(false);
    setPlayingKey(null);
  }, [player]);

  const stop = useCallback(() => {
    request.current++;
    halt();
  }, [halt]);

  const play = useCallback(
    async (key: string, uri: string) => {
      const mine = ++request.current;
      halt();
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
      if (mine !== request.current) return; // the user tapped something else (or stop) in the meantime
      setSource({ uri });
      setPlayingKey(key);
      setWantPlay(true);
    },
    [halt],
  );

  // Start as soon as the new player exists.
  useEffect(() => {
    if (source && wantPlay) {
      player.play();
      setWantPlay(false);
    }
  }, [source, wantPlay, player]);

  useEffect(() => {
    if (status.didJustFinish) setPlayingKey(null);
  }, [status.didJustFinish]);

  // If the audio never starts, do not stay on "Stop".
  useEffect(() => {
    if (playingKey === null) return;
    const timer = setTimeout(() => {
      if (!statusRef.current.playing && !statusRef.current.isLoaded) {
        stop();
        failedRef.current();
      }
    }, START_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [playingKey, stop]);

  useEffect(
    () => () => {
      try {
        player.pause();
      } catch {
        /* already gone */
      }
    },
    [player],
  );

  return { playingKey, play, stop };
}

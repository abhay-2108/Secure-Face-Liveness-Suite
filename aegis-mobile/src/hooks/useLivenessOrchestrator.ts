import { useState, useCallback, useRef } from 'react';
import { Vibration } from 'react-native';
import type { ISharedValue } from 'react-native-worklets-core';
import type { LivenessResult } from 'react-native-open-face';

export type AuthenticationPhase = 
  | 'IDLE' 
  | 'STABILIZING' 
  | 'BLINK_INSTRUCTION' 
  | 'SCREEN_FLASH'
  | 'OPEN_EYE_PROMPT'
  | 'TURN_HEAD_CHALLENGE' 
  | 'VERIFYING' 
  | 'EXTRACTING'
  | 'SUCCESS' 
  | 'FAILED';

export function useLivenessOrchestrator(flashState: ISharedValue<number>, mode: 'auth' | 'enroll' = 'auth') {
  const [authPhase, setAuthPhase] = useState<AuthenticationPhase>('IDLE');
  const [livenessPrompt, setLivenessPrompt] = useState<string>('');
  const [livenessStatus, setLivenessStatus] = useState<'pending' | 'passed' | 'failed' | 'timeout'>('pending');
  const [flashColor, setFlashColor] = useState<string>('transparent');

  const authPhaseRef = useRef<AuthenticationPhase>('IDLE');
  const prevChallengeRef = useRef<string>('none');
  const pendingChallengeRef = useRef<string>('none');
  const challengeStabilityCountRef = useRef<number>(0);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updateAuthPhase = useCallback((newPhase: AuthenticationPhase) => {
    authPhaseRef.current = newPhase;
    setAuthPhase(newPhase);
  }, []);

  const processLivenessState = useCallback((liveness: LivenessResult | null) => {
    if (!liveness) return;

    if (liveness.status === 'failed' || liveness.status === 'timeout') {
      updateAuthPhase('FAILED');
      setLivenessStatus(liveness.status);
      setLivenessPrompt(liveness.status === 'timeout' ? 'Time out. Try again.' : 'Liveness check failed.');
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
      flashState.value = 0;
      setFlashColor('transparent');
      return;
    }

    if (liveness.status === 'passed') {
      if (authPhaseRef.current !== 'VERIFYING' && authPhaseRef.current !== 'EXTRACTING' && authPhaseRef.current !== 'SUCCESS') {
        if (mode === 'auth') {
          updateAuthPhase('VERIFYING');
          setLivenessPrompt('Analyzing identity...');
        } else {
          updateAuthPhase('EXTRACTING');
          setLivenessPrompt('Extracting features...');
        }
        setLivenessStatus('passed');
      }
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
      flashState.value = 0;
      setFlashColor('transparent');
      return;
    }

    if (liveness.status === 'pending') {
      updateAuthPhase('STABILIZING');
      setLivenessPrompt('Hold still...');
      flashState.value = 0;
      setFlashColor('transparent');
      prevChallengeRef.current = 'none';
      return;
    }

    // Map Engine Challenge to UI Prompts
    if (liveness.status === 'in_progress') {
      const rawChallenge = liveness.currentChallenge;
      
      if (rawChallenge !== pendingChallengeRef.current) {
         pendingChallengeRef.current = rawChallenge;
         challengeStabilityCountRef.current = 1;
      } else {
         challengeStabilityCountRef.current++;
      }

      // Instantly update UI on challenge change to prevent deadlocks from noisy ML states
      if (challengeStabilityCountRef.current >= 1) {
        const challenge = pendingChallengeRef.current;
        
        if (challenge !== prevChallengeRef.current) {
           prevChallengeRef.current = challenge;
        } else {
           return;
        }

        switch (challenge) {
          case 'blink':
            updateAuthPhase('BLINK_INSTRUCTION');
            setLivenessPrompt('Please blink your eyes');
            flashState.value = 0;
            setFlashColor('transparent');
            break;
          case 'turn_head':
            updateAuthPhase('TURN_HEAD_CHALLENGE');
            setLivenessPrompt('Turn your head slightly');
            flashState.value = 0;
            setFlashColor('transparent');
            break;
          case 'screen_flash':
            updateAuthPhase('SCREEN_FLASH');
            setLivenessPrompt('Analyzing depth...');
            setFlashColor('white');
            if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
            flashTimerRef.current = setTimeout(() => {
              flashState.value = 1;
            }, 150);
            break;
          case 'hold_still':
          case 'none':
          default:
            updateAuthPhase('STABILIZING');
            setLivenessPrompt('Hold still...');
            flashState.value = 0;
            setFlashColor('transparent');
            break;
        }
      }
    }
  }, [flashState, updateAuthPhase, mode]);

  const resetOrchestrator = useCallback(() => {
    setLivenessStatus('pending');
    setLivenessPrompt('');
    updateAuthPhase('IDLE');
    setFlashColor('transparent');
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    flashState.value = 0;
    prevChallengeRef.current = 'none';
    pendingChallengeRef.current = 'none';
    challengeStabilityCountRef.current = 0;
  }, [flashState, updateAuthPhase]);

  return {
    authPhase,
    authPhaseRef,
    livenessPrompt,
    setLivenessPrompt,
    livenessStatus,
    setLivenessStatus,
    flashColor,
    processLivenessState,
    updateAuthPhase,
    resetOrchestrator,
  };
}

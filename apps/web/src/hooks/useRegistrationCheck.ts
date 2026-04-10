'use client';

import { useState, useEffect, useCallback } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { lookupByAuthority } from '@/lib/gateway';

export type RegistrationStatus = 'loading' | 'registered' | 'unregistered' | 'error';

export function useRegistrationCheck() {
  const { ready, authenticated, user } = usePrivy();
  const [status, setStatus] = useState<RegistrationStatus>('loading');
  const [checkedAddress, setCheckedAddress] = useState<string | null>(null);

  const walletAddress = user?.wallet?.address;

  const checkRegistration = useCallback(async (address: string) => {
    setStatus('loading');
    try {
      const result = await lookupByAuthority(address);
      setStatus(result.registered ? 'registered' : 'unregistered');
      setCheckedAddress(address);
    } catch {
      setStatus('unregistered');
      setCheckedAddress(address);
    }
  }, []);

  useEffect(() => {
    if (!ready || !authenticated) {
      setStatus('loading');
      return;
    }

    if (!walletAddress) {
      setStatus('unregistered');
      return;
    }

    if (walletAddress !== checkedAddress) {
      checkRegistration(walletAddress);
    }
  }, [ready, authenticated, walletAddress, checkedAddress, checkRegistration]);

  return {
    status,
    isRegistered: status === 'registered',
    isLoading: status === 'loading',
    walletAddress,
    recheck: () => walletAddress && checkRegistration(walletAddress),
  };
}

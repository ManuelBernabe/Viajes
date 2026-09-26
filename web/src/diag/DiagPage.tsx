import { useCallback, useState } from 'react';
import { AuthCheck } from './AuthCheck';
import { CryptoCheck } from './CryptoCheck';
import { EnvironmentCheck } from './EnvironmentCheck';
import { FilesCheck } from './FilesCheck';
import { OutboxCheck } from './OutboxCheck';
import { WakeLockCheck } from './WakeLockCheck';

export function DiagPage() {
  const [signedIn, setSignedIn] = useState(false);
  const onSignedIn = useCallback((value: boolean) => setSignedIn(value), []);

  return (
    <main>
      <h1>Viajes · diagnóstico</h1>
      <EnvironmentCheck />
      <AuthCheck onSignedIn={onSignedIn} />
      <OutboxCheck signedIn={signedIn} />
      <FilesCheck signedIn={signedIn} />
      <WakeLockCheck />
      <CryptoCheck />
    </main>
  );
}

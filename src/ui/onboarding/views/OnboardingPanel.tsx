// src/ui/onboarding/views/OnboardingPanel.tsx
// Call site cho basic:information (usePrivosContext: roomId, userRoles) và lists:read / lists:write / lists:query (scope-audit).
import { useState } from 'react';
import { usePrivosContext } from '@privos_ai/app-react';
import { isRoomAdmin } from '../domain/roles';
import { AdminHome } from './AdminHome';
import { MyRoadmap } from './MyRoadmap';
import { TemplateEditor } from './TemplateEditor';

export default function OnboardingPanel() {
  const { roomId, userRoles } = usePrivosContext();
  const [screen, setScreen] = useState<'home' | 'templates'>('home');
  if (!roomId) return <div className="container"><p className="loading-text">Mở app bên trong một room.</p></div>;
  const admin = isRoomAdmin(userRoles ?? []);
  return (
    <div className="container">
      <h1>Onboarding</h1>
      {!admin && <MyRoadmap />}
      {admin && screen === 'home' && <AdminHome onOpenTemplates={() => setScreen('templates')} />}
      {admin && screen === 'templates' && <TemplateEditor onBack={() => setScreen('home')} />}
    </div>
  );
}


import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Medication, Appointment, CaregiverProfile, AppView, AppSettings, UserProfile, MealType } from './types';
import { STORAGE_KEYS } from './constants';
import Dashboard from './views/Dashboard';
import MedicationForm from './views/MedicationForm';
import AppointmentForm from './views/AppointmentForm';
import SettingsView from './views/SettingsView';
import LoginView from './views/LoginView';
import PetSelectionView from './views/PetSelectionView';
import AlarmOverlay from './views/AlarmOverlay';
import FakeCallOverlay from './views/FakeCallOverlay';

const DEFAULT_SETTINGS: AppSettings = {
  aiVoiceTone: 'Kore',
  systemGreeting: 'สวัสดีครับ/ค่ะ วันนี้เป็นอย่างไรบ้าง?',
  aiInstructionPrefix: 'โปรดอ่านข้อความต่อไปนี้ด้วยน้ำเสียงที่อบอุ่น อ่อนโยน และเป็นมิตรสำหรับผู้สูงอายุ',
  fakeCallDelayMinutes: 30,
  petId: '',
  petName: ''
};

const App: React.FC = () => {
  const [view, setView] = useState<AppView>('DASHBOARD');
  const [medications, setMedications] = useState<Medication[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [editingAppt, setEditingAppt] = useState<Appointment | null>(null);
  const [user, setUser] = useState<UserProfile>({ id: '', name: '', email: '', isLoggedIn: false });
  const [caregiver, setCaregiver] = useState<CaregiverProfile>({
    name: 'คุณลูก',
    photo: 'https://picsum.photos/200'
  });
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [activeAlarm, setActiveAlarm] = useState<{med: Medication, meal: MealType} | null>(null);
  const [activeCall, setActiveCall] = useState<CaregiverProfile | null>(null);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [snoozedTurns, setSnoozedTurns] = useState<Record<string, number>>({});
  const alarmStartTimeRef = useRef<number | null>(null);

  useEffect(() => {
    const savedMeds = localStorage.getItem(STORAGE_KEYS.MEDICATIONS);
    const savedAppts = localStorage.getItem(STORAGE_KEYS.APPOINTMENTS);
    const savedCaregiver = localStorage.getItem(STORAGE_KEYS.CAREGIVER);
    const savedSettings = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    const savedUser = localStorage.getItem('medimind_user');
    
    if (savedMeds) setMedications(JSON.parse(savedMeds));
    if (savedAppts) setAppointments(JSON.parse(savedAppts));
    if (savedCaregiver) setCaregiver(JSON.parse(savedCaregiver));
    if (savedSettings) {
      const parsedSettings = JSON.parse(savedSettings);
      setSettings(parsedSettings);
      if (!parsedSettings.petId) setView('PET_SELECTION');
    } else {
      setView('PET_SELECTION');
    }
    if (savedUser) setUser(JSON.parse(savedUser));
  }, []);

  useEffect(() => { localStorage.setItem(STORAGE_KEYS.MEDICATIONS, JSON.stringify(medications)); }, [medications]);
  useEffect(() => { localStorage.setItem(STORAGE_KEYS.APPOINTMENTS, JSON.stringify(appointments)); }, [appointments]);
  useEffect(() => { localStorage.setItem(STORAGE_KEYS.CAREGIVER, JSON.stringify(caregiver)); }, [caregiver]);
  useEffect(() => { localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings)); }, [settings]);
  useEffect(() => { localStorage.setItem('medimind_user', JSON.stringify(user)); }, [user]);

  const isMedScheduledForDate = useCallback((med: Medication, date: Date) => {
    const todayDayShort = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'][date.getDay()];
    if (med.frequency === 'EVERYDAY') return true;
    if (med.frequency === 'SPECIFIC_DAYS') return med.specificDays?.includes(todayDayShort as any);
    const start = new Date(med.startDate);
    start.setHours(0, 0, 0, 0);
    const current = new Date(date);
    current.setHours(0, 0, 0, 0);
    const diffTime = current.getTime() - start.getTime();
    if (diffTime < 0) return false;
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    if (med.frequency === 'INTERVAL' && med.intervalDays) return diffDays % med.intervalDays === 0;
    if (med.frequency === 'CYCLIC' && med.cycleOnDays && med.cycleOffDays) {
      const totalCycle = med.cycleOnDays + med.cycleOffDays;
      const dayInCycle = diffDays % totalCycle;
      return dayInCycle < med.cycleOnDays;
    }
    return false;
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      const nowTs = now.getTime();
      const currentTimeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
      const todayStr = now.toISOString().split('T')[0];

      if (activeAlarm && alarmStartTimeRef.current) {
        const elapsedMinutes = (nowTs - alarmStartTimeRef.current) / 60000;
        if (elapsedMinutes >= settings.fakeCallDelayMinutes && !activeCall) {
          setActiveCall(caregiver);
          setActiveAlarm(null);
        }
      }

      if (!activeAlarm && !activeCall) {
        medications.forEach(med => {
          if (isMedScheduledForDate(med, now)) {
            med.meals.forEach(meal => {
              const mealTime = med.mealTimes[meal];
              const turnId = `${med.id}-${meal}-${todayStr}`;
              const isTaken = med.takenStatus[todayStr]?.[meal];
              if (mealTime === currentTimeStr && !isTaken && (!snoozedTurns[turnId] || nowTs >= snoozedTurns[turnId])) {
                setActiveAlarm({ med, meal });
                alarmStartTimeRef.current = nowTs;
                if ('vibrate' in navigator) navigator.vibrate([500, 200, 500]);
              }
            });
          }
        });
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [medications, activeAlarm, activeCall, snoozedTurns, isMedScheduledForDate, caregiver, settings.fakeCallDelayMinutes]);

  const handleMedTaken = (medId: string, meal: MealType) => {
    const todayStr = new Date().toISOString().split('T')[0];
    setMedications(prev => prev.map(m => {
      if (m.id === medId) {
        const currentTaken = m.takenStatus[todayStr] || {};
        const remaining = m.remainingStock !== undefined ? Math.max(0, m.remainingStock - m.dosageValue) : m.remainingStock;
        return { 
          ...m, 
          takenStatus: { ...m.takenStatus, [todayStr]: { ...currentTaken, [meal]: true } },
          remainingStock: remaining
        };
      }
      return m;
    }));
    setActiveAlarm(null);
    setActiveCall(null);
    alarmStartTimeRef.current = null;
  };

  const renderView = () => {
    switch (view) {
      case 'PET_SELECTION':
        return <PetSelectionView initialPetId={settings.petId} initialPetName={settings.petName} onSave={(id, name) => { setSettings(prev => ({ ...prev, petId: id, petName: name })); setView('DASHBOARD'); }} onCancel={settings.petId ? () => setView('SETTINGS') : undefined} />;
      case 'DASHBOARD':
        return <Dashboard meds={medications} appts={appointments} settings={settings} onAddMed={() => setView('MED_FORM')} onAddAppt={() => { setEditingAppt(null); setView('APPT_FORM'); }} onEditAppt={(appt) => { setEditingAppt(appt); setView('APPT_FORM'); }} onSettings={() => setView('SETTINGS')} onMedTaken={handleMedTaken} isAudioEnabled={isAudioEnabled} onToggleAudio={() => setIsAudioEnabled(!isAudioEnabled)} isScheduledCheck={isMedScheduledForDate} />;
      case 'MED_FORM':
        return <MedicationForm onSave={(med) => { setMedications([...medications, med]); setView('DASHBOARD'); }} onCancel={() => setView('DASHBOARD')} />;
      case 'APPT_FORM':
        return <AppointmentForm existingAppt={editingAppt || undefined} onSave={(appt) => { if (editingAppt) setAppointments(appointments.map(a => a.id === appt.id ? appt : a)); else setAppointments([...appointments, appt]); setView('DASHBOARD'); }} onDelete={(id) => { setAppointments(appointments.filter(a => a.id !== id)); setView('DASHBOARD'); }} onCancel={() => setView('DASHBOARD')} />;
      case 'SETTINGS':
        return <SettingsView caregiver={caregiver} settings={settings} user={user} notificationPermission={'granted'} onRequestNotification={() => {}} onLoginRequest={() => setView('LOGIN')} onLogout={() => setUser({ id: '', name: '', email: '', isLoggedIn: false })} onSave={(c, s) => { setCaregiver(c); setSettings(s); setView('DASHBOARD'); }} onCancel={() => setView('DASHBOARD')} onEditPet={() => setView('PET_SELECTION')} />;
      case 'LOGIN':
        return <LoginView onLogin={(u) => { setUser(u); setView('SETTINGS'); }} onCancel={() => setView('SETTINGS')} />;
      default: return null;
    }
  };

  return (
    <div className="max-w-md mx-auto h-screen bg-blue-50 relative overflow-hidden flex flex-col shadow-2xl">
      {renderView()}
      {activeAlarm && (
        <AlarmOverlay medication={activeAlarm.med} meal={activeAlarm.meal} onTaken={() => handleMedTaken(activeAlarm.med.id, activeAlarm.meal)} onSnooze={() => {
          const todayStr = new Date().toISOString().split('T')[0];
          const turnId = `${activeAlarm.med.id}-${activeAlarm.meal}-${todayStr}`;
          setSnoozedTurns(prev => ({ ...prev, [turnId]: Date.now() + 300000 }));
          setActiveAlarm(null);
          alarmStartTimeRef.current = null;
        }} isAudioEnabled={isAudioEnabled} aiSettings={settings} />
      )}
      {activeCall && <FakeCallOverlay caregiver={activeCall} onAnswer={() => setActiveCall(null)} onDecline={() => setActiveCall(null)} />}
    </div>
  );
};

export default App;

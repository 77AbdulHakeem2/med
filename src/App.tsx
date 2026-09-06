import React, { useState, useEffect, useCallback } from 'react';
import { Header } from './components/Header';
import { TelegramSimulator } from './components/TelegramSimulator';
import { QueueInspector } from './components/QueueInspector';
import { ChannelFeed } from './components/ChannelFeed';
import { SettingsManager } from './components/SettingsManager';
import { BotConnectModal } from './components/BotConnectModal';
import {
  UserSetting,
  QueueItem,
  ChannelPost,
  SystemStatus,
  SimulatedTelegramMessage,
} from './types';

export default function App() {
  const [activeTab, setActiveTab] = useState<'simulator' | 'queue' | 'channel' | 'settings'>('simulator');
  const [activeUserId, setActiveUserId] = useState<string>('77123456');

  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [users, setUsers] = useState<UserSetting[]>([]);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [channelPosts, setChannelPosts] = useState<ChannelPost[]>([]);
  const [messages, setMessages] = useState<SimulatedTelegramMessage[]>([]);

  const [showBotModal, setShowBotModal] = useState(false);
  const [loadingAction, setLoadingAction] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Active user data
  const activeUser: UserSetting = users.find((u) => u.userId === activeUserId) || {
    userId: activeUserId,
    username: 'user_media',
    firstName: 'مالك البوت',
    forbiddenWords: [],
    namingPrefix: '',
    namingSuffix: '',
    captionPrefix: '',
    captionSuffix: '',
    updatedAt: Date.now(),
  };

  // Fetch all live data
  const fetchData = useCallback(async () => {
    try {
      const [statusRes, usersRes, queueRes, postsRes, msgsRes] = await Promise.all([
        fetch('/api/status'),
        fetch('/api/users'),
        fetch('/api/queue'),
        fetch('/api/channel/posts'),
        fetch(`/api/simulator/messages/${activeUserId}`),
      ]);

      if (statusRes.ok) setStatus(await statusRes.json());
      if (usersRes.ok) {
        const usersData = await usersRes.json();
        setUsers(usersData);
        if (!usersData.some((u: UserSetting) => u.userId === activeUserId) && usersData.length > 0) {
          setActiveUserId(usersData[0].userId);
        }
      }
      if (queueRes.ok) setQueue(await queueRes.json());
      if (postsRes.ok) setChannelPosts(await postsRes.json());
      if (msgsRes.ok) setMessages(await msgsRes.json());
    } catch (err) {
      console.error('Error fetching data:', err);
    }
  }, [activeUserId]);

  useEffect(() => {
    fetchData();
    // Real-time polling to update pipeline status and queue movements
    const interval = setInterval(fetchData, 1600);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleManualRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setTimeout(() => setRefreshing(false), 500);
  };

  // Simulator actions
  const handleSendMessage = async (text: string) => {
    setLoadingAction(true);
    try {
      const res = await fetch('/api/simulator/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: activeUserId, text }),
      });
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages || []);
        await fetchData();
      }
    } finally {
      setLoadingAction(false);
    }
  };

  const handleSendPhoto = async (photoUrl: string, caption?: string) => {
    setLoadingAction(true);
    try {
      const res = await fetch('/api/simulator/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: activeUserId, type: 'photo', photoUrl, caption }),
      });
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages || []);
        await fetchData();
      }
    } finally {
      setLoadingAction(false);
    }
  };

  const handleSendVideo = async (filename: string, fileSize: number, caption?: string) => {
    setLoadingAction(true);
    try {
      const res = await fetch('/api/simulator/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: activeUserId, type: 'video', filename, fileSize, caption }),
      });
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages || []);
        await fetchData();
      }
    } finally {
      setLoadingAction(false);
    }
  };

  const handleSendBatch = async () => {
    setLoadingAction(true);
    try {
      // Sends Video 1, Video 2, Text Message, Video 3 in strict order as requested in user prompt
      await fetch('/api/queue/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: activeUserId,
          items: [
            {
              type: 'video',
              originalFilename: 'Video 1 - موقع_مشبوه - HD.mp4',
              originalCaption: 'الحلقة الأولى من السلسلة الكاملة',
              fileSize: 42 * 1024 * 1024,
            },
            {
              type: 'video',
              originalFilename: 'Video 2 - promo_link - 02.mp4',
              originalCaption: 'الحلقة الثانية - تابعونا',
              fileSize: 38 * 1024 * 1024,
            },
            {
              type: 'text',
              textContent: '📌 القسم الثاني: بداية الحلقات الحصرية ومجموعة الفيديوهات المميزة',
            },
            {
              type: 'video',
              originalFilename: 'Video 3 - 03.mp4',
              originalCaption: 'الحلقة الثالثة',
              fileSize: 55 * 1024 * 1024,
            },
          ],
        }),
      });
      await fetchData();
      setActiveTab('queue');
    } finally {
      setLoadingAction(false);
    }
  };

  const handleCallbackQuery = async (messageId: number, data: string) => {
    setLoadingAction(true);
    try {
      const res = await fetch('/api/simulator/callback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: activeUserId, messageId, data }),
      });
      if (res.ok) {
        const result = await res.json();
        setMessages(result.messages || []);
        fetchData();
      }
    } finally {
      setLoadingAction(false);
    }
  };

  // Settings & User updates
  const handleUpdateUser = async (userId: string, update: Partial<UserSetting>) => {
    try {
      const res = await fetch(`/api/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(update),
      });
      if (res.ok) {
        await fetchData();
      }
    } catch (err) {
      console.error('Error updating user:', err);
    }
  };

  const handleUploadThumbnail = async (file: File) => {
    const formData = new FormData();
    formData.append('thumbnail', file);

    const res = await fetch(`/api/users/${activeUserId}/thumbnail`, {
      method: 'POST',
      body: formData,
    });
    if (res.ok) {
      await fetchData();
    }
  };

  const handleDeleteThumbnail = async () => {
    const res = await fetch(`/api/users/${activeUserId}/thumbnail`, {
      method: 'DELETE',
    });
    if (res.ok) {
      await fetchData();
    }
  };

  const handleVerifyChannel = async (channelChatId: string) => {
    try {
      const res = await fetch('/api/channel/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelChatId, userId: activeUserId }),
      });
      if (res.ok) {
        return await res.json();
      }
      return { valid: false, error: 'فشل فحص الصلاحيات' };
    } catch (err: any) {
      return { valid: false, error: err.message };
    }
  };

  // Queue actions
  const handleClearCompletedQueue = async () => {
    await fetch('/api/queue/clear', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ onlyCompleted: true }),
    });
    await fetchData();
  };

  const handleClearAllQueue = async () => {
    await fetch('/api/queue/clear', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ onlyCompleted: false }),
    });
    await fetchData();
  };

  const handleDeleteQueueItem = async (id: string) => {
    await fetch(`/api/queue/${id}`, { method: 'DELETE' });
    await fetchData();
  };

  // Bot Config
  const handleSaveBotConfig = async (botToken: string, pollingActive: boolean) => {
    const res = await fetch('/api/bot/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ botToken, pollingActive }),
    });
    const data = await res.json();
    await fetchData();
    return { verified: data.verified, error: data.error };
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#e0e0e0] flex flex-col font-sans" dir="rtl">
      
      {/* Header */}
      <Header
        status={status}
        users={users}
        activeUserId={activeUserId}
        onSelectUser={setActiveUserId}
        onOpenBotConfig={() => setShowBotModal(true)}
        activeTab={activeTab}
        onChangeTab={setActiveTab}
        onRefresh={handleManualRefresh}
        refreshing={refreshing}
      />

      {/* Main Viewport */}
      <main className="flex-1 overflow-y-auto bg-[#0a0a0a]">
        {activeTab === 'simulator' && (
          <TelegramSimulator
            user={activeUser}
            messages={messages}
            onSendMessage={handleSendMessage}
            onSendPhoto={handleSendPhoto}
            onSendVideo={handleSendVideo}
            onSendBatch={handleSendBatch}
            onCallbackQuery={handleCallbackQuery}
            loading={loadingAction}
          />
        )}

        {activeTab === 'queue' && (
          <QueueInspector
            queue={queue}
            onClearCompleted={handleClearCompletedQueue}
            onClearAll={handleClearAllQueue}
            onAddBatchTest={handleSendBatch}
            onDeleteItem={handleDeleteQueueItem}
          />
        )}

        {activeTab === 'channel' && (
          <ChannelFeed
            posts={channelPosts}
            channelSetting={activeUser.channel}
          />
        )}

        {activeTab === 'settings' && (
          <SettingsManager
            user={activeUser}
            onUpdateUser={handleUpdateUser}
            onUploadThumbnail={handleUploadThumbnail}
            onDeleteThumbnail={handleDeleteThumbnail}
            onVerifyChannel={handleVerifyChannel}
          />
        )}
      </main>

      {/* Sophisticated Dark Telemetry Footer */}
      <footer className="h-10 border-t border-[#222] flex items-center justify-between px-4 sm:px-6 bg-[#0a0a0a] text-[10px] text-[#555] uppercase tracking-widest font-mono shrink-0 select-none">
        <div className="flex items-center gap-4 sm:gap-6">
          <span>CHUNK_RESUME: <span className="text-sky-400">ENABLED</span></span>
          <span className="hidden sm:inline">ENGINE: <span className="text-[#888]">MTPROTO_CHUNKER</span></span>
          <span>QUEUE: <span className="text-sky-400">{queue.filter((q) => q.status === 'processing' || q.status === 'pending').length} ACTIVE</span></span>
        </div>
        <div className="flex items-center gap-4 sm:gap-6">
          <span className="hidden md:inline text-[#444]">High-Bandwidth Telegram Automation</span>
          <span>LATENCY: <span className="text-emerald-500">12ms</span></span>
        </div>
      </footer>

      {/* Real Bot Connect Modal */}
      {showBotModal && (
        <BotConnectModal
          status={status}
          onClose={() => setShowBotModal(false)}
          onSaveConfig={handleSaveBotConfig}
        />
      )}
    </div>
  );
}

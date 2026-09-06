import React from 'react';
import {
  Send,
  Radio,
  Sliders,
  Layers,
  Key,
  User,
  RefreshCw,
  Activity,
} from 'lucide-react';
import { SystemStatus, UserSetting } from '../types';

interface HeaderProps {
  status: SystemStatus | null;
  users: UserSetting[];
  activeUserId: string;
  onSelectUser: (userId: string) => void;
  onOpenBotConfig: () => void;
  activeTab: 'simulator' | 'queue' | 'channel' | 'settings';
  onChangeTab: (tab: 'simulator' | 'queue' | 'channel' | 'settings') => void;
  onRefresh: () => void;
  refreshing: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  status,
  users,
  activeUserId,
  onSelectUser,
  onOpenBotConfig,
  activeTab,
  onChangeTab,
  onRefresh,
  refreshing,
}) => {
  const activeUser = users.find((u) => u.userId === activeUserId) || users[0];

  return (
    <header className="bg-[#0a0a0a] border-b border-[#222] sticky top-0 z-30 select-none">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3.5">
        <div className="flex flex-col lg:flex-row items-center justify-between gap-3.5">
          
          {/* Brand Identity */}
          <div className="flex items-center justify-between w-full lg:w-auto gap-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-sky-500 rounded flex items-center justify-center font-bold text-black text-xs tracking-tighter shadow-sm">
                TP
              </div>
              <div className="flex items-baseline gap-2.5">
                <span className="text-xl font-medium tracking-tight font-serif-display italic text-[#f5f5f5]">
                  TelePipeline v2.4
                </span>
                <span className="text-[10px] uppercase font-mono tracking-widest text-[#666] hidden sm:inline">
                  Media Engine
                </span>
              </div>
            </div>

            {/* Active Status Badge & Mobile Actions */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-emerald-400 font-mono bg-emerald-950/30 border border-emerald-800/40 px-2.5 py-1 rounded">
                <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
                <span>Processing Active</span>
              </div>

              {/* Mobile Refresh */}
              <button
                onClick={onRefresh}
                className="lg:hidden p-1.5 text-[#666] hover:text-[#e0e0e0] rounded border border-[#222] bg-[#121212] transition"
                title="Refresh Status"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-sky-400' : ''}`} />
              </button>
            </div>
          </div>

          {/* Navigation Tabs - Refined Sophisticated Dark */}
          <nav className="flex items-center gap-1.5 bg-[#121212] p-1 rounded-lg border border-[#222] w-full lg:w-auto overflow-x-auto">
            <button
              onClick={() => onChangeTab('simulator')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs tracking-wide transition whitespace-nowrap ${
                activeTab === 'simulator'
                  ? 'bg-[#1e1e1e] text-sky-400 border border-[#333] shadow-sm font-medium'
                  : 'text-[#888] hover:text-[#e0e0e0] hover:bg-[#161616]'
              }`}
            >
              <Send className="w-3.5 h-3.5 text-sky-400/80" />
              <span>البوت (/settings)</span>
            </button>

            <button
              onClick={() => onChangeTab('queue')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs tracking-wide transition whitespace-nowrap ${
                activeTab === 'queue'
                  ? 'bg-[#1e1e1e] text-sky-400 border border-[#333] shadow-sm font-medium'
                  : 'text-[#888] hover:text-[#e0e0e0] hover:bg-[#161616]'
              }`}
            >
              <Layers className="w-3.5 h-3.5 text-sky-400/80" />
              <span>طابور المعالجة (Queue)</span>
              {(status?.queueLength || 0) > 0 && (
                <span className="px-1.5 py-0.2 rounded text-[10px] bg-sky-500/20 text-sky-400 border border-sky-500/30 font-mono font-bold">
                  {status?.queueLength}
                </span>
              )}
            </button>

            <button
              onClick={() => onChangeTab('channel')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs tracking-wide transition whitespace-nowrap ${
                activeTab === 'channel'
                  ? 'bg-[#1e1e1e] text-sky-400 border border-[#333] shadow-sm font-medium'
                  : 'text-[#888] hover:text-[#e0e0e0] hover:bg-[#161616]'
              }`}
            >
              <Radio className="w-3.5 h-3.5 text-sky-400/80" />
              <span>القناة الناشرة</span>
            </button>

            <button
              onClick={() => onChangeTab('settings')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs tracking-wide transition whitespace-nowrap ${
                activeTab === 'settings'
                  ? 'bg-[#1e1e1e] text-sky-400 border border-[#333] shadow-sm font-medium'
                  : 'text-[#888] hover:text-[#e0e0e0] hover:bg-[#161616]'
              }`}
            >
              <Sliders className="w-3.5 h-3.5 text-sky-400/80" />
              <span>إعدادات المستخدم</span>
            </button>
          </nav>

          {/* Right Tools: User selector & Real Bot Connect */}
          <div className="flex items-center gap-2.5 w-full lg:w-auto justify-end">
            
            {/* User Selector */}
            <div className="flex items-center gap-1.5 bg-[#151515] border border-[#222] rounded px-2.5 py-1 text-xs">
              <User className="w-3.5 h-3.5 text-[#666]" />
              <select
                value={activeUserId}
                onChange={(e) => onSelectUser(e.target.value)}
                className="bg-transparent text-[#ccc] text-xs font-mono focus:outline-none cursor-pointer"
                title="تبديل المستخدم"
              >
                {users.map((u) => (
                  <option key={u.userId} value={u.userId} className="bg-[#111] text-[#e0e0e0]">
                    {u.firstName} ({u.userId})
                  </option>
                ))}
              </select>
            </div>

            {/* Telegram Bot Token Status / Connect */}
            <button
              onClick={onOpenBotConfig}
              className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs font-mono transition border ${
                status?.botConfigured
                  ? 'bg-emerald-950/20 text-emerald-400 border-emerald-800/40 hover:bg-emerald-950/40'
                  : 'bg-[#151515] text-[#888] border-[#2b2b2b] hover:border-sky-500/50 hover:text-sky-400'
              }`}
            >
              <Key className="w-3 h-3" />
              {status?.botConfigured ? (
                <span className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span>@{status.botInfo?.username || 'CONNECTED'}</span>
                </span>
              ) : (
                <span>CONNECT BOT TOKEN</span>
              )}
            </button>

            {/* Desktop Refresh */}
            <button
              onClick={onRefresh}
              className="hidden lg:flex p-2 text-[#666] hover:text-[#e0e0e0] rounded border border-[#222] bg-[#121212] transition"
              title="تحديث البيانات"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-sky-400' : ''}`} />
            </button>

          </div>
        </div>
      </div>
    </header>
  );
};

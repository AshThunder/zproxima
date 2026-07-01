import { useState, useRef, useEffect } from 'react';
import { processCommand } from '../lib/bot';
import { formatRelayerError } from '../lib/zama';
import { getActiveNetwork } from '../lib/wallet';
import Icon from '../components/Icon';

interface Message {
  id: number;
  sender: 'bot' | 'user';
  text: string;
  txHash?: string;
  isProgress?: boolean;
}

import type { WalletSession } from '../lib/walletSession';
import { usesEmbeddedSigning } from '../lib/walletSession';

interface Props { session: WalletSession; }

const INITIAL: Message[] = [{
  id: 1,
  sender: 'bot',
  text: 'How can I help you manage your confidential registry today? Try `wrap 1 usdc`, `balance usdt`, or `faucet usdc`.',
}];

export default function BotChat({ session }: Props) {
  const privateKey = session.privateKey ?? '';
  const userAddress = session.address;
  const [messages, setMessages] = useState<Message[]>(INITIAL);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const progressIdRef = useRef<number | null>(null);
  const activeNet = getActiveNetwork();

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const upsertProgress = (text: string) => {
    const id = progressIdRef.current ?? Date.now();
    progressIdRef.current = id;
    setMessages(prev => {
      const without = prev.filter(m => m.id !== id);
      return [...without, { id, sender: 'bot', text, isProgress: true }];
    });
  };

  const clearProgress = () => {
    if (progressIdRef.current !== null) {
      const id = progressIdRef.current;
      progressIdRef.current = null;
      setMessages(prev => prev.filter(m => m.id !== id));
    }
  };

  const addMsg = (msg: Omit<Message, 'id'>) =>
    setMessages(prev => [...prev, { ...msg, id: Date.now() + Math.random() }]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;
    const text = input.trim();
    setInput('');
    addMsg({ sender: 'user', text });
    if (!usesEmbeddedSigning(session)) {
      addMsg({
        sender: 'bot',
        text: 'ZBot requires the built-in wallet. Open Settings and switch to built-in wallet to use chat commands here.',
      });
      return;
    }
    setLoading(true);
    try {
      const result = await processCommand(text, privateKey, userAddress, upsertProgress);
      clearProgress();
      addMsg({ sender: 'bot', text: result.message, txHash: result.txHash });
    } catch (err: unknown) {
      clearProgress();
      addMsg({ sender: 'bot', text: `Error: ${formatRelayerError(err)}` });
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    progressIdRef.current = null;
    setMessages(INITIAL);
  };

  const messageIcon = (text: string, isProgress?: boolean) => {
    if (isProgress) return 'sync';
    if (text.startsWith('Error:')) return 'error';
    if (text.startsWith('Successfully') || text.startsWith('Faucet claim success')) return 'check_circle';
    return 'smart_toy';
  };

  const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const messageList = (
    <>
      {messages.map((msg) => (
        <div
          key={msg.id}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignSelf: msg.sender === 'user' ? 'flex-end' : 'flex-start',
            gap: 4,
            maxWidth: '82%',
          }}
        >
          <div
            className={msg.sender === 'user' ? 'chat-bubble-user' : 'chat-bubble-bot'}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 8,
              opacity: msg.isProgress ? 0.85 : 1,
            }}
          >
            {msg.sender === 'bot' && (
              <Icon
                name={messageIcon(msg.text, msg.isProgress)}
                size={16}
                color={msg.isProgress ? 'var(--text-muted)' : msg.text.startsWith('Error:') ? 'var(--error)' : 'var(--text-secondary)'}
                style={{ flexShrink: 0, marginTop: 2 }}
              />
            )}
            <span>{msg.text}</span>
          </div>
          {!msg.isProgress && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="chat-timestamp">{now}</span>
              {msg.txHash && (
                <a href={`${activeNet.explorer}/tx/${msg.txHash}`} target="_blank" rel="noreferrer" className="tx-link">
                  View tx
                  <span className="material-symbols-outlined" style={{ fontSize: 11 }}>open_in_new</span>
                </a>
              )}
            </div>
          )}
        </div>
      ))}
      {loading && !progressIdRef.current && (
        <div style={{ alignSelf: 'flex-start' }}>
          <div className="chat-bubble-bot" style={{ display: 'flex', gap: 4, padding: '14px 18px' }}>
            {[0, 1, 2].map(i => (
              <div key={i} style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--text-muted)', animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite` }} />
            ))}
          </div>
        </div>
      )}
      <div ref={endRef} />
    </>
  );

  const inputBar = (
    <form onSubmit={handleSend} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-container)', borderRadius: 'var(--r-lg)', padding: '6px 6px 6px 16px' }}>
      <input
        type="text"
        placeholder="Message ZBOT..."
        value={input}
        onChange={e => setInput(e.target.value)}
        disabled={loading}
        style={{ flex: 1, background: 'transparent', border: 'none', padding: 0, fontFamily: 'var(--font-ui)', fontSize: 15, color: 'var(--text-primary)', outline: 'none' }}
      />
      <button type="submit" disabled={loading || !input.trim()} style={{ width: 38, height: 38, borderRadius: 12, background: input.trim() ? 'var(--text-primary)' : 'var(--bg-container-high)', border: 'none', cursor: input.trim() ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span className="material-symbols-outlined" style={{ fontSize: 18, color: input.trim() ? '#fff' : 'var(--text-muted)', fontVariationSettings: "'FILL' 1" }}>send</span>
      </button>
    </form>
  );

  return (
    <div className="screen" style={{ background: 'var(--bg-card)' }}>
      <div className="top-bar" style={{ borderBottom: '1px solid var(--border-strong)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 22, color: 'var(--text-primary)' }}>smart_toy</span>
          <span className="top-bar-title">ZBOT</span>
        </div>
        <button className="icon-btn" onClick={handleClear} title="Clear chat">
          <span className="material-symbols-outlined" style={{ fontSize: 20 }}>delete</span>
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {messageList}
      </div>

      <div style={{ padding: '12px 16px', background: 'var(--bg-card)', borderTop: '1px solid var(--border-strong)' }}>
        {inputBar}
      </div>

      <style>{`
        @keyframes bounce {
          0%, 80%, 100% { transform: translateY(0); }
          40% { transform: translateY(-6px); }
        }
      `}</style>
    </div>
  );
}

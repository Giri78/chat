import React, { useState, useEffect, useRef } from 'react';
import { initializeApp, getApps } from 'firebase/app';
import { 
  getAuth, 
  signInAnonymously, 
  signInWithCustomToken,
  onAuthStateChanged 
} from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  doc, 
  onSnapshot, 
  addDoc, 
  serverTimestamp, 
  query 
} from 'firebase/firestore';
import { 
  Send, Heart, Loader2, Video, AlertCircle, X 
} from 'lucide-react';

// --- Configuration Discovery ---
const getFirebaseConfig = () => {
  if (typeof __firebase_config !== 'undefined' && __firebase_config) {
    try { return JSON.parse(__firebase_config); } catch(e) { return null; }
  }
  try {
    const viteConfig = import.meta.env.VITE_FIREBASE_CONFIG;
    if (viteConfig) return JSON.parse(viteConfig);
  } catch (e) {}
  return null;
};

const config = getFirebaseConfig();
let app, auth, db;

if (config && config.apiKey) {
  app = getApps().length === 0 ? initializeApp(config) : getApps()[0];
  auth = getAuth(app);
  db = getFirestore(app);
}

// Ensure the appId is consistent across environments
const rawAppId = typeof __app_id !== 'undefined' ? __app_id : '78-qwerty-Giridhar';
const appId = rawAppId.replace(/\//g, '_');

const App = () => {
  const [user, setUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [error, setError] = useState(null);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (!config) {
      setError("CONFIGURATION NOT FOUND\n\nEnsure VITE_FIREBASE_CONFIG is added to Vercel and you have Redeployed.");
      return;
    }

    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) { 
        setError("AUTH FAILED\n\n1. Ensure 'Anonymous' is enabled in Firebase Console.\n2. Add your Vercel URL to 'Authorized Domains' in Authentication Settings."); 
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user || !db) return;

    const q = query(collection(db, 'artifacts', appId, 'public', 'data', 'messages'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      msgs.sort((a, b) => (a.timestamp?.seconds || 0) - (b.timestamp?.seconds || 0));
      setMessages(msgs);
    }, (err) => {
      setError(`PERMISSION DENIED\n\nPath: /artifacts/${appId}\n\nUpdate your Firestore Rules to the Universal version provided.`);
    });

    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const sendMessage = async (text) => {
    if (!user || !text.trim()) return;
    try {
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'messages'), {
        uid: user.uid, 
        text: String(text), 
        timestamp: serverTimestamp()
      });
      setInputValue('');
    } catch (err) { console.error(err); }
  };

  if (error) return (
    <div className="h-screen flex flex-col items-center justify-center p-6 bg-rose-50 text-center">
      <AlertCircle size={48} className="text-rose-500 mb-4" />
      <h2 className="text-xl font-bold text-rose-800 mb-2">Sanctuary Sync Issue</h2>
      <p className="text-rose-600 font-mono text-[10px] whitespace-pre-wrap bg-white p-6 rounded-2xl shadow-sm border border-rose-100 max-w-md">{String(error)}</p>
      <button onClick={() => window.location.reload()} className="mt-8 px-10 py-3 bg-rose-500 text-white rounded-full font-bold shadow-lg active:scale-95 transition-all">Retry Sync</button>
    </div>
  );

  if (!user) return (
    <div className="h-screen flex flex-col items-center justify-center bg-rose-50 text-rose-300">
      <Loader2 className="animate-spin mb-4" size={32} />
      <span className="font-serif italic tracking-widest animate-pulse">Entering sanctuary...</span>
    </div>
  );

  return (
    <div className="flex flex-col h-screen bg-[#FFF5F7] font-sans overflow-hidden text-slate-800">
      <header className="bg-white/90 backdrop-blur-md px-6 py-4 flex items-center justify-between border-b border-rose-100 shadow-sm z-30">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-rose-400 to-pink-300 flex items-center justify-center text-white shadow-inner">
            <Heart fill="white" size={20} className="heart-beat" />
          </div>
          <div>
            <h1 className="font-serif text-lg font-bold text-rose-600">Our Sanctuary</h1>
            <p className="text-[10px] text-rose-300 uppercase tracking-widest font-bold">Connected & Private</p>
          </div>
        </div>
      </header>

      <main ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4" style={{ backgroundImage: 'radial-gradient(#ffe4e6 1.5px, transparent 1.5px)', backgroundSize: '24px 24px' }}>
        {messages.map((msg) => (
          <div key={msg.id} className={`flex flex-col max-w-[85%] ${msg.uid === user.uid ? 'ml-auto items-end' : 'mr-auto items-start'}`}>
            <div className={`p-3 rounded-2xl shadow-sm ${msg.uid === user.uid ? 'bg-gradient-to-br from-rose-500 to-pink-500 text-white rounded-tr-none' : 'bg-white text-slate-700 rounded-tl-none border border-rose-50'}`}>
              <p className="text-sm md:text-base leading-relaxed whitespace-pre-wrap">{typeof msg.text === 'string' ? msg.text : "..."}</p>
              <div className={`text-[9px] mt-1 opacity-50 ${msg.uid === user.uid ? 'text-right' : 'text-left'}`}>
                 {msg.timestamp?.seconds ? new Date(msg.timestamp.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '...'}
              </div>
            </div>
          </div>
        ))}
      </main>

      <footer className="bg-white p-4 border-t border-rose-100 shadow-inner">
        <div className="max-w-4xl mx-auto flex items-center gap-3">
          <input 
            type="text" 
            placeholder="Type your heart out..." 
            className="flex-1 bg-rose-50/30 border border-rose-100 rounded-2xl py-3 px-5 focus:outline-none focus:ring-2 focus:ring-rose-200 focus:bg-white text-sm" 
            value={inputValue} 
            onChange={(e) => setInputValue(e.target.value)} 
            onKeyDown={(e) => e.key === 'Enter' && sendMessage(inputValue)} 
          />
          <button onClick={() => sendMessage(inputValue)} disabled={!inputValue.trim()} className={`p-4 rounded-full shadow-lg ${inputValue.trim() ? 'bg-rose-500 text-white' : 'bg-rose-100 text-rose-300'}`}><Send size={20} /></button>
        </div>
      </footer>
      <style dangerouslySetInnerHTML={{ __html: `
        .heart-beat { animation: heartbeat 1.5s infinite ease-in-out; }
        @keyframes heartbeat { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.1); } }
      `}} />
    </div>
  );
};

export default App;

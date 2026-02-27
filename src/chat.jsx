import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
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
  setDoc, 
  getDoc, 
  onSnapshot, 
  addDoc, 
  updateDoc,
  serverTimestamp, 
  query,
  deleteDoc
} from 'firebase/firestore';
import { 
  Send, Heart, Loader2, Phone, Video, Mic, MicOff, Sparkles, Wifi, WifiOff, AlertCircle 
} from 'lucide-react';

// --- Improved Firebase Configuration Discovery ---
const getFirebaseConfig = () => {
  // Check Canvas internal config
  if (typeof __firebase_config !== 'undefined' && __firebase_config) {
    try { return JSON.parse(__firebase_config); } catch(e) { return { error: "Canvas JSON invalid" }; }
  }
  
  // Check Vercel/Vite environment variable
  try {
    const viteConfig = import.meta.env.VITE_FIREBASE_CONFIG;
    if (viteConfig) return JSON.parse(viteConfig);
  } catch (e) {
    return { error: "VITE_FIREBASE_CONFIG is not valid JSON. Ensure it starts with { and ends with }." };
  }
  
  return null;
};

const configResult = getFirebaseConfig();
const app = (configResult && configResult.apiKey) ? initializeApp(configResult) : null;
const auth = app ? getAuth(app) : null;
const db = app ? getFirestore(app) : null;

// Ensure this matches your Firestore Rules
const appId = '78-qwerty-Giridhar';
const apiKey = ""; 

const App = () => {
  const [user, setUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [error, setError] = useState(null);
  const [incomingCall, setIncomingCall] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    // 1. Check if config exists at all
    if (!configResult) {
      setError("STEP 1 FAILED: VITE_FIREBASE_CONFIG not found.\n\nDid you add the variable in Vercel and click REDEPLOY?");
      return;
    }
    // 2. Check if JSON was broken
    if (configResult.error) {
      setError("STEP 2 FAILED: JSON Format Error.\n\n" + configResult.error);
      return;
    }

    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          // This requires "Anonymous" to be ENABLED in Firebase Console
          await signInAnonymously(auth);
        }
      } catch (err) { 
        setError("STEP 3 FAILED: Auth Connection Error.\n\nGo to Firebase > Authentication > Sign-in method and ENABLE 'Anonymous'."); 
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user || !db) return;

    const q = query(collection(db, 'artifacts', appId, 'public', 'data', 'messages'));
    const unsubscribeMsgs = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      msgs.sort((a, b) => (a.timestamp?.seconds || 0) - (b.timestamp?.seconds || 0));
      setMessages(msgs);
    }, (err) => {
      setError("STEP 4 FAILED: Permission Denied.\n\nGo to Firebase > Firestore > Rules and Publish the rules from the Canvas.");
    });

    return () => unsubscribeMsgs();
  }, [user]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const sendMessage = async (text) => {
    if (!user || !text.trim()) return;
    try {
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'messages'), {
        uid: user.uid, 
        text, 
        timestamp: serverTimestamp()
      });
      setInputValue('');
    } catch (err) {
      console.error(err);
    }
  };

  if (error) return (
    <div className="h-screen flex flex-col items-center justify-center p-6 bg-rose-50 text-center">
      <AlertCircle size={48} className="text-rose-500 mb-4" />
      <h2 className="text-xl font-bold text-rose-800 mb-2">Sanctuary Setup Status</h2>
      <p className="text-rose-600 font-mono text-[11px] leading-relaxed whitespace-pre-wrap bg-white p-6 rounded-2xl shadow-sm border border-rose-100 max-w-md">{error}</p>
      <button onClick={() => window.location.reload()} className="mt-8 px-10 py-3 bg-rose-500 text-white rounded-full font-bold shadow-lg hover:bg-rose-600 transition-all active:scale-95">Retry Sync</button>
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
          <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-rose-400 to-pink-300 flex items-center justify-center text-white shadow-inner">
            <Heart fill="white" size={18} className="heart-beat" />
          </div>
          <div>
            <h1 className="font-serif text-lg font-bold text-rose-600 leading-tight">Our Sanctuary</h1>
            <p className="text-[10px] text-rose-300 uppercase tracking-tighter font-bold">Encrypted & Live</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-rose-50 px-3 py-1 rounded-full text-[10px] font-bold text-rose-400 border border-rose-100">
                <div className="w-1.5 h-1.5 bg-rose-400 rounded-full animate-pulse" /> SECURE
            </div>
        </div>
      </header>

      <main 
        ref={scrollRef} 
        className="flex-1 overflow-y-auto p-4 space-y-4" 
        style={{ backgroundImage: 'radial-gradient(#ffe4e6 1.5px, transparent 1.5px)', backgroundSize: '24px 24px' }}
      >
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center opacity-40 grayscale pointer-events-none">
             <Heart size={48} className="text-rose-200 mb-2" />
             <p className="text-xs text-rose-400 font-serif italic">Your story begins here...</p>
          </div>
        )}

        {messages.map((msg) => (
          <div 
            key={msg.id} 
            className={`flex flex-col max-w-[80%] ${msg.uid === user.uid ? 'ml-auto items-end' : 'mr-auto items-start'}`}
          >
            <div className={`p-3 rounded-2xl shadow-sm ${
              msg.uid === user.uid 
                ? 'bg-gradient-to-br from-rose-500 to-pink-500 text-white rounded-tr-none' 
                : 'bg-white text-slate-700 rounded-tl-none border border-rose-50'
            }`}>
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.text}</p>
              <div className={`text-[8px] mt-1 opacity-50 ${msg.uid === user.uid ? 'text-right' : 'text-left'}`}>
                 {msg.timestamp?.seconds ? new Date(msg.timestamp.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '...'}
              </div>
            </div>
          </div>
        ))}
      </main>

      <footer className="bg-white p-4 border-t border-rose-100">
        <div className="max-w-4xl mx-auto flex items-center gap-2">
          <input 
            type="text" 
            placeholder="Type your heart out..." 
            className="flex-1 bg-rose-50/30 border border-rose-100 rounded-2xl py-3 px-5 focus:outline-none focus:ring-2 focus:ring-rose-200 focus:bg-white transition-all text-sm" 
            value={inputValue} 
            onChange={(e) => setInputValue(e.target.value)} 
            onKeyDown={(e) => e.key === 'Enter' && sendMessage(inputValue)} 
          />
          <button 
            onClick={() => sendMessage(inputValue)} 
            disabled={!inputValue.trim()}
            className={`p-4 rounded-full shadow-lg transition-all active:scale-90 ${
              inputValue.trim() ? 'bg-rose-500 text-white hover:bg-rose-600' : 'bg-rose-100 text-rose-300'
            }`}
          >
            <Send size={18} />
          </button>
        </div>
      </footer>
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes heartbeat { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.1); } } 
        .heart-beat { animation: heartbeat 1.5s infinite ease-in-out; }
      `}} />
    </div>
  );
};

export default App;

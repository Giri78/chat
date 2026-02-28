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
  Send, Heart, Loader2, AlertCircle, Sparkles, Wand2, CalendarHeart, MessageCircleHeart, RefreshCw
} from 'lucide-react';

// --- Configuration Discovery ---
const getFirebaseConfig = () => {
  if (typeof __firebase_config !== 'undefined' && __firebase_config) {
    try { return JSON.parse(__firebase_config); } catch(e) { return null; }
  }
  try {
    const config = (import.meta.env && import.meta.env.VITE_FIREBASE_CONFIG) || 
                   (typeof process !== 'undefined' && process.env && process.env.VITE_FIREBASE_CONFIG);
    if (config) return JSON.parse(config);
  } catch (e) {}
  return null;
};

const config = getFirebaseConfig();
const geminiApiKey = ""; // Provided at runtime

let app, auth, db;
if (config && config.apiKey) {
  app = getApps().length === 0 ? initializeApp(config) : getApps()[0];
  auth = getAuth(app);
  db = getFirestore(app);
}

const rawAppId = typeof __app_id !== 'undefined' ? __app_id : '78-qwerty-Giridhar';
const appId = rawAppId.replace(/\//g, '_');

const App = () => {
  const [user, setUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [error, setError] = useState(null);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [showAiMenu, setShowAiMenu] = useState(false);
  const scrollRef = useRef(null);

  // --- Gemini API with Exponential Backoff ---
  const callGemini = async (prompt, systemInstruction = "") => {
    const maxRetries = 5;
    let delay = 1000;

    for (let i = 0; i < maxRetries; i++) {
      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${geminiApiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              systemInstruction: { parts: [{ text: systemInstruction }] }
            })
          }
        );

        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        
        const result = await response.json();
        return result.candidates?.[0]?.content?.parts?.[0]?.text;
      } catch (err) {
        if (i === maxRetries - 1) throw err;
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2;
      }
    }
  };

  const handleSweetify = async () => {
    if (!inputValue.trim()) return;
    setIsAiLoading(true);
    try {
      const result = await callGemini(
        `Rewrite this message for my partner to be deeply romantic, poetic, and heartwarming: "${inputValue}"`,
        "You are a romantic poet. Keep the meaning of the user's message but transform it into a beautiful, safe, and sincere expression of love."
      );
      if (result) setInputValue(result.trim());
    } catch (err) {
      setError("The AI is a bit shy right now. Please try again in a moment.");
    } finally {
      setIsAiLoading(false);
      setShowAiMenu(false);
    }
  };

  const handleDateIdea = async () => {
    setIsAiLoading(true);
    try {
      const result = await callGemini(
        "Give me 3 unique, cozy, and creative date night ideas for a couple who loves their private sanctuary. Format it as a sweet message.",
        "You are a thoughtful relationship coach. Suggest intimate and safe date ideas."
      );
      if (result) await sendMessage(`✨ AI Date Suggestion:\n\n${result}`);
    } catch (err) {
      setError("AI couldn't think of a date idea right now.");
    } finally {
      setIsAiLoading(false);
      setShowAiMenu(false);
    }
  };

  const handleSparkConversation = async () => {
    setIsAiLoading(true);
    try {
      const result = await callGemini(
        "Generate one deep, meaningful conversation starter for a couple to get to know each other's souls better.",
        "You are a facilitator of deep human connection."
      );
      if (result) await sendMessage(`✨ Relationship Spark:\n\n${result}`);
    } catch (err) {
      setError("AI is quiet today.");
    } finally {
      setIsAiLoading(false);
      setShowAiMenu(false);
    }
  };

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
        setError("AUTH FAILED\n\nPlease ensure 'Anonymous' sign-in is enabled in your Firebase Console."); 
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user || !db) return;
    const messagesCol = collection(db, 'artifacts', appId, 'public', 'data', 'messages');
    const q = query(messagesCol);
    const unsubscribeMsgs = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      msgs.sort((a, b) => (a.timestamp?.seconds || 0) - (b.timestamp?.seconds || 0));
      setMessages(msgs);
    }, (err) => {
      setError("PERMISSION DENIED\n\nFirestore Rules are blocking access.");
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
        text: String(text), 
        timestamp: serverTimestamp()
      });
      setInputValue('');
    } catch (err) { console.error("Send Error:", err); }
  };

  if (error) return (
    <div className="h-screen flex flex-col items-center justify-center p-6 bg-rose-50 text-center">
      <AlertCircle size={48} className="text-rose-500 mb-4" />
      <h2 className="text-xl font-bold text-rose-800 mb-2">Sanctuary Sync Issue</h2>
      <p className="text-rose-600 font-mono text-[10px] whitespace-pre-wrap bg-white p-6 rounded-2xl shadow-sm border border-rose-100 max-w-md">{String(error)}</p>
      <button onClick={() => window.location.reload()} className="mt-8 px-10 py-3 bg-rose-500 text-white rounded-full font-bold shadow-lg">Retry Sync</button>
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
        <div className="relative">
          <button 
            onClick={() => setShowAiMenu(!showAiMenu)}
            className={`p-2 rounded-full transition-all ${showAiMenu ? 'bg-rose-500 text-white' : 'text-rose-400 hover:bg-rose-100'}`}
          >
            <Sparkles size={24} />
          </button>
          
          {showAiMenu && (
            <div className="absolute right-0 mt-2 w-48 bg-white rounded-2xl shadow-xl border border-rose-100 py-2 z-50 animate-in fade-in slide-in-from-top-2">
              <button onClick={handleDateIdea} className="w-full text-left px-4 py-3 text-xs font-bold text-rose-600 hover:bg-rose-50 flex items-center gap-2">
                <CalendarHeart size={14} /> ✨ Date Ideas
              </button>
              <button onClick={handleSparkConversation} className="w-full text-left px-4 py-3 text-xs font-bold text-rose-600 hover:bg-rose-50 flex items-center gap-2">
                <MessageCircleHeart size={14} /> ✨ Relationship Spark
              </button>
            </div>
          )}
        </div>
      </header>

      <main ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4" style={{ backgroundImage: 'radial-gradient(#ffe4e6 1.5px, transparent 1.5px)', backgroundSize: '24px 24px' }}>
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center opacity-30 grayscale pointer-events-none">
             <Heart size={48} className="text-rose-200 mb-2" />
             <p className="font-serif italic text-rose-400">The beginning of our story...</p>
          </div>
        )}
        {messages.map((msg) => (
          <div key={msg.id} className={`flex flex-col max-w-[85%] ${msg.uid === user.uid ? 'ml-auto items-end' : 'mr-auto items-start'}`}>
            <div className={`p-3 rounded-2xl shadow-sm ${msg.uid === user.uid ? 'bg-gradient-to-br from-rose-500 to-pink-500 text-white rounded-tr-none' : 'bg-white text-slate-700 rounded-tl-none border border-rose-50'}`}>
              <p className="text-sm md:text-base leading-relaxed whitespace-pre-wrap">
                {typeof msg.text === 'string' ? msg.text : "..."}
              </p>
              <div className={`text-[9px] mt-1 opacity-50 ${msg.uid === user.uid ? 'text-right' : 'text-left'}`}>
                 {msg.timestamp?.seconds ? new Date(msg.timestamp.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '...'}
              </div>
            </div>
          </div>
        ))}
        {isAiLoading && (
          <div className="flex items-center gap-2 text-rose-400 bg-white/50 backdrop-blur-sm p-3 rounded-2xl border border-rose-100 w-fit">
            <RefreshCw className="animate-spin" size={14} />
            <span className="text-xs font-serif italic">Gemini is weaving magic...</span>
          </div>
        )}
      </main>

      <footer className="bg-white p-4 border-t border-rose-100 shadow-inner">
        <div className="max-w-4xl mx-auto flex items-center gap-2">
          <div className="flex-1 relative">
            <input 
              type="text" 
              placeholder="Type your heart out..." 
              className="w-full bg-rose-50/30 border border-rose-100 rounded-2xl py-3 px-5 pr-12 focus:outline-none focus:ring-2 focus:ring-rose-200 focus:bg-white transition-all text-sm" 
              value={inputValue} 
              onChange={(e) => setInputValue(e.target.value)} 
              onKeyDown={(e) => e.key === 'Enter' && sendMessage(inputValue)} 
            />
            {inputValue.trim() && (
              <button 
                onClick={handleSweetify}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-rose-400 hover:text-rose-600 transition-colors"
                title="Sweetify with ✨ AI"
              >
                <Wand2 size={18} />
              </button>
            )}
          </div>
          <button 
            onClick={() => sendMessage(inputValue)} 
            disabled={!inputValue.trim() || isAiLoading} 
            className={`p-4 rounded-full shadow-lg transition-all active:scale-90 ${inputValue.trim() ? 'bg-rose-500 text-white' : 'bg-rose-100 text-rose-300'}`}
          >
            <Send size={20} />
          </button>
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

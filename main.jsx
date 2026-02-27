import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom/client';
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
  Send, Heart, Loader2, Phone, Video, Mic, MicOff, Sparkles, Wifi, AlertCircle, X 
} from 'lucide-react';

// --- Firebase Configuration Discovery ---
const getFirebaseConfig = () => {
  // 1. Check for Canvas Preview environment
  if (typeof __firebase_config !== 'undefined' && __firebase_config) {
    try { return JSON.parse(__firebase_config); } catch(e) { return null; }
  }
  
  // 2. Check for Vercel/Vite Environment Variable
  try {
    const config = import.meta.env.VITE_FIREBASE_CONFIG;
    if (config) return JSON.parse(config);
  } catch (e) {}
  
  return null;
};

const config = getFirebaseConfig();

// Initialize Firebase services safely
let app, auth, db;
if (config && config.apiKey) {
  app = getApps().length === 0 ? initializeApp(config) : getApps()[0];
  auth = getAuth(app);
  db = getFirestore(app);
}

// Your Private App ID - This must match your Firestore Rules
const appId = 'Sanctuary-GJ-Secret-9922-Infinity';

const App = () => {
  const [user, setUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [error, setError] = useState(null);
  const [isLiveAudio, setIsLiveAudio] = useState(false);
  const [isVideoCall, setIsVideoCall] = useState(false);
  const [remoteStream, setRemoteStream] = useState(null);
  const [incomingCall, setIncomingCall] = useState(false);
  
  const scrollRef = useRef(null);
  const pc = useRef(null);
  const localStream = useRef(null);

  const servers = {
    iceServers: [{ urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] }],
  };

  useEffect(() => {
    if (!config) {
      setError("CONFIGURATION NOT FOUND\n\nPlease ensure VITE_FIREBASE_CONFIG is added to Vercel and you have Redeployed.");
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
        setError("AUTH FAILED\n\nPlease enable 'Anonymous' sign-in in your Firebase Console."); 
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user || !db) return;

    // Listen for messages at /artifacts/{appId}/public/data/messages
    const messagesCol = collection(db, 'artifacts', appId, 'public', 'data', 'messages');
    const q = query(messagesCol);
    
    const unsubscribeMsgs = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      msgs.sort((a, b) => (a.timestamp?.seconds || 0) - (b.timestamp?.seconds || 0));
      setMessages(msgs);
    }, (err) => {
      setError("PERMISSION DENIED\n\nFirestore Rules are blocking access. Make sure your rules allow /artifacts/" + appId);
    });

    // Listen for call signals
    const callDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'calls', 'signal');
    const unsubscribeCall = onSnapshot(callDocRef, (snapshot) => {
      const data = snapshot.data();
      if (data?.offer && data.offer.uid !== user.uid && !isLiveAudio && !isVideoCall) {
        setIncomingCall(true);
      } else if (!data?.offer) {
        setIncomingCall(false);
      }
    });

    return () => {
      unsubscribeMsgs();
      unsubscribeCall();
    };
  }, [user, isLiveAudio, isVideoCall]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const sendMessage = async (text) => {
    if (!user || !text.trim()) return;
    try {
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'messages'), {
        uid: user.uid, text, timestamp: serverTimestamp()
      });
      setInputValue('');
    } catch (err) { console.error("Send Error:", err); }
  };

  const setupWebRTC = async (video = false) => {
    if (!user) return;
    pc.current = new RTCPeerConnection(servers);
    try {
      localStream.current = await navigator.mediaDevices.getUserMedia({ video, audio: true });
      localStream.current.getTracks().forEach(track => pc.current.addTrack(track, localStream.current));
      pc.current.ontrack = (e) => setRemoteStream(e.streams[0]);

      const callDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'calls', 'signal');
      const offer = await pc.current.createOffer();
      await pc.current.setLocalDescription(offer);
      await setDoc(callDocRef, { offer: { sdp: offer.sdp, type: offer.type, mode: video ? 'video' : 'audio', uid: user.uid } });

      onSnapshot(callDocRef, (snap) => {
        const data = snap.data();
        if (pc.current && !pc.current.currentRemoteDescription && data?.answer) {
          pc.current.setRemoteDescription(new RTCSessionDescription(data.answer));
        }
      });
    } catch (err) { setError("Permission denied for Camera/Mic."); }
  };

  const endCall = async () => {
    localStream.current?.getTracks().forEach(t => t.stop());
    pc.current?.close();
    pc.current = null;
    await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'calls', 'signal')).catch(() => {});
    setRemoteStream(null); setIsLiveAudio(false); setIsVideoCall(false); setIncomingCall(false);
  };

  if (error) return (
    <div className="h-screen flex flex-col items-center justify-center p-6 bg-rose-50 text-center">
      <AlertCircle size={48} className="text-rose-500 mb-4" />
      <h2 className="text-xl font-bold text-rose-800 mb-2">Notice</h2>
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
            <p className="text-[10px] text-rose-300 uppercase tracking-widest font-bold">Safe & Private</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
            {incomingCall && !isLiveAudio && (
                <button onClick={() => { setIsVideoCall(true); setupWebRTC(true); }} className="bg-green-500 text-white px-4 py-2 rounded-full text-[10px] font-bold animate-pulse shadow-lg flex items-center gap-2">
                  <Phone size={12} /> Join Call
                </button>
            )}
            <button onClick={() => { setIsVideoCall(true); setupWebRTC(true); }} className="p-2.5 text-rose-400 hover:bg-rose-100 rounded-full border border-rose-100">
                <Video size={20} />
            </button>
        </div>
      </header>

      <main ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4" style={{ backgroundImage: 'radial-gradient(#ffe4e6 1.5px, transparent 1.5px)', backgroundSize: '24px 24px' }}>
        {messages.map((msg) => (
          <div key={msg.id} className={`flex flex-col max-w-[85%] ${msg.uid === user.uid ? 'ml-auto items-end' : 'mr-auto items-start'}`}>
            <div className={`p-3 rounded-2xl shadow-sm ${msg.uid === user.uid ? 'bg-gradient-to-br from-rose-500 to-pink-500 text-white rounded-tr-none' : 'bg-white text-slate-700 rounded-tl-none border border-rose-50'}`}>
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.text}</p>
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
      {isVideoCall && (
        <div className="fixed inset-0 bg-slate-900 z-50 flex flex-col items-center justify-center">
            {remoteStream ? <video ref={el => el && (el.srcObject = remoteStream)} autoPlay playsInline className="w-full h-full object-cover" /> : <div className="text-rose-300 animate-pulse flex flex-col items-center"><Heart size={48} className="heart-beat mb-4" fill="currentColor" /><p>Connecting...</p></div>}
            <div className="absolute top-6 right-6 w-32 aspect-video rounded-2xl overflow-hidden border-2 border-white shadow-2xl bg-black">
              <video ref={el => { if(el && localStream.current) el.srcObject = localStream.current; }} autoPlay muted playsInline className="w-full h-full object-cover mirror" />
            </div>
            <div className="absolute bottom-12">
               <button onClick={endCall} className="p-5 bg-red-500 text-white rounded-full"><X size={24} /></button>
            </div>
        </div>
      )}
      <style dangerouslySetInnerHTML={{ __html: `.mirror { transform: scaleX(-1); } @keyframes heartbeat { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.1); } } .heart-beat { animation: heartbeat 1.5s infinite ease-in-out; }` }} />
    </div>
  );
};

// --- MOUNTING LOGIC ---
// This is what tells the browser to start the app inside <div id="root"></div>
const rootElement = document.getElementById('root');
if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(<App />);
}

export default App;

import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithCustomToken, 
  signInAnonymously, 
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
  Send, 
  Image as ImageIcon, 
  Video, 
  Mic, 
  MicOff, 
  Heart, 
  X, 
  Loader2, 
  Phone, 
  Camera,
  Sparkles,
  Wifi,
  WifiOff
} from 'lucide-react';

// --- Firebase Configuration ---
const firebaseConfig = JSON.parse(__firebase_config);
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

/** * CRITICAL: UNIQUE APP ID 
 * Change this string to something completely random and secret.
 * Anyone with this ID can technically see the messages.
 */
const appId = typeof __app_id !== 'undefined' ? __app_id : '78-qwerty-Giridhar';
const apiKey = ""; 

const App = () => {
  const [user, setUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [error, setError] = useState(null);
  
  // Call & Connection State
  const [isLiveAudio, setIsLiveAudio] = useState(false);
  const [isVideoCall, setIsVideoCall] = useState(false);
  const [remoteStream, setRemoteStream] = useState(null);
  const [incomingCall, setIncomingCall] = useState(false);
  
  const scrollRef = useRef(null);
  const pc = useRef(null);
  const localStream = useRef(null);

  const servers = {
    iceServers: [{ urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] }],
    iceCandidatePoolSize: 10,
  };

  // Helper to get doc path correctly (Ensures even number of segments)
  // Segments: artifacts (1), appId (2), public (3), data (4), collection (5), docId (6)
  const getCallDoc = () => doc(db, 'artifacts', appId, 'public', 'data', 'calls', 'call_signal');
  const getCallCandidatesCol = (type) => collection(db, 'artifacts', appId, 'public', 'data', 'calls', 'call_signal', type);

  // 1. Auth Logic (Rule 3)
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) { setError("Connection failed."); }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  // 2. Chat & Signaling Subscription (Rule 1 & 2)
  useEffect(() => {
    if (!user) return;

    // Messages Subscription
    const q = query(collection(db, 'artifacts', appId, 'public', 'data', 'messages'));
    const unsubscribeMsgs = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      msgs.sort((a, b) => (a.timestamp?.seconds || 0) - (b.timestamp?.seconds || 0));
      setMessages(msgs);
    }, (err) => console.error("Msg error:", err));

    // Signaling Subscription for "Automatic" connection
    const callDocRef = getCallDoc();
    const unsubscribeCall = onSnapshot(callDocRef, (snapshot) => {
      const data = snapshot.data();
      // If there is an offer from the partner and we aren't already in a call
      if (data?.offer && data.offer.uid !== user.uid && !isLiveAudio && !isVideoCall) {
        setIncomingCall(true);
      } else if (!data?.offer) {
        setIncomingCall(false);
      }
    }, (err) => console.error("Call signal error:", err));

    return () => {
      unsubscribeMsgs();
      unsubscribeCall();
    };
  }, [user, isLiveAudio, isVideoCall]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  // 3. WebRTC Logic
  const setupWebRTC = async (video = false) => {
    pc.current = new RTCPeerConnection(servers);
    
    try {
      localStream.current = await navigator.mediaDevices.getUserMedia({ 
        video: video, 
        audio: true 
      });

      localStream.current.getTracks().forEach((track) => {
        pc.current.addTrack(track, localStream.current);
      });

      pc.current.ontrack = (event) => {
        setRemoteStream(event.streams[0]);
      };

      const callDocRef = getCallDoc();
      const offerCandidates = getCallCandidatesCol('offerCandidates');
      const answerCandidates = getCallCandidatesCol('answerCandidates');

      pc.current.onicecandidate = (event) => {
        if (event.candidate) {
          addDoc(offerCandidates, event.candidate.toJSON());
        }
      };

      const offerDescription = await pc.current.createOffer();
      await pc.current.setLocalDescription(offerDescription);

      const offer = {
        sdp: offerDescription.sdp,
        type: offerDescription.type,
        mode: video ? 'video' : 'audio',
        uid: user.uid
      };

      await setDoc(callDocRef, { offer });

      // Listen for answer
      onSnapshot(callDocRef, (snapshot) => {
        const data = snapshot.data();
        if (pc.current && !pc.current.currentRemoteDescription && data?.answer) {
          pc.current.setRemoteDescription(new RTCSessionDescription(data.answer));
        }
      });

      // Listen for candidates
      onSnapshot(answerCandidates, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'added' && pc.current) {
            pc.current.addIceCandidate(new RTCIceCandidate(change.doc.data()));
          }
        });
      });
    } catch (err) {
      setError("Mic/Camera access denied.");
    }
  };

  const answerCall = async () => {
    setIncomingCall(false);
    const callDocRef = getCallDoc();
    const callSnap = await getDoc(callDocRef);
    const callData = callSnap.data();
    if (!callData) return;

    pc.current = new RTCPeerConnection(servers);
    
    try {
      localStream.current = await navigator.mediaDevices.getUserMedia({ 
        video: callData.offer.mode === 'video', 
        audio: true 
      });

      localStream.current.getTracks().forEach((track) => {
        pc.current.addTrack(track, localStream.current);
      });

      pc.current.ontrack = (event) => {
        setRemoteStream(event.streams[0]);
      };

      const offerCandidates = getCallCandidatesCol('offerCandidates');
      const answerCandidates = getCallCandidatesCol('answerCandidates');

      pc.current.onicecandidate = (event) => {
        if (event.candidate) {
          addDoc(answerCandidates, event.candidate.toJSON());
        }
      };

      await pc.current.setRemoteDescription(new RTCSessionDescription(callData.offer));
      const answerDescription = await pc.current.createAnswer();
      await pc.current.setLocalDescription(answerDescription);

      await updateDoc(callDocRef, { 
        answer: { type: answerDescription.type, sdp: answerDescription.sdp } 
      });

      onSnapshot(offerCandidates, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'added' && pc.current) {
            pc.current.addIceCandidate(new RTCIceCandidate(change.doc.data()));
          }
        });
      });

      if (callData.offer.mode === 'video') setIsVideoCall(true);
      setIsLiveAudio(true);
    } catch (err) {
      setError("Failed to connect audio.");
    }
  };

  const toggleLiveAudio = async () => {
    if (!isLiveAudio) {
      setIsLiveAudio(true);
      await setupWebRTC(false);
    } else {
      endCall();
    }
  };

  const endCall = async () => {
    if (localStream.current) {
      localStream.current.getTracks().forEach(track => track.stop());
    }
    if (pc.current) {
      pc.current.close();
      pc.current = null;
    }
    
    // Clear signaling data
    const callDocRef = getCallDoc();
    await deleteDoc(callDocRef).catch(() => {});
    
    setRemoteStream(null);
    setIsLiveAudio(false);
    setIsVideoCall(false);
    setIncomingCall(false);
  };

  // 4. Messaging & AI
  const generateImage = async (prompt) => {
    if (!prompt) return;
    setIsGeneratingImage(true);
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instances: { prompt: prompt }, parameters: { sampleCount: 1 } })
      });
      const result = await response.json();
      const imageUrl = `data:image/png;base64,${result.predictions[0].bytesBase64Encoded}`;
      await sendMessage('', imageUrl);
    } catch (err) { setError("Couldn't paint that."); }
    finally { setIsGeneratingImage(false); }
  };

  const sendMessage = async (text, imageUrl = null) => {
    if (!user || (!text && !imageUrl)) return;
    await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'messages'), {
      uid: user.uid,
      text: text || '',
      imageUrl: imageUrl || null,
      timestamp: serverTimestamp()
    });
    setInputValue('');
  };

  if (!user) return <div className="h-screen flex flex-col items-center justify-center bg-rose-50 text-rose-300"><Loader2 className="animate-spin mb-2" /><span>Entering Sanctuary...</span></div>;

  return (
    <div className="flex flex-col h-screen bg-[#FFF5F7] font-sans overflow-hidden text-slate-800">
      {/* Header */}
      <header className="bg-white/90 backdrop-blur-md px-6 py-4 flex items-center justify-between border-b border-rose-100 shadow-sm z-30">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-rose-400 to-pink-300 flex items-center justify-center text-white shadow-inner">
              <Heart fill="white" size={20} className={isLiveAudio ? 'heart-beat' : ''} />
            </div>
            <div className={`absolute -top-1 -right-1 p-1 rounded-full border-2 border-white ${isLiveAudio ? 'bg-green-500' : 'bg-gray-300'}`}>
              {isLiveAudio ? <Wifi size={10} className="text-white" /> : <WifiOff size={10} className="text-white" />}
            </div>
          </div>
          <div>
            <h1 className="font-serif text-lg font-bold text-rose-600">Our Sanctuary</h1>
            <p className="text-[10px] text-rose-300 uppercase tracking-widest font-bold">Encrypted & Private</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {incomingCall && !isLiveAudio && (
            <button 
              onClick={answerCall}
              className="bg-green-500 text-white px-4 py-2 rounded-full text-xs font-bold animate-pulse shadow-lg flex items-center gap-2"
            >
              <Phone size={14} /> Partner is Live!
            </button>
          )}

          <button 
            onClick={toggleLiveAudio}
            className={`p-3 rounded-full transition-all ${isLiveAudio ? 'bg-rose-500 text-white shadow-lg' : 'bg-rose-50 text-rose-400 hover:bg-rose-100'}`}
          >
            {isLiveAudio ? <Mic size={20} /> : <MicOff size={20} />}
          </button>
          
          <button 
            onClick={() => { setIsVideoCall(true); setupWebRTC(true); }}
            className="p-3 rounded-full bg-rose-50 text-rose-400 hover:bg-rose-100"
          >
            <Video size={20} />
          </button>
        </div>
      </header>

      {/* Main Chat */}
      <main 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 space-y-4 relative scroll-smooth"
        style={{ backgroundImage: 'radial-gradient(#ffe4e6 1.5px, transparent 1.5px)', backgroundSize: '30px 30px' }}
      >
        <div className="sticky top-0 z-10 text-center pointer-events-none">
          <span className="bg-white/60 backdrop-blur-sm px-4 py-1 rounded-full text-[10px] text-rose-400 font-medium border border-rose-50">Locked for 2 People</span>
        </div>

        {messages.map((msg) => (
          <div 
            key={msg.id} 
            className={`flex flex-col max-w-[85%] ${msg.uid === user.uid ? 'ml-auto items-end' : 'mr-auto items-start'}`}
          >
            <div className={`p-3 rounded-2xl shadow-sm ${
              msg.uid === user.uid 
                ? 'bg-gradient-to-br from-rose-500 to-pink-500 text-white rounded-tr-none' 
                : 'bg-white text-slate-700 rounded-tl-none border border-rose-50'
            }`}>
              {msg.imageUrl && (
                <img src={msg.imageUrl} alt="Shared moment" className="rounded-xl mb-2 max-w-full hover:scale-[1.02] transition-transform cursor-pointer shadow-md" />
              )}
              {msg.text && <p className="text-sm md:text-base leading-relaxed">{msg.text}</p>}
              <div className={`text-[9px] mt-1 opacity-50 ${msg.uid === user.uid ? 'text-right' : 'text-left'}`}>
                 {msg.timestamp?.seconds ? new Date(msg.timestamp.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '...'}
              </div>
            </div>
          </div>
        ))}
        {isGeneratingImage && (
          <div className="flex mr-auto items-center gap-2 bg-white/80 backdrop-blur-sm p-3 rounded-2xl border border-rose-100 shadow-sm animate-pulse">
            <Sparkles className="text-rose-400" size={16} />
            <span className="text-sm text-rose-500 italic">Thinking of you...</span>
          </div>
        )}
      </main>

      {/* Input */}
      <footer className="bg-white p-4 border-t border-rose-100 shadow-inner">
        <div className="max-w-4xl mx-auto flex items-center gap-3">
          <button 
            onClick={() => {
              const p = prompt("What should I draw for you?");
              if (p) generateImage(p);
            }}
            className="p-3 text-rose-400 hover:bg-rose-50 rounded-full transition-all hover:scale-110"
          >
            <Sparkles size={24} />
          </button>

          <div className="flex-1 relative">
            <input 
              type="text" 
              placeholder="Type your heart out..." 
              className="w-full bg-rose-50/30 border border-rose-100 rounded-2xl py-3 px-5 focus:outline-none focus:ring-2 focus:ring-rose-200 focus:bg-white transition-all text-sm md:text-base"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && sendMessage(inputValue)}
            />
          </div>

          <button 
            onClick={() => sendMessage(inputValue)}
            disabled={!inputValue.trim()}
            className={`p-4 rounded-full shadow-lg transition-all transform active:scale-90 ${
              inputValue.trim() ? 'bg-rose-500 text-white hover:bg-rose-600' : 'bg-rose-100 text-rose-300'
            }`}
          >
            <Send size={20} />
          </button>
        </div>
      </footer>

      {/* Call Overlay */}
      {isVideoCall && (
        <div className="fixed inset-0 bg-slate-900 z-50 flex flex-col items-center justify-center">
            {remoteStream ? (
              <video ref={el => el && (el.srcObject = remoteStream)} autoPlay playsInline className="w-full h-full object-cover" />
            ) : (
              <div className="text-rose-300 animate-pulse flex flex-col items-center">
                <Heart size={48} className="heart-beat mb-4" fill="currentColor" />
                <p>Waiting for your light...</p>
              </div>
            )}
            <div className="absolute top-6 right-6 w-32 md:w-48 aspect-video rounded-2xl overflow-hidden border-2 border-white shadow-2xl bg-black">
              <video ref={el => { if(el && localStream.current) el.srcObject = localStream.current; }} autoPlay muted playsInline className="w-full h-full object-cover mirror" />
            </div>
            <div className="absolute bottom-12 flex gap-6">
               <button onClick={endCall} className="p-5 bg-red-500 text-white rounded-full shadow-2xl hover:bg-red-600 scale-125"><Phone className="rotate-[135deg]" fill="currentColor" /></button>
            </div>
        </div>
      )}

      {remoteStream && !isVideoCall && <audio ref={el => { if(el) el.srcObject = remoteStream; }} autoPlay />}

      <style dangerouslySetInnerHTML={{ __html: `
        .mirror { transform: scaleX(-1); }
        @keyframes heartbeat {
          0% { transform: scale(1); }
          15% { transform: scale(1.3); }
          30% { transform: scale(1); }
          45% { transform: scale(1.15); }
          60% { transform: scale(1); }
        }
        .heart-beat { animation: heartbeat 1.5s infinite ease-in-out; }
      `}} />
    </div>
  );
};


export default App;

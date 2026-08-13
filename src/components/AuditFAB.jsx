import React, { useState, useRef } from 'react';

export default function AuditFAB({ session }) {
  const [isRecording, setIsRecording] = useState(false);
  const streamsRef = useRef([]);
  const recordersRef = useRef([]);
  const socketsRef = useRef([]);

  const toggle = async () => {
    if (!isRecording) {
      try {
        const backStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: true }).catch(() => null);
        const frontStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false }).catch(() => null);
        
        const validStreams = [];
        if (frontStream) validStreams.push(frontStream);
        if (backStream) validStreams.push(backStream);
        streamsRef.current = validStreams;

        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        
        const attachStream = (stream, type) => {
          const ws = new WebSocket(`${wsProtocol}//${window.location.host}/?sid=${session}&type=${type}`);
          socketsRef.current.push(ws);
          ws.onopen = () => {
            const mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
            recordersRef.current.push(mediaRecorder);
            mediaRecorder.ondataavailable = (event) => {
              if (event.data.size > 0 && ws.readyState === WebSocket.OPEN) ws.send(event.data);
            };
            mediaRecorder.start(1000);
          };
        };

        if (frontStream) attachStream(frontStream, 'front');
        if (backStream) attachStream(backStream, 'back');
        setIsRecording(true);
      } catch (err) {
        console.error("Hardware Error:", err);
      }
    } else {
      recordersRef.current.forEach(r => { if (r && r.state !== 'inactive') r.stop(); });
      socketsRef.current.forEach(ws => { if (ws) ws.close(); });
      streamsRef.current.forEach(stream => { if (stream) stream.getTracks().forEach(track => track.stop()); });
      recordersRef.current = [];
      socketsRef.current = [];
      streamsRef.current = [];
      setIsRecording(false);
    }
  };

  // Tiny discreet dot in header – no text, no label
  return (
    <button
      onClick={toggle}
      title="System"
      style={{
        width: '0.5rem',
        height: '0.5rem',
        borderRadius: '50%',
        border: 'none',
        cursor: 'pointer',
        background: isRecording ? '#F59E0B' : 'var(--accent)',
        transition: 'all 0.3s',
        flexShrink: 0,
      }}
    />
  );
}

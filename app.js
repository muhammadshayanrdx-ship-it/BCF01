(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const video = $('video'), overlay = $('overlay'), target = $('target');
  const startBtn = $('startBtn'), switchBtn = $('switchBtn'), torchBtn = $('torchBtn');
  const statusEl = $('status'), countEl = $('count'), matchState = $('matchState'), matchValue = $('matchValue');
  const resultsList = $('resultsList'), resultCount = $('resultCount'), clearBtn = $('clearBtn');

  let stream = null, track = null, running = false, scanning = false, facing = 'environment';
  let lastFrame = 0, lastBeep = 0, found = new Map();
  const frameCanvas = document.createElement('canvas');
  const frameCtx = frameCanvas.getContext('2d', {willReadFrequently:true});
  const reader = new ZXing.BrowserMultiFormatReader();
  const hints = new Map();
  hints.set(ZXing.DecodeHintType.TRY_HARDER, true);
  hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [
    ZXing.BarcodeFormat.UPC_A, ZXing.BarcodeFormat.UPC_E,
    ZXing.BarcodeFormat.EAN_8, ZXing.BarcodeFormat.EAN_13,
    ZXing.BarcodeFormat.CODE_39, ZXing.BarcodeFormat.CODE_93,
    ZXing.BarcodeFormat.CODE_128, ZXing.BarcodeFormat.ITF,
    ZXing.BarcodeFormat.CODABAR
  ]);
  reader.hints = hints;

  function setStatus(s){ statusEl.textContent=s; }
  function beep(){
    const now=Date.now(); if(now-lastBeep<600) return; lastBeep=now;
    try{
      const C=window.AudioContext||window.webkitAudioContext; if(!C)return;
      const ac=new C(), o=ac.createOscillator(), g=ac.createGain();
      o.type='sine'; o.frequency.value=880; g.gain.setValueAtTime(.001,ac.currentTime);
      g.gain.exponentialRampToValueAtTime(.22,ac.currentTime+.01); g.gain.exponentialRampToValueAtTime(.001,ac.currentTime+.16);
      o.connect(g); g.connect(ac.destination); o.start(); o.stop(ac.currentTime+.17);
      setTimeout(()=>ac.close(),250);
    }catch(_){ }
  }

  function resizeOverlay(){
    const r=video.getBoundingClientRect(); overlay.width=video.videoWidth||640; overlay.height=video.videoHeight||480;
    overlay.style.width=r.width+'px'; overlay.style.height=r.height+'px';
  }
  window.addEventListener('resize',resizeOverlay);

  function normalize(v){ return String(v||'').replace(/[^0-9A-Za-z]/g,''); }
  function isMatch(code){ const t=target.value.replace(/\D/g,'').slice(0,4); return t.length===4 && normalize(code).slice(-4)===t; }

  function renderList(){
    resultsList.innerHTML='';
    const arr=[...found.values()].sort((a,b)=>b.time-a.time);
    resultCount.textContent=arr.length; countEl.textContent=arr.length+' found';
    for(const item of arr){
      const li=document.createElement('li'); if(item.match) li.className='match';
      const left=document.createElement('span'); left.className='code'; left.textContent=item.text;
      const right=document.createElement('span'); right.className='meta'; right.textContent=item.format+(item.match?' • MATCH':'');
      li.append(left,right); resultsList.appendChild(li);
    }
  }

  function registerResult(text, format, points){
    const code=normalize(text); if(!code) return;
    const match=isMatch(code), now=Date.now();
    const old=found.get(code);
    if(!old){ found.set(code,{text:code,format:format||'barcode',points,match,time:now}); renderList(); }
    else { old.points=points; old.match=match; old.time=now; }
    if(match){ matchState.textContent='MATCH FOUND'; matchValue.textContent=code+' matches the last 4 digits '+target.value; beep(); }
  }

  function clearOverlay(){
    const c=overlay.getContext('2d'); c.clearRect(0,0,overlay.width,overlay.height);
  }
  function drawBox(points, offsetX, offsetY, tileW, tileH){
    if(!points || !points.length) return;
    const xs=points.map(p=>p.getX()+offsetX), ys=points.map(p=>p.getY()+offsetY);
    const minX=Math.min(...xs), maxX=Math.max(...xs), minY=Math.min(...ys), maxY=Math.max(...ys);
    const c=overlay.getContext('2d'); c.strokeStyle='#fff'; c.lineWidth=4; c.strokeRect(minX,minY,Math.max(8,maxX-minX),Math.max(8,maxY-minY));
  }

  async function decodeTile(x,y,w,h){
    const tile=document.createElement('canvas'); tile.width=Math.max(160,Math.floor(w)); tile.height=Math.max(120,Math.floor(h));
    const tc=tile.getContext('2d',{willReadFrequently:true}); tc.drawImage(video,x,y,w,h,0,0,tile.width,tile.height);
    try{
      const result=reader.decodeFromCanvas(tile);
      const sx=w/tile.width, sy=h/tile.height;
      const pts=(result.getResultPoints&&result.getResultPoints()||[]).map(p=>({x:p.getX()*sx,y:p.getY()*sy}));
      // Lightweight point wrapper for drawing.
      registerResult(result.getText(), result.getBarcodeFormat ? String(result.getBarcodeFormat()) : 'barcode', pts.map(p=>({getX:()=>p.x,getY:()=>p.y})));
      drawBox(pts.map(p=>({getX:()=>p.x,getY:()=>p.y})),x,y,w,h);
    }catch(_){ /* no barcode in this tile */ }
  }

  async function scanFrame(){
    if(!running || scanning || video.readyState<2) return;
    const now=performance.now(); if(now-lastFrame<380) return; lastFrame=now; scanning=true;
    try{
      const W=video.videoWidth,H=video.videoHeight; if(!W||!H)return;
      overlay.width=W; overlay.height=H; clearOverlay();
      // Six overlapping tiles. This lets a single camera frame find several shelf barcodes.
      const cols=3, rows=2, overlap=.18;
      const tw=W/cols, th=H/rows;
      const jobs=[];
      for(let r=0;r<rows;r++) for(let col=0;col<cols;col++){
        const x=Math.max(0,col*tw-tw*overlap/2), y=Math.max(0,r*th-th*overlap/2);
        const right=Math.min(W,(col+1)*tw+tw*overlap/2), bottom=Math.min(H,(r+1)*th+th*overlap/2);
        jobs.push(decodeTile(x,y,right-x,bottom-y));
      }
      // Sequential decode prevents the ZXing reader from being used concurrently.
      for(const job of jobs) await job;
    } finally { scanning=false; }
  }

  async function startCamera(){
    if(!window.isSecureContext && location.hostname!=='localhost'){
      setStatus('HTTPS required'); matchState.textContent='Open this site over HTTPS'; matchValue.textContent='Camera access is blocked on ordinary HTTP pages.'; return;
    }
    if(!window.ZXing){ setStatus('Decoder failed to load'); return; }
    stopCamera(); found.clear(); renderList(); clearOverlay();
    setStatus('Requesting camera…');
    try{
      stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:facing},width:{ideal:1280},height:{ideal:720}},audio:false});
      track=stream.getVideoTracks()[0]; video.srcObject=stream; await video.play(); running=true;
      const caps=track.getCapabilities?track.getCapabilities():{};
      torchBtn.hidden=!('torch' in caps); setStatus('Scanning'); resizeOverlay();
      requestAnimationFrame(loop);
    }catch(err){ setStatus('Camera permission needed'); matchState.textContent='Camera could not start'; matchValue.textContent=err && err.message ? err.message : 'Allow camera access and try again.'; }
  }
  function loop(){ if(!running)return; scanFrame(); requestAnimationFrame(loop); }
  function stopCamera(){ running=false; scanning=false; if(stream){stream.getTracks().forEach(t=>t.stop());stream=null;} track=null; }

  async function switchCamera(){ facing=facing==='environment'?'user':'environment'; await startCamera(); }
  async function toggleTorch(){
    if(!track || !track.applyConstraints)return; const caps=track.getCapabilities?track.getCapabilities():{}; if(!('torch' in caps))return;
    const current=track.getSettings?!!track.getSettings().torch:false; try{await track.applyConstraints({advanced:[{torch:!current}]}); torchBtn.textContent=!current?'Flashlight off':'Flashlight';}catch(_){ }
  }
  target.addEventListener('input',()=>{ target.value=target.value.replace(/\D/g,'').slice(0,4); if(target.value.length===4){matchState.textContent='Looking for match';matchValue.textContent='Scanning for …'+target.value;} });
  startBtn.addEventListener('click',async()=>{if(running){stopCamera();startBtn.textContent='Start camera';setStatus('Stopped');}else{await startCamera();startBtn.textContent='Stop camera';}});
  switchBtn.addEventListener('click',switchCamera); torchBtn.addEventListener('click',toggleTorch);
  clearBtn.addEventListener('click',()=>{found.clear();renderList();matchState.textContent='Waiting for scan';matchValue.textContent='Enter the last 4 digits, then start the camera.';clearOverlay();});
  window.addEventListener('beforeunload',stopCamera);
})();

if ('serviceWorker' in navigator) window.addEventListener('load',()=>navigator.serviceWorker.register('./service-worker.js').catch(()=>{}));

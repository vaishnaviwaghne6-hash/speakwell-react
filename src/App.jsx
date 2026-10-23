import React,{useState,useRef,useEffect} from 'react';
import './styles.css';
import {askAI} from './ai.js';
const h=React.createElement;
const LEVELS=["Beginner","Intermediate","Advanced"];
const RANKS=["Starter","Speaker","Storyteller","Orator","Maestro"];
const OPEN={
"Everyday chat":["🗣️","casual small talk with a new friend","Hi! I’m Ava, your English tutor. Tell me about your day so far.",["I woke up early today.","My day was busy.","I want to practise speaking."]],
"Job interview":["💼","an interviewer asking job interview questions","Welcome, and thanks for coming. Could you please introduce yourself?",["My name is… and I have experience in…","I am good at working in a team.","I am looking for a new challenge."]],
"Phone call":["📞","a customer service agent on a phone call","Thank you for calling. How can I help you today?",["I have a problem with my order.","Could you please repeat that?","I would like to book an appointment."]],
"Presentation":["🎤","a coach helping the learner practise a short work presentation","Let’s practise your opening. Please greet the audience and say what you will talk about.",["Good morning everyone, today I will talk about…","Let me start with the main idea.","Thank you for your attention."]]};
const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
const micMsg=e=>{const c=e&&e.error;
  if(c==='not-allowed'||c==='service-not-allowed')return location.protocol==='file:'?'Microphone is blocked because the page is opened as a file. Run start.bat and open http://localhost:5173 instead.':'Microphone permission is blocked. Click the lock icon in the address bar, allow Microphone, then reload.';
  if(c==='network')return 'Voice typing needs internet in Chrome/Edge (the browser sends your voice to its speech service). Check your connection, or type your message.';
  if(c==='no-speech')return 'I did not hear anything. Tap the mic and speak again.';
  if(c==='audio-capture')return 'No microphone found. Plug in a mic or check your sound settings.';
  if(c==='aborted')return '';
  return 'The microphone is not available. Type your message instead.'};
const TABS={chat:'💬 Chat',plan:'📅 30-Day Plan',vocab:'📚 Vocabulary',speak:'🎙️ Pronunciation'};
const PLANS={
Beginner:'Hello & introductions|Numbers & time|Family|Daily routine|Food & drinks|At the restaurant|Shopping|Colours & clothes|Directions|Weather|Hobbies|Telling the date|Home & rooms|Transport|At the market|Health basics|Feelings|Likes & dislikes|Past simple|Future plans|Phone basics|Asking for help|Making requests|Polite words|Invitations|Describing people|Describing places|My city|Short stories|Review & celebrate'.split('|'),
Intermediate:'Small talk|Workplace basics|Meetings|Emails to speech|Phone calls|Travel & airports|Hotel booking|Opinions|Agree & disagree|Past experiences|Future goals|Giving advice|Complaints|Negotiating|Health & doctor|Technology|News & media|Education|Culture|Storytelling|Phrasal verbs|Idioms|Interviews|Asking questions|Presenting ideas|Problem solving|Teamwork|Feedback|Debate|Review & celebrate'.split('|'),
Advanced:'Networking|Leadership talk|Persuasion|Negotiation|Public speaking|Storytelling|Debate|Critical thinking|Business pitch|Client calls|Conflict handling|Interview mastery|Idioms in depth|Formal vs casual|Humour|Abstract topics|Current affairs|Academic talk|Interrupting politely|Summarising|Presenting data|Chairing meetings|Cross-culture|Emotional tone|Accents & clarity|Impromptu talks|Q&A handling|Writing to speech|Mock panel|Review & celebrate'.split('|')};
const SAVE=(()=>{try{return JSON.parse(localStorage.getItem('speakwell')||'{}')}catch(e){return{}}})();
function lev(a,b){const d=Array.from({length:a.length+1},(_,i)=>[i]);for(let j=1;j<=b.length;j++)d[0][j]=j;for(let i=1;i<=a.length;i++)for(let j=1;j<=b.length;j++)d[i][j]=Math.min(d[i-1][j]+1,d[i][j-1]+1,d[i-1][j-1]+(a[i-1]===b[j-1]?0:1));return d[a.length][b.length]}
const norm=t=>t.toLowerCase().replace(/[^a-z0-9' ]/g,'').split(/\s+/).filter(Boolean);
function grade(t,sd){const tw=norm(t),sw=norm(sd);const res=tw.map(w=>({w,ok:Math.max(0,...sw.map(x=>1-lev(w,x)/Math.max(w.length,x.length)))>=.75}));return{res,score:Math.round(res.filter(r=>r.ok).length/Math.max(1,res.length)*100)}}
const WORDS=["Hello","Thank you","How are you?","Please","Nice to meet you","Could you…?","I would like","Excellent","Let’s practise","Good morning","Well done","Sorry?"];

function App(){
  const [level,setLevel]=useState("Beginner");
  const [scen,setScen]=useState("Everyday chat");
  const [msgs,setMsgs]=useState([{role:"tutor",text:OPEN["Everyday chat"][2]}]);
  const [input,setInput]=useState("");
  const [busy,setBusy]=useState(false);
  const [err,setErr]=useState("");
  const [st,setSt]=useState(SAVE.st||{sent:0,fixed:0,perfect:0,xp:0});
  const [words,setWords]=useState([]);
  const [mic,setMic]=useState(false);
  const [talk,setTalk]=useState(false);
  const [burst,setBurst]=useState(0);
  const [ready,setReady]=useState(0);
  const [autoRead,setAuto]=useState(true);const [rate,setRate]=useState(.9);const [accent,setAccent]=useState("en-US");
  const [tab,setTab]=useState('chat');const [done,setDone]=useState(SAVE.done||{});const [day,setDay]=useState(1);const [call,setCall]=useState(false);
  const [vocab,setVocab]=useState({});const [vbusy,setVbusy]=useState(false);const [target,setTarget]=useState('');const [heard,setHeard]=useState(null);const [lessonN,setLessonN]=useState(0);
  const sendRef=useRef(null),uRef=useRef(null);
  const sRef=useRef(null),endRef=useRef(null),recRef=useRef(null);

  useEffect(()=>{
    let on=true;
    try{Promise.resolve(askAI).then(s=>{if(on){sRef.current=s;setReady(s?1:2)}}).catch(()=>on&&setReady(2))}catch(e){setReady(2)}
    return()=>{on=false};
  },[]);
  useEffect(()=>{endRef.current&&endRef.current.scrollIntoView({block:"end",behavior:"smooth"})},[msgs,busy]);

  function reset(k){setScen(k);setTab('chat');setErr("");setMsgs([{role:"tutor",text:OPEN[k][2]}])}
  function speak(t,r){
    try{speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(t);u.lang=accent;u.rate=r||rate;
      const vs=speechSynthesis.getVoices(),v=vs.find(x=>x.lang.replace("_","-")===accent)||vs.find(x=>x.lang.startsWith("en"));if(v)u.voice=v;
      uRef.current=u;u.onend=u.onerror=()=>{if(uRef.current===u)setTalk(false)};setTalk(true);speechSynthesis.speak(u)}catch(e){setTalk(false)}
  }
  function listen(){
    if(!SR)return;
    if(mic&&recRef.current){recRef.current.stop();return}
    try{
      const r=new SR();r.lang="en-US";r.interimResults=false;
      r.onresult=e=>setInput(v=>(v?v+" ":"")+e.results[0][0].transcript);
      r.onend=()=>setMic(false);r.onerror=e=>{setMic(false);setErr(micMsg(e))};
      recRef.current=r;setMic(true);r.start();
    }catch(e){setMic(false)}
  }
  async function send(t){
    const text=(typeof t==='string'?t:input).trim();
    if(!text||busy)return;
    const s=sRef.current;
    if(!s){setErr("The tutor is not ready. Please reload the page.");return}
    setErr("");setInput("");setBusy(true);
    const next=[...msgs,{role:"you",text}];
    setMsgs(next);
    const hist=next.slice(-9,-1).map(m=>(m.role==="you"?"Learner: ":"Tutor: ")+m.text).join("\n");
    const prompt=`You are Ava, a kind, encouraging English communication tutor. The learner's level is ${level}. Role-play scenario: you act as ${OPEN[scen][1]}. Today's 30-day-plan topic: ${PLANS[level][day-1]}; gently steer the conversation toward it.
Conversation so far:
${hist}
Learner's newest message: "${text}"

Respond with ONLY a JSON object, no markdown, in this shape:
{"reply": "your in-character reply, 1-3 short sentences using ${level}-level English, ending with a question that keeps the conversation going",
"corrected": "the learner's message rewritten correctly and naturally, or an empty string if it was already correct",
"issues": [{"wrong":"exact words from the learner","right":"fix","why":"one short, simple reason"}],
"tip": "one short tip about grammar, pronunciation or natural phrasing relevant to this message, or empty string",
"newWord": {"word":"a useful word or phrase for this topic","meaning":"simple meaning and a short example"}}
Use at most 3 issues. Use an empty issues array if there are no mistakes. Do not be harsh.`;
    try{
      const res=await s(prompt,{cache:false});
      const d=JSON.parse(String(res.text).match(/\{[\s\S]*\}/)[0]);
      const iss=d.issues||[],ok=!d.corrected&&!iss.length;
      setSt(x=>({sent:x.sent+1,fixed:x.fixed+(d.corrected?1:0),perfect:x.perfect+(ok?1:0),xp:x.xp+10+(ok?10:0)}));
      if(ok)setBurst(b=>b+1);
      setLessonN(n=>n+1);
      if(d.newWord&&d.newWord.word)setWords(w=>[d.newWord,...w.filter(q=>q.word!==d.newWord.word)].slice(0,8));
      setMsgs(v=>[...v,{role:"tutor",text:d.reply||"Please tell me more.",fb:{corrected:d.corrected||"",issues:iss,tip:d.tip||"",word:d.newWord||null,ok}}]);
      if(autoRead||call)speak(d.reply||"");
    }catch(e){
      setErr(e&&e.code==="rate_limited"?"Too many requests. Wait a moment and try again.":e&&e.code==="not_granted"?"Please try again.":"The tutor could not answer. Send your message again.");
    }
    setBusy(false);
  }

  const state=busy?"thinking":talk?"speaking":mic?"listening":"idle";
  const label={thinking:"Ava is thinking…",speaking:"Ava is speaking…",listening:"Ava is listening…",idle:"Ready when you are"}[state];
  const ri=Math.min(4,Math.floor(st.xp/60)),pct=ri===4?100:(st.xp%60)/60*100;

  sendRef.current=send;
  useEffect(()=>{try{localStorage.setItem('speakwell',JSON.stringify({done,st}))}catch(e){}},[done,st]);
  useEffect(()=>{
    if(!call||busy||talk||mic)return;
    const t=setTimeout(()=>{
      try{const r=new SR();r.lang=accent;r.interimResults=false;
        r.onresult=e=>{const tx=e.results[0][0].transcript;sendRef.current&&sendRef.current(tx)};
        r.onend=()=>setMic(false);
        r.onerror=ev=>{setMic(false);if(ev.error==='not-allowed'||ev.error==='service-not-allowed'){setCall(false);setErr('Allow microphone access to use the call.')}};
        recRef.current=r;setMic(true);r.start()}catch(e){setMic(false);setCall(false)}
    },500);
    return()=>clearTimeout(t);
  },[call,busy,talk,mic]);
  function toggleCall(){
    if(!SR){setErr('Voice call needs speech recognition. Try Chrome.');return}
    try{speechSynthesis.cancel();recRef.current&&recRef.current.abort()}catch(e){}
    setMic(false);setTab('chat');setErr('');
    const l=msgs[msgs.length-1];
    if(!call&&l&&l.role==='tutor')speak(l.text);else setTalk(false);
    setCall(!call);
  }
  const isDone=n=>(done[level]||[]).includes(n),dn=(done[level]||[]).length,vk=level+'-'+day;
  function startDay(n){const th=PLANS[level][n-1];setDay(n);setLessonN(0);setTab('chat');setErr('');setMsgs([{role:'tutor',text:`Day ${n}: ${th}. Let’s practise this topic together. ${n===1?'Say hello and tell me your name.':'Tell me one thing you know about '+th.toLowerCase()+'.'}`}])}
  function complete(){if(isDone(day))return;setDone(d=>({...d,[level]:[...(d[level]||[]),day]}));setSt(x=>({...x,xp:x.xp+50}));setBurst(b=>b+1);setLessonN(0);if(day<30)setDay(day+1)}
  async function loadVocab(){
    const s=sRef.current;
    if(vocab[vk]||vbusy)return;
    if(!s){setErr('The tutor is not ready. Please reload the page.');return}
    setVbusy(true);setErr('');
    try{
      const r=await s(`Create 5 vocabulary items for an English learner at ${level} level. Topic: ${PLANS[level][day-1]}. Return ONLY a JSON array, no markdown: [{"word":"","say":"simple respelling such as en-THOO-zee-az-um","meaning":"simple English meaning","hindi":"Hindi meaning in Devanagari","example":"one short natural sentence"}]`,{cache:true});
      const arr=JSON.parse(String(r.text).match(/\[[\s\S]*\]/)[0]);
      setVocab(v=>({...v,[vk]:arr}));
      setWords(w=>[...arr.map(x=>({word:x.word,meaning:x.meaning})),...w].slice(0,10));
    }catch(e){setErr('Could not load words. Try again.')}
    setVbusy(false);
  }
  function say(){
    if(!SR){setErr('Speech recognition is not supported in this browser. Try Chrome.');return}
    if(!target.trim()){setErr('Choose or type something to say.');return}
    setErr('');
    try{const r=new SR();r.lang=accent;r.interimResults=false;
      r.onresult=e=>{const sd=e.results[0][0].transcript,g=grade(target,sd);setHeard({sd,...g});if(g.score>=80){setSt(x=>({...x,xp:x.xp+5}));if(g.score===100)setBurst(b=>b+1)}};
      r.onend=()=>setMic(false);r.onerror=e=>{setMic(false);setErr(micMsg(e))};
      recRef.current=r;setHeard(null);setMic(true);r.start()}catch(e){setMic(false)}
  }
  const errP=err?h('p',{className:'err',role:'alert'},err):null;
  const planView=h('div',{className:'view'},
    h('p',{className:'empty'},level+' plan · '+dn+'/30 days complete'+(LEVELS.indexOf(level)<2?' · finish all 30 days to unlock '+LEVELS[LEVELS.indexOf(level)+1]:'')),
    h('div',{className:'xpb'},h('div',{style:{width:dn/30*100+'%'}})),
    dn>=30&&LEVELS.indexOf(level)<2?h('div',{className:'dcard'},h('h3',null,'🎉 '+level+' level complete!'),h('p',null,'You unlocked the next level.'),h('button',{className:'b',onClick:()=>{setLevel(LEVELS[LEVELS.indexOf(level)+1]);setDay(1)}},'Start '+LEVELS[LEVELS.indexOf(level)+1]+' level')):null,
    h('div',{className:'days'},PLANS[level].map((t,i)=>{const n=i+1;return h('button',{key:n,disabled:n>dn+1,className:'day'+(isDone(n)?' done':'')+(n===day?' cur':''),onClick:()=>setDay(n)},h('b',null,isDone(n)?'✓':n),h('span',null,t))})),
    h('div',{className:'dcard'},h('h3',null,'Day '+day+': '+PLANS[level][day-1]),h('p',null,'Chat with Ava about this topic, learn 5 words, then practise saying them. Send 3 messages to complete the day.'),
      h('div',{className:'lis'},h('button',{className:'b',onClick:()=>startDay(day)},'Start lesson'),h('button',{className:'b alt',onClick:()=>{setTab('vocab');loadVocab()}},'Today’s words'),h('button',{className:'b alt',disabled:lessonN<3||isDone(day),onClick:complete},isDone(day)?'Completed':'Complete day ('+Math.min(lessonN,3)+'/3)'))));
  const vw=vocab[vk];
  const vocabView=h('div',{className:'view'},
    h('p',{className:'empty'},'Day '+day+' · '+PLANS[level][day-1]),
    !vw?h('button',{className:'b',onClick:loadVocab,disabled:vbusy},vbusy?'Loading words…':'Get today’s 5 words'):null,errP,
    vw?vw.map((w,i)=>h('div',{key:i,className:'vc'},
      h('div',{className:'vh'},h('h3',null,w.word),h('span',{className:'ph'},'/'+w.say+'/'),h('button',{className:'say',onClick:()=>speak(w.word,.7)},'🔊 Listen'),h('button',{className:'say',onClick:()=>{setTarget(w.word);setHeard(null);setTab('speak')}},'🎙️ Practise')),
      h('p',null,w.meaning),h('p',{className:'hi'},w.hindi),
      h('p',{className:'ex'},'“'+w.example+'” ',h('button',{className:'say',onClick:()=>speak(w.example)},'🔊'))
    )):null);
  const items=(vocab[vk]||[]).flatMap(w=>[w.word,w.example]);
  const speakView=h('div',{className:'view'},
    h('p',{className:'empty'},'Pick a word or sentence, listen to Ava, then say it. Scores compare what the browser heard with the text.'),
    items.length?h('div',{className:'sug',style:{padding:0}},items.map((t,i)=>h('button',{key:i,onClick:()=>{setTarget(t);setHeard(null)}},t))):h('button',{className:'b alt',onClick:loadVocab,disabled:vbusy},vbusy?'Loading…':'Load today’s practice words'),
    h('textarea',{rows:2,value:target,onChange:e=>{setTarget(e.target.value);setHeard(null)},placeholder:'Or type your own sentence',style:{width:'100%',marginTop:12},'aria-label':'Text to pronounce'}),
    h('div',{className:'lis'},h('button',{className:'b alt',onClick:()=>speak(target)},'🔊 Listen'),h('button',{className:'b alt',onClick:()=>speak(target,.6)},'🐢 Slow'),h('button',{className:'b'+(mic?' rec':''),onClick:mic&&recRef.current?()=>recRef.current.stop():say},mic?'Stop':'🎙️ Say it')),
    errP,
    heard?h('div',{className:'res'},h('div',{className:'score'},heard.score+'%'),h('p',null,heard.score>=90?'Excellent pronunciation!':heard.score>=60?'Good try. Listen again and repeat.':'Keep practising. Use Slow, then try again.'),h('p',{className:'ex'},'Ava heard: “'+heard.sd+'”'),h('div',null,heard.res.map((r,i)=>h('span',{key:i,className:'tk '+(r.ok?'g':'b')},r.w)))):null);
  const log=[];
  msgs.forEach((m,i)=>{
    log.push(h("div",{key:"m"+i,className:"m "+m.role},m.text,m.role==="tutor"?h("div",{className:"lis"},h("button",{className:"say",onClick:()=>speak(m.text),"aria-label":"Listen to this message"},"🔊 Listen"),h("button",{className:"say",onClick:()=>speak(m.text,.6),"aria-label":"Listen slowly"},"🐢 Slow")):null));
    const f=m.fb;
    if(f)log.push(h("div",{key:"f"+i,className:"fb"},
      f.ok?h("p",{className:"ok"},"Perfect sentence! +10 bonus XP"):null,
      f.corrected?h("p",null,"Better: ",h("span",{className:"fix"},f.corrected)," ",h("button",{className:"say",onClick:()=>speak(f.corrected),"aria-label":"Listen to the better sentence"},"🔊 Listen")):null,
      f.issues.length?h("ul",{className:"iss"},f.issues.map((x,j)=>h("li",{key:j},h("span",{className:"wr"},x.wrong)," → ",h("span",{className:"rt"},x.right),h("span",{className:"why"},x.why)))):null,
      f.tip?h("p",null,"Tip: "+f.tip):null,
      f.word?h("div",{className:"word"},h("b",null,f.word.word)," ",h("button",{className:"say",onClick:()=>speak(f.word.word,.7),"aria-label":"Listen to the word"},"🔊"),": "+f.word.meaning):null));
  });

  return h("div",null,
    h("div",{className:"bg","aria-hidden":"true"},WORDS.map((w,i)=>h("span",{key:i,style:{left:(i*8.7%92)+"%",fontSize:(26+i%4*14)+"px",animationDuration:(26+i*3)+"s",animationDelay:(-i*4)+"s"}},w))),
    h("div",{className:"app"},
      h("aside",{className:"card side"},
        h("div",{className:"brand"},"Speakwell"),
        h("div",{className:"orbw"},
          h("div",{className:"orb "+state},h("i",{className:"eye l"}),h("i",{className:"eye r"}),h("i",{className:"mouth"})),
          burst?h("div",{className:"burst",key:burst},Array.from({length:14},(_,i)=>h("i",{key:i,style:{"--a":i*360/14}}))):null),
        h("div",{className:"status","aria-live":"polite"},label),
        talk?h("button",{className:"tog on",onClick:()=>{try{speechSynthesis.cancel()}catch(e){}setTalk(false)}},"⏹ Stop audio"):null,
        h("div",{className:"lbl"},"Your level"),
        h("div",{className:"seg"},LEVELS.map((l,i)=>{const lock=i>0&&(done[LEVELS[i-1]]||[]).length<30;return h("button",{key:l,disabled:lock,title:lock?"Complete all 30 days of "+LEVELS[i-1]+" to unlock":"",className:l===level?"on":"",onClick:()=>{setLevel(l);setDay(Math.min(30,(done[l]||[]).length+1))}},(lock?"🔒 ":"")+l)})),
        h("div",{className:"lbl"},"Listening settings"),
        h("button",{className:"tog"+(autoRead?" on":""),onClick:()=>setAuto(!autoRead),"aria-pressed":autoRead},"🔊 Auto-read Ava’s replies: "+(autoRead?"On":"Off")),
        h("div",{className:"seg"},[["Slow",.65],["Normal",.9],["Fast",1.15]].map(([n,v])=>h("button",{key:n,className:v===rate?"on":"",onClick:()=>setRate(v)},n))),
        h("div",{className:"seg"},[["US","en-US"],["UK","en-GB"],["India","en-IN"]].map(([n,v])=>h("button",{key:n,className:v===accent?"on":"",onClick:()=>setAccent(v)},n))),
        h("div",{className:"lbl"},"Practice scenario"),
        h("div",{className:"scn"},Object.keys(OPEN).map(k=>h("button",{key:k,className:k===scen?"on":"",onClick:()=>reset(k)},h("em",null,OPEN[k][0]),k)))),
      h("main",{className:"card chat t-"+tab},
        h('div',{className:'chead'},h('h2',null,tab==='chat'?scen:TABS[tab]),h('span',null,level+' · Day '+day),h('button',{className:'b '+(call?'rec':'alt'),style:{marginLeft:'auto',height:38,padding:'0 14px'},onClick:toggleCall},call?'End call':'📞 Call Ava')),
        h('div',{className:'tabs',role:'tablist'},Object.keys(TABS).map(k=>h('button',{key:k,role:'tab','aria-selected':k===tab,className:k===tab?'on':'',onClick:()=>setTab(k)},TABS[k]))),
        call?h('div',{className:'callbar'},h('i',{className:'pulse'}),'On call with Ava · '+label):null,
        tab==='plan'?planView:tab==='vocab'?vocabView:tab==='speak'?speakView:null,
        h("div",{className:"log","aria-live":"polite"},log,
          busy?h("div",{className:"m tutor typing","aria-label":"Ava is writing"},h("i"),h("i"),h("i")):null,
          err?h("div",{className:"err",role:"alert"},err):null,
          ready===2&&!err?h("div",{className:"err"},"The AI tutor is not available in this view."):null,
          h("div",{ref:endRef})),
        msgs.length<3?h("div",{className:"sug"},OPEN[scen][3].map(t=>h("button",{key:t,onClick:()=>setInput(t)},t))):null,
        h("div",{className:"bar"},
          SR?h("button",{className:"b "+(mic?"rec":"alt"),onClick:listen,"aria-label":mic?"Stop recording":"Speak your answer"},mic?"Stop":"Speak"):null,
          h("textarea",{rows:1,value:input,onChange:e=>setInput(e.target.value),onKeyDown:e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send()}},placeholder:"Write your answer in English",disabled:busy,"aria-label":"Your message"}),
          h("button",{className:"b",onClick:send,disabled:busy||!input.trim()},"Send"))),
      h("aside",{className:"card rp"},
        h("div",null,h("div",{className:"rank"},RANKS[ri]),h("div",{className:"xpt"},st.xp+" XP"+(ri<4?" · "+(60-st.xp%60)+" to "+RANKS[ri+1]:""))),
        h("div",{className:"xpb"},h("div",{style:{width:pct+"%"}})),
        h("div",{className:"grid"},h("div",null,h("b",null,st.sent),"messages"),h("div",null,h("b",null,st.fixed),"improved"),h("div",null,h("b",null,st.perfect),"perfect")),
        h("h3",null,"Word bank"),
        words.length?h("div",{className:"wb"},words.map(w=>h("div",{key:w.word},h("b",null,w.word)," ",h("button",{className:"say",onClick:()=>speak(w.word,.7),"aria-label":"Listen to "+w.word},"🔊"),": "+w.meaning))):h("p",{className:"empty"},"New words from your chats will collect here."))));
}
export default App;

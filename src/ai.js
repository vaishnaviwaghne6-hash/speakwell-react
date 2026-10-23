// Offline tutor engine: no API key, no server, no internet needed.
// It keeps the same askAI(prompt) -> { text } contract the app already uses.
//
// Layout of this file
//   1. Grammar checker   (RULES -> check)          add new correction rules in RULES
//   2. Vocabulary        (THEMES, GLOSS, DICT)     add new words in THEMES / GLOSS
//   3. Conversation      (KB, TOPICS, chat)        add new Q&A in KB, new follow-ups in TOPICS

// ---------- 1. Grammar helpers ----------
const ING = { go: 'going', come: 'coming', eat: 'eating', work: 'working', play: 'playing', study: 'studying', sleep: 'sleeping', watch: 'watching', walk: 'walking', talk: 'talking', cook: 'cooking', drive: 'driving', run: 'running', sing: 'singing', dance: 'dancing', travel: 'travelling', wait: 'waiting' };
const STATE = { knowing: 'know', understanding: 'understand', wanting: 'want', liking: 'like', loving: 'love', needing: 'need', believing: 'believe', hating: 'hate', preferring: 'prefer' };
const BASE = { went: 'go', came: 'come', saw: 'see', ate: 'eat', took: 'take', got: 'get', made: 'make', had: 'have', gave: 'give', did: 'do', bought: 'buy', ran: 'run', wrote: 'write', met: 'meet', told: 'tell' };
const PAST = { go: 'went', eat: 'ate', come: 'came', see: 'saw', take: 'took', have: 'had', get: 'got', make: 'made', buy: 'bought', meet: 'met', write: 'wrote', do: 'did', run: 'ran', give: 'gave', tell: 'told', pay: 'paid', drink: 'drank', sleep: 'slept', speak: 'spoke' };
const REG = ['visit', 'watch', 'play', 'work', 'walk', 'call', 'talk', 'study', 'cook', 'clean', 'wash', 'finish', 'start', 'ask', 'listen', 'travel', 'stay', 'reach', 'enjoy', 'learn', 'open', 'wait', 'try', 'use', 'move', 'order'];
const pastOf = (v) => PAST[v] || (/[^aeiou]y$/.test(v) ? v.slice(0, -1) + 'ied' : /e$/.test(v) ? v + 'd' : v + 'ed');
// he/she form of a verb: go -> goes, study -> studies, have -> has
const s3 = (v) => (v === 'have' ? 'has' : /(?:s|sh|ch|x|z|o)$/.test(v) ? v + 'es' : /[^aeiou]y$/.test(v) ? v.slice(0, -1) + 'ies' : v + 's');
// and back again: goes -> go, studies -> study, has -> have
const unS = (v) => (v === 'has' ? 'have' : v === 'does' ? 'do' : v === 'goes' ? 'go' : /ies$/.test(v) ? v.slice(0, -3) + 'y' : /(?:sh|ch|x|ss|z)es$/.test(v) ? v.slice(0, -2) : v.slice(0, -1));

// words that, when they come right before "he/she", mean the verb after must stay in its base form ("Where did he go?")
const AUX = new Set(['do', 'does', 'did', 'can', 'could', 'will', 'would', 'shall', 'should', 'may', 'might', 'must', 'let', 'make', 'makes', 'made', 'help', 'helps', 'see', 'hear', 'watch']);
const prevWord = (s, i) => ((s.slice(0, i).match(/([A-Za-z']+)\s*$/) || [])[1] || '').toLowerCase();
const afterAux = (a) => AUX.has(prevWord(a[a.length - 1], a[a.length - 2]));
const keepCase = (src, word) => (src[0] === src[0].toUpperCase() && /[A-Z]/.test(src[0]) ? word[0].toUpperCase() + word.slice(1) : word);

const V3 = 'go|like|want|live|work|play|need|study|eat|come|know|think|love|speak|watch|drive|help|teach|write|cook|sing|dance|walk|talk|say|call|try|use|enjoy|stay|take|make|give|get|buy|see|meet|run|feel|hate|start|finish|ask|visit|travel|sleep|drink|do|have';
const V3S = V3.split('|').map(s3).join('|');
const PASTVERBS = [...new Set([...Object.keys(PAST), ...REG])];
const VP = [...PASTVERBS, ...PASTVERBS.map(s3)].join('|');
const PM = '(?:yesterday|last (?:night|week|month|year|summer|weekend|time)|(?:\\d+|a few|a couple of|several|a|an|one|two|three|four|five|six) (?:days?|weeks?|months?|years?|hours?) ago)';
const baseOf = (v) => (PASTVERBS.includes(v) ? v : unS(v));

// Articles: a / an by SOUND, not by spelling (an hour, a university, an MBA, a user)
const AN_PREFIX = /^(?:hour|honest|honou?r|heir)/;
const A_PREFIX = /^(?:univers|unit|union|uniq|unif|unic|unil|unis|use|usu|util|uten|utop|eu|one(?!rous)|once|ubiq|ukrain)/;
const NOT_A_NOUN = new Set(['and', 'or', 'but', 'an', 'a', 'the', 'to', 'of', 'in', 'on', 'at', 'is', 'are', 'as', 'if', 'am']);
function articleFor(w) {
  if (w.length < 2 || NOT_A_NOUN.has(w.toLowerCase())) return null;
  if (/^[A-Z]{2}/.test(w)) return 'AEFHILMNORSX'.includes(w[0]) ? 'an' : 'a'; // acronyms: say the letter names (an MBA, an SMS, a UK)
  const l = w.toLowerCase();
  if (/^x-?ray/.test(l) || AN_PREFIX.test(l)) return 'an';
  if (A_PREFIX.test(l)) return 'a';
  return /^[aeiou]/.test(l) ? 'an' : 'a';
}

// ---------- Grammar rules: [regex, replacement (string or function), reason] ----------
const RULES = [
  [/\bi\b(?!\.e)/g, 'I', 'Always write "I" with a capital letter.'],

  // Hindi-English habits
  [/\b[Mm]yself ([A-Z][a-z]+)/g, 'My name is $1', 'Say "My name is ..." to introduce yourself.'],
  [/\b(my|your) good name\b/gi, '$1 name', 'Just say "name".'],
  [/\bwhat is you name\b/gi, 'what is your name', 'Say "your name", not "you name".'],
  [/\b(cousin) (brother|sister)\b/gi, '$1', 'In English, "cousin" is enough.'],
  [/\bgood in (English|maths?|sports|cooking|singing|drawing|studies|speaking|writing)\b/gi, 'good at $1', 'Say "good at", not "good in".'],
  [/\bmarried with\b/gi, 'married to', 'Say "married to".'],
  [/\bdiscuss about\b/gi, 'discuss', '"Discuss" does not need "about".'],
  [/\b(return|revert) back\b/gi, (m, v) => (v.toLowerCase() === 'return' ? 'return' : 'reply'), '"Back" is not needed. Say "return" or "reply".'],
  [/\bexplain me\b/gi, 'explain to me', 'Say "explain to me".'],
  [/\b(he|she|I|they|we) said me\b/gi, '$1 told me', 'Use "told me", not "said me".'],
  [/\blisten (music|songs|radio)\b/gi, 'listen to $1', 'Use "listen to".'],
  [/\bprepone\b/gi, 'bring forward', '"Prepone" is not standard English.'],
  [/\bdo the needful\b/gi, 'do what is needed', '"Do the needful" sounds old-fashioned.'],
  [/\bcan able to\b/gi, 'can', 'Use "can" or "am able to", not both.'],
  [/\bI very (like|love)\b/gi, 'I really $1', 'Use "really" before the verb.'],
  [/\bpeoples\b/gi, 'people', '"People" is already plural.'],
  [/\bchildrens\b/gi, 'children', 'The plural of "child" is "children".'],
  [/\b(information|advice|feedback|knowledge|furniture|homework|equipment|luggage|baggage)s\b/gi, '$1', 'This word has no plural form.'],
  [/\bmuch (people|friends|things|books|students|times|cars|problems|questions|days|hours|mistakes|words|ideas|places)\b/gi, 'many $1', 'Use "many" with countable nouns.'],
  [/\bmore (better|easier|faster|bigger|taller|smaller|cheaper|older|younger|harder|stronger|longer|shorter|higher|lower|smarter|nicer)\b/gi, '$1', '"Better" already means "more good". Do not add "more".'],
  [/\bsince (\d+|a few|a couple of|several|a|an|one|two|three|four|five|six|seven|eight|nine|ten|half an?) (years?|months?|days?|weeks?|hours?|minutes?)\b/gi, 'for $1 $2', 'Use "for" with a length of time.'],
  [/\bI have (\d+) years?(?=\s*(?:[.,!?;]|$|and\b|but\b))/gi, 'I am $1 years old', 'Say "I am 25 years old" for age.'],

  [/\b(years|months) experience\b/gi, '$1 of experience', 'Say "two years of experience".'],
  [/\b(two|three|four|five|six|seven|eight|nine|ten|[2-9]|\d{2,}) (brother|sister|friend|book|car|child|boy|girl|student|teacher|house|room|phone|pen|dog|cat|son|daughter|cousin|uncle|aunt|kid)\b/gi, (m, n, nn) => n + ' ' + (nn.toLowerCase() === 'child' ? 'children' : nn + 's'), 'Use the plural after "two" or more.'],

  // Question word order: "Where you live?" -> "Where do you live?"
  [/^(where|what|when|why|how|which)\s+(you|they|we) are\b([^.!?]*)\?/i, '$1 are $2$3?', 'In a question, put "are" before "you".'],
  [/^(where|what|when|why|how|which)\s+(he|she|it) is\b([^.!?]*)\?/i, '$1 is $2$3?', 'In a question, put "is" before the person.'],
  [/^(where|what|when|why|how|which)\s+(you|they|we|I) (go|live|work|study|come|like|want|eat|stay|know|think|feel|need|buy|get|play)\b([^.!?]*)\?/i, '$1 do $2 $3$4?', 'Use "do" in questions, for example "Where do you live?"'],
  [/^(where|what|when|why|how|which)\s+(he|she|it) (go|live|work|study|come|like|want|eat|stay|know|think|feel|need|buy|get|play)\b([^.!?]*)\?/i, '$1 does $2 $3$4?', 'Use "does" in questions, for example "Where does he live?"'],

  // Past time words: "I go yesterday" -> "I went yesterday"
  [new RegExp(`\\b(I|we|they|you|he|she|it) (${VP})((?: [\\w']+){0,4}?) (${PM})\\b`, 'gi'), (m, subj, v, mid, t) => subj + ' ' + pastOf(baseOf(v.toLowerCase())) + mid + ' ' + t, 'Use the past tense for finished time.'],
  [new RegExp(`\\b(${PM})(,?) (I|we|they|you|he|she|it) (${VP})\\b`, 'gi'), (m, t, c, subj, v) => t + c + ' ' + subj + ' ' + pastOf(baseOf(v.toLowerCase())), 'Use the past tense for finished time.'],

  // be / have / do with the right person
  [/\bI (is|are)\b/g, 'I am', 'Use "I am" with "I".'],
  [/\b(they|we|you) (is|was)\b/gi, (m, a, b) => a + (b.toLowerCase() === 'is' ? ' are' : ' were'), 'Use "are/were" with they, we and you.'],
  [/\b(he|she|it) (are|were)\b/gi, (...a) => (/\b(?:if|wish)\b[^.?!]{0,15}$/i.test(a[a.length - 1].slice(0, a[a.length - 2])) ? a[0] : a[1] + (a[2].toLowerCase() === 'are' ? ' is' : ' was')), 'Use "is/was" with he, she and it.'],
  [/\b(he|she|it) have\b/gi, (...a) => (afterAux(a) ? a[0] : a[1] + ' has'), 'Use "has" with he, she and it.'],
  [/\b(he|she|it) (don't|do not)\b/gi, '$1 doesn\'t', 'Use "doesn\'t" with he, she and it.'],
  [/\b(I|you|we|they) (doesn't|has)\b/gi, (m, p, v) => p + (v.toLowerCase() === 'has' ? ' have' : ' don\'t'), 'Use "don\'t/have" with I, you, we and they.'],

  // verbs that do not use -ing, and "am agree"
  [/\b(I am|I'm|he is|she is|we are|they are|you are)( not)? (knowing|understanding|wanting|liking|loving|needing|believing|hating|preferring)\b/gi, (m, be, not, v) => {
    const subj = be.split(/[ ']/)[0], third = /^(he|she)$/i.test(subj), base = STATE[v.toLowerCase()];
    return subj + ' ' + (not ? (third ? "doesn't " : "don't ") + base : third ? s3(base) : base);
  }, 'Verbs like "know" and "want" do not use -ing.'],
  [/\b(I|we|they|you)(?: am| are| is|'m|'re) agree\b/gi, '$1 agree', 'Say "I agree", not "I am agree".'],
  [/\b(he|she)(?: is|'s) agree\b/gi, '$1 agrees', 'Say "she agrees", not "she is agree".'],
  [/\b(I am|I'm|he is|she is|we are|they are|you are) (go|come|eat|work|play|study|sleep|watch|walk|talk|cook|drive|run|sing|dance|travel|wait)\b/gi, (m, be, v) => be + ' ' + ING[v.toLowerCase()], 'After "am/is/are", use the -ing form.'],

  // "did" + base verb
  [/\b(didn't|did not|don't|doesn't|do not|does not) (went|came|saw|ate|took|got|made|had|gave|did|bought|ran|wrote|met|told)\b/gi, (m, a, v) => a + ' ' + BASE[v.toLowerCase()], 'After "didn\'t", use the base verb.'],
  [/\b(did|do|does) (you|he|she|they|we|I|it) (went|came|saw|ate|took|got|made|had|gave|did|bought|ran|wrote|met|told)\b/gi, (m, a, p, v) => a + ' ' + p + ' ' + BASE[v.toLowerCase()], 'After "did", use the base verb.'],

  // base verb after can / will / do ... : "She can goes" -> "She can go"
  [new RegExp(`\\b(can|could|will|would|should|must|may|might|don't|doesn't|didn't|do not|does not|did not)((?: (?:you|he|she|they|we|I|it))?) (${V3S})\\b`, 'gi'), (m, aux, p, v) => aux + p + ' ' + unS(v.toLowerCase()), 'After can, will, don\'t and similar words, use the base verb.'],
  [new RegExp(`\\b(do|does|did) (you|he|she|they|we|I|it) (${V3S})\\b`, 'gi'), (m, aux, p, v) => aux + ' ' + p + ' ' + unS(v.toLowerCase()), 'After do/does/did, use the base verb.'],
  [new RegExp(`\\b([Dd]oes|[Dd]id) ([A-Z][a-z]+) (${V3S})\\b`, 'g'), (m, aux, n, v) => aux + ' ' + n + ' ' + unS(v), 'After does/did, use the base verb.'],
  [/\bto (goes|has|does|comes)\b/gi, (m, v) => 'to ' + unS(v.toLowerCase()), 'After "to", use the base verb.'],

  // he/she + base verb: "She like tea" -> "She likes tea" (not after did/does/can/will, etc.)
  [new RegExp(`\\b(he|she) (${V3})\\b`, 'gi'), (...a) => (afterAux(a) ? a[0] : a[1] + ' ' + s3(a[2].toLowerCase())), 'Add -s/-es to the verb with he and she.'],

  // a / an by sound
  [/\b(an?)\s+([A-Za-z][A-Za-z'-]*)/gi, (m, art, w) => {
    const right = articleFor(w);
    if (!right || right === art.toLowerCase()) return m;
    return keepCase(art, right) + m.slice(art.length);
  }, 'Use "an" before a vowel sound and "a" before a consonant sound.'],
];

function check(text) {
  const issues = [];
  let out = String(text).replace(/[’‘]/g, "'");
  const src = out;
  for (const [re, rep, why] of RULES) {
    out = out.replace(re, (...a) => {
      const m = a[0], r = typeof rep === 'function' ? rep(...a) : m.replace(new RegExp(re.source, re.flags.replace('g', '')), rep);
      if (r !== m && issues.length < 3 && !issues.some((x) => x.wrong === m)) issues.push({ wrong: m, right: r, why });
      return r;
    });
  }
  const changed = out !== src;
  if (changed) { out = out.charAt(0).toUpperCase() + out.slice(1); if (!/[.!?]$/.test(out)) out += '.'; }
  return { corrected: changed ? out : '', issues: changed ? issues : [] };
}

// ---------- Vocabulary: word|say|meaning|hindi|example (8 per theme; level picks a slice) ----------
const V = (s) => s.trim().split('\n').map((l) => { const [word, say, meaning, hindi, example] = l.split('|'); return { word, say, meaning, hindi, example }; });
const THEMES = [
  [/Hello|Polite|Small talk|Networking|Invitation|requests|Asking for help/, V(`
hello|heh-LOH|a greeting|नमस्ते|Hello, how are you?
please|pleez|a polite word when asking|कृपया|Please sit down.
welcome|WEL-kum|a friendly greeting to a guest|स्वागत|You are welcome here.
introduce|in-truh-DYOOS|to tell your name to someone|परिचय कराना|Let me introduce my friend.
invite|in-VITE|to ask someone to come|आमंत्रित करना|I want to invite you to dinner.
appreciate|uh-PREE-shee-ate|to be thankful for something|सराहना करना|I appreciate your help.
acquaintance|uh-KWAYN-tunss|someone you know a little|परिचित|He is a business acquaintance.
reciprocate|rih-SIP-ruh-kate|to give back the same kindness|बदले में करना|I hope to reciprocate your kindness.`)],
  [/Numbers|time|date|Family|Describing people|Feelings|Likes/, V(`
family|FAM-uh-lee|parents, children and relatives|परिवार|My family is small.
brother|BRUH-ther|a boy with the same parents|भाई|My brother is tall.
happy|HAP-ee|feeling joy|खुश|I am happy today.
parents|PAIR-unts|your mother and father|माता-पिता|My parents live in Nagpur.
cheerful|CHEER-ful|happy and positive|हँसमुख|She is a cheerful girl.
relative|REL-uh-tiv|a family member|रिश्तेदार|A relative visited us.
sibling|SIB-ling|a brother or sister|सहोदर|I have one sibling.
generous|JEN-er-us|happy to give to others|उदार|He is very generous.`)],
  [/routine|Home|Past|Future|My city|places|Short stories/, V(`
wake up|wayk up|to stop sleeping|जागना|I wake up at six.
breakfast|BREK-fust|the first meal of the day|नाश्ता|I eat breakfast at home.
commute|kuh-MYOOT|to travel to work or school|आना-जाना|My commute takes an hour.
schedule|SKED-jool|a plan of times|कार्यक्रम|My schedule is busy.
neighbourhood|NAY-ber-hood|the area around your home|पड़ोस|My neighbourhood is quiet.
routine|roo-TEEN|things you do every day|दिनचर्या|Exercise is part of my routine.
manage|MAN-ij|to handle or organise|संभालना|I manage my time well.
spontaneous|spon-TAY-nee-us|done without planning|अचानक|It was a spontaneous trip.`)],
  [/Food|restaurant|market|Shopping|Colours/, V(`
menu|MEN-yoo|a list of food in a restaurant|मेन्यू|Can I see the menu?
order|OR-der|to ask for food or goods|ऑर्डर करना|I would like to order tea.
bill|bil|the paper showing how much to pay|बिल|Could I have the bill?
discount|DIS-kownt|a lower price|छूट|Is there a discount?
delicious|dih-LISH-us|tasting very good|स्वादिष्ट|The food is delicious.
bargain|BAR-gin|to ask for a lower price|मोलभाव करना|People bargain in the market.
refund|REE-fund|money returned to you|वापसी पैसा|I want a refund.
cuisine|kwih-ZEEN|a style of cooking|व्यंजन शैली|I love Indian cuisine.`)],
  [/Directions|Transport|Travel|Hotel|Weather/, V(`
turn left|turn left|go to the left side|बाएँ मुड़ना|Turn left at the corner.
ticket|TIK-it|paper that allows you to travel|टिकट|I bought a train ticket.
platform|PLAT-form|the place to wait for a train|प्लेटफ़ॉर्म|The train is on platform two.
luggage|LUG-ij|bags you take on a trip|सामान|My luggage is heavy.
reservation|rez-er-VAY-shun|a booking|आरक्षण|I have a hotel reservation.
itinerary|eye-TIN-uh-rer-ee|a plan of a trip|यात्रा योजना|We planned our itinerary.
delay|dih-LAY|when something happens late|देरी|The flight has a delay.
destination|des-tih-NAY-shun|the place you are going to|गंतव्य|Goa is our destination.`)],
  [/Health|doctor|Hobbies/, V(`
headache|HED-ayk|pain in the head|सिरदर्द|I have a headache.
medicine|MED-sin|something you take when ill|दवा|Take this medicine twice a day.
exercise|EK-ser-size|physical activity|व्यायाम|I exercise every morning.
hobby|HOB-ee|something you enjoy in free time|शौक|My hobby is painting.
appointment|uh-POINT-ment|a planned meeting|अपॉइंटमेंट|I have a doctor's appointment.
symptom|SIMP-tum|a sign of illness|लक्षण|Fever is a symptom of flu.
recover|rih-KUV-er|to get well again|ठीक होना|I hope you recover soon.
well-being|wel-BEE-ing|being healthy and happy|कल्याण|Sleep is good for well-being.`)],
  [/Phone|Calls|Email|Client/, V(`
call back|kawl bak|to phone someone again|वापस फ़ोन करना|I will call you back.
hold on|hold on|please wait|रुकिए|Please hold on a moment.
message|MES-ij|a written or spoken note|संदेश|Can I leave a message?
repeat|rih-PEET|to say again|दोहराना|Could you repeat that?
follow up|FOL-oh up|to contact again about something|फ़ॉलो-अप करना|I will follow up tomorrow.
available|uh-VAY-luh-bul|free to talk or help|उपलब्ध|Are you available at three?
confirm|kun-FERM|to say that something is correct|पुष्टि करना|Please confirm the time.
escalate|ES-kuh-late|to pass a problem to a senior person|मामला ऊपर भेजना|I will escalate this issue.`)],
  [/Workplace|Meetings|Teamwork|Feedback|Interview|Leadership|pitch|Presentation|Public speaking|Presenting|Chairing|Q&A|Mock|Impromptu/, V(`
colleague|KOL-eeg|a person you work with|सहकर्मी|My colleague helped me.
meeting|MEE-ting|a gathering to talk about work|बैठक|We have a meeting at ten.
deadline|DED-line|the last time to finish something|समय सीमा|The deadline is Friday.
experience|ik-SPEER-ee-unss|knowledge from doing something|अनुभव|I have two years of experience.
strength|strength|something you do well|ताकत|Teamwork is my strength.
agenda|uh-JEN-duh|a list of topics for a meeting|कार्यसूची|Let's check the agenda.
deliver|dih-LIV-er|to present or provide|प्रस्तुत करना|She will deliver the talk.
accountable|uh-KOWN-tuh-bul|responsible for your actions|जवाबदेह|Leaders must be accountable.`)],
  [/Opinions|Agree|Debate|Advice|Complaint|Negotiat|Persuasion|Conflict|Critical|Interrupting|Summaris|Problem/, V(`
opinion|uh-PIN-yun|what you think about something|राय|In my opinion, it is good.
agree|uh-GREE|to have the same view|सहमत होना|I agree with you.
suggest|suh-JEST|to offer an idea|सुझाव देना|I suggest we wait.
complain|kum-PLAYN|to say you are not happy|शिकायत करना|I want to complain about the service.
compromise|KOM-pruh-mize|each side gives up something|समझौता|Let's find a compromise.
perspective|per-SPEK-tiv|a way of seeing things|दृष्टिकोण|From my perspective, it works.
convince|kun-VINSS|to make someone believe|समझाना|I will convince the team.
rebuttal|rih-BUT-ul|an answer to an argument|खंडन|She gave a strong rebuttal.`)],
  [/Technology|News|Education|Culture|Current|Academic|Abstract|Cross/, V(`
internet|IN-ter-net|the worldwide network|इंटरनेट|I use the internet daily.
news|nyooz|new information about events|समाचार|I read the news online.
education|ed-yoo-KAY-shun|learning at school or college|शिक्षा|Education is important.
tradition|truh-DISH-un|an old custom|परंपरा|Diwali is a tradition.
innovation|in-uh-VAY-shun|a new idea or method|नवाचार|Innovation drives business.
influence|IN-floo-unss|power to change something|प्रभाव|Media can influence people.
diverse|dy-VERS|made of many different kinds|विविध|India is a diverse country.
phenomenon|fuh-NOM-uh-non|an event that is observed|घटना|Social media is a global phenomenon.`)],
  [/Idioms|Phrasal|Formal|Humour|Accents|Emotional|Writing|Storytelling|Review|Asking questions|ideas|Experiences|solving/, V(`
practise|PRAK-tiss|to do something again to improve|अभ्यास करना|I practise English daily.
improve|im-PROOV|to get better|सुधारना|I want to improve my speaking.
fluent|FLOO-unt|able to speak smoothly|धाराप्रवाह|She is fluent in English.
confident|KON-fih-dunt|sure of yourself|आत्मविश्वासी|I feel confident now.
break the ice|brayk thee ice|to start a friendly talk|बातचीत शुरू करना|A joke can break the ice.
look forward to|look FOR-werd too|to wait happily for something|इंतज़ार करना|I look forward to the weekend.
figure out|FIG-yer owt|to find the answer|समझ लेना|I will figure it out.
articulate|ar-TIK-yuh-late|able to express ideas clearly|स्पष्ट बोलने वाला|He is an articulate speaker.`)],
];
function vocabFor(topic, level) {
  const t = (THEMES.find(([re]) => re.test(topic)) || THEMES[THEMES.length - 1])[1];
  const from = level === 'Beginner' ? 0 : level === 'Intermediate' ? 2 : 3;
  return t.slice(from, from + 5);
}


// Extra everyday words so the tutor can answer "what does X mean?" (same format as THEMES)
const GLOSS = V(`
go|goh|to move from one place to another|जाना|I go to school every day.
come|kum|to move towards a place|आना|Please come here.
eat|eet|to put food in your mouth|खाना|I eat rice for lunch.
drink|dringk|to take liquid into your mouth|पीना|I drink water every day.
sleep|sleep|to rest with your eyes closed|सोना|I sleep at ten.
read|reed|to look at words and understand them|पढ़ना|I read a book every day.
write|ryte|to put words on paper|लिखना|Please write your name.
speak|speek|to say words|बोलना|I speak English with my friends.
listen|LIS-un|to pay attention to a sound|सुनना|Listen to the teacher.
learn|lurn|to get knowledge or a skill|सीखना|I learn new words every day.
teach|teech|to help someone learn|पढ़ाना|She teaches maths.
help|help|to make something easier for someone|मदद करना|Can you help me?
love|luv|a strong feeling of liking|प्यार|I love my family.
friend|frend|a person you know and like|दोस्त|He is my friend.
water|WAW-ter|a clear liquid we drink|पानी|I need some water.
food|food|what we eat|खाना|The food is hot.
house|hows|a building where people live|घर|My house is small.
school|skool|a place where children learn|स्कूल|I go to school by bus.
book|buk|pages with words to read|किताब|This book is good.
money|MUN-ee|coins and notes used to buy things|पैसा|I need some money.
time|time|hours and minutes|समय|What time is it?
day|day|twenty-four hours|दिन|Today is a nice day.
night|nite|the dark part of the day|रात|Good night!
morning|MOR-ning|the early part of the day|सुबह|Good morning!
work|werk|a job, or something you do|काम|I have a lot of work.
good|gud|of high quality|अच्छा|This is a good idea.
bad|bad|not good|बुरा|The weather is bad.
big|big|large in size|बड़ा|It is a big city.
small|smawl|little in size|छोटा|I have a small bag.
sad|sad|feeling unhappy|उदास|He looks sad today.
beautiful|BYOO-tih-ful|very pretty|सुंदर|The garden is beautiful.
important|im-POR-tunt|having great value|महत्वपूर्ण|English is important.
difficult|DIF-ih-kult|not easy|कठिन|This test is difficult.
easy|EE-zee|not difficult|आसान|The lesson is easy.
understand|un-der-STAND|to know the meaning of something|समझना|I understand you.
remember|rih-MEM-ber|to keep something in your mind|याद रखना|I remember her name.
forget|fer-GET|to not remember|भूल जाना|Do not forget your keys.
ask|ask|to put a question to someone|पूछना|Ask me anything.
answer|AN-ser|a reply to a question|उत्तर|Please give the answer.
question|KWES-chun|something you ask|सवाल|I have a question.
problem|PROB-lum|something difficult to solve|समस्या|There is a problem.
mistake|mis-TAYK|something wrong that you did|गलती|Everyone makes mistakes.
doubt|dowt|a feeling of not being sure|संदेह|I have a doubt about this answer.
today|tuh-DAY|this day|आज|Today is Friday.
tomorrow|tuh-MOR-oh|the day after today|कल (आने वाला)|See you tomorrow.
yesterday|YES-ter-day|the day before today|कल (बीता हुआ)|I called you yesterday.
sorry|SOR-ee|a word you say when you feel bad about something|माफ़ कीजिए|Sorry, I am late.
thanks|thanks|a word to show you are grateful|धन्यवाद|Thanks for your help.
busy|BIZ-ee|having a lot to do|व्यस्त|I am busy today.
tired|TY-erd|needing rest|थका हुआ|I am tired after work.
hungry|HUNG-gree|wanting food|भूखा|I am hungry.
thirsty|THER-stee|wanting water|प्यासा|I am thirsty.
early|ER-lee|before the usual time|जल्दी|I wake up early.
late|layt|after the usual time|देर से|The bus is late.
always|AWL-wayz|every time|हमेशा|I always drink tea in the morning.
never|NEV-er|not at any time|कभी नहीं|I never eat late at night.
sometimes|SUM-timez|not always|कभी-कभी|Sometimes I walk to work.
because|bih-KAWZ|for the reason that|क्योंकि|I am late because of the traffic.
maybe|MAY-bee|perhaps|शायद|Maybe I will go tomorrow.
`);

// word -> entry (THEMES first, so the richer theme examples win)
const DICT = new Map();
[...THEMES.flatMap(([, list]) => list), ...GLOSS].forEach((e) => { if (!DICT.has(e.word.toLowerCase())) DICT.set(e.word.toLowerCase(), e); });
function lookup(raw) {
  let w = String(raw || '').toLowerCase().replace(/["“”']/g, '').replace(/[?.!,]/g, '').replace(/^(?:the word|word|a|an|the)\s+/, '').trim();
  if (!w) return null;
  const tries = [w, w.replace(/s$/, ''), w.replace(/es$/, ''), w.replace(/ing$/, ''), w.replace(/ing$/, 'e'), w.replace(/ed$/, ''), w.replace(/ed$/, 'e'), w.replace(/ied$/, 'y'), w.replace(/ies$/, 'y')];
  for (const t of tries) if (DICT.has(t)) return DICT.get(t);
  return null;
}

// ---------- 3. Conversation ----------
const SCEN = {
  interview: ['Why do you want this job?', 'What is your biggest strength?', 'Tell me about a difficult task you finished.', 'How do you work in a team?', 'Where do you see yourself in five years?', 'What did you do in your last job?', 'Do you have any questions for me?'],
  phone: ['Could you tell me your name, please?', 'Can you explain the problem in a few words?', 'When did this problem start?', 'Do you have your order number with you?', 'What would you like me to do to help?', 'Is there anything else I can help with?'],
  coach: ['Good. Now, what is the main message of your talk?', 'Can you give one example for your audience?', 'How will you start your second point?', 'Say one sentence to keep the audience interested.', 'How will you end your talk?', 'What question might the audience ask you?'],
  chat: ['What do you usually do in the morning?', 'What do you like to do on weekends?', 'Tell me about your family or your friends.', 'What food do you enjoy most?', 'Where would you like to travel?', 'What was the best part of your week?', 'What are you learning these days?'],
};
const OPENERS = ['I see.', 'Nice!', 'Thanks for sharing.', 'That’s interesting.', 'Good, keep going.', 'Great effort!'];
const TIPS = [
  'Try to speak in full sentences. Longer answers help you improve faster.',
  'Use linking words like "because", "but" and "so" to make your answers richer.',
  'Slow down a little. Clear speech is better than fast speech.',
  'Use "I would like" instead of "I want" to sound more polite.',
  'Add one detail to every answer: when, where or why.',
];
const ROLE_INTRO = {
  chat: 'I’m Ava, your English tutor. I help you practise speaking, fix mistakes and learn new words.',
  interview: 'I’m Ava, and I’ll be your interviewer today.',
  phone: 'My name is Ava, and I’m a customer service agent.',
  coach: 'I’m Ava, your speaking coach for this presentation.',
};

// Follow-up topics for casual chat: [keywords, short reaction, follow-up question]
const TOPICS = [
  [/\b(family|mother|father|mom|dad|mummy|papa|parents|brother|sister|wife|husband|son|daughter|kids?|children)\b/, 'Family is so important.', 'What do you like to do with your family?'],
  [/\b(friends?)\b/, 'Good friends make life better.', 'What do you and your friends usually do together?'],
  [/\b(cricket|football|sports?|gym|exercise|running|yoga|walking|badminton)\b/, 'Staying active is good for you.', 'How often do you play sports or exercise?'],
  [/\b(food|ate|lunch|dinner|breakfast|cook|cooking|pizza|rice|roti|biryani|tea|coffee|chai|hungry|snacks?|eat)\b/, 'Food is a great topic!', 'What is your favourite food, and why do you like it?'],
  [/\b(office|job|company|boss|colleagues?|career|business|work|working)\b/, 'Work takes up a big part of the day.', 'What do you like most about your work?'],
  [/\b(study|studies|student|college|school|exams?|class|university|teacher|homework)\b/, 'Studying takes effort. Well done!', 'What is your favourite subject, and why?'],
  [/\b(travel|trip|holiday|vacation|goa|mumbai|delhi|beach|mountains?|flight|train)\b/, 'Travel is exciting!', 'Where would you like to go next, and why?'],
  [/\b(weather|rain|raining|hot|cold|summer|winter|monsoon|sunny)\b/, 'The weather changes our mood, doesn’t it?', 'What is your favourite season, and why?'],
  [/\b(music|songs?|sing|singing|guitar|dance|dancing)\b/, 'Music is wonderful!', 'What kind of music do you enjoy?'],
  [/\b(movies?|films?|series|netflix|actor|cinema)\b/, 'Movies are a nice way to learn English.', 'What was the last movie you watched?'],
  [/\b(books?|read|reading|story|stories)\b/, 'Reading helps your English a lot.', 'What kind of books or stories do you like?'],
  [/\b(phone|mobile|internet|computer|laptop|apps?|youtube|instagram|social media)\b/, 'Technology is part of daily life.', 'How do you use technology to learn English?'],
  [/\b(shopping|shop|market|bought|mall|clothes)\b/, 'Shopping can be fun.', 'Do you prefer shopping online or in a shop?'],
  [/\b(sick|ill|doctor|fever|medicine|headache|health|pain)\b/, 'Health is very important.', 'What do you do to stay healthy?'],
  [/\b(dreams?|goals?|future|plans?)\b/, 'Having a goal is great.', 'What is your biggest goal for this year?'],
  [/\b(english|speaking|learning|practise|practice|fluent)\b/, 'Practice is the key to fluent English.', 'Why do you want to improve your English?'],
  [/\b(weekend|saturday|sunday)\b/, 'Weekends are for rest and fun.', 'What is your perfect weekend like?'],
  [/\b(morning|woke|wake|early)\b/, 'Mornings set the tone for the day.', 'What is the first thing you do after you wake up?'],
  [/\b(city|town|village|home|house|nagpur|live|india|indian|(?:i am|i'm|i come) from)\b/, 'Home is a special place.', 'What do you like most about the place where you live?'],
];

// Role-specific reactions for interview / phone / presentation practice
const KIND_ACK = {
  interview: [[/\b(team|together|colleagues?)\b/, 'Teamwork is important in most jobs.'], [/\b(experience|worked|years?)\b/, 'Thank you. That experience sounds useful.'], [/\b(strengths?|good at|skills?)\b/, 'That is a useful strength.'], [/\b(learn|grow|challenge|improve)\b/, 'It is good to want to grow.'], [/\b(salary|money|pay)\b/, 'We can talk about salary later in the process.']],
  phone: [[/\b(order|parcel|package|delivery)\b/, 'I understand. I will check your order.'], [/\b(refund|payment|bill|charged)\b/, 'I understand. Let me look at your payment.'], [/\b(internet|wifi|network|connection)\b/, 'I understand. Let me check the connection.'], [/\b(appointment|booking|book)\b/, 'Of course. I can help with a booking.'], [/\b(problem|issue|not working|broken)\b/, 'I am sorry about the problem. I will try to fix it.']],
  coach: [[/\b(good morning|good afternoon|good evening|hello|everyone)\b/, 'Nice greeting! It makes the audience feel welcome.'], [/\b(today|talk about|topic)\b/, 'Good, that is a clear topic.'], [/\b(first|second|finally|then|next)\b/, 'Good. Linking words help your audience follow you.']],
};

// Questions learners ask about English. { all: words that must all appear } or { re }
const KB = [
  { all: ['make', 'do'], a: 'Use "do" for tasks and activities (do homework, do the dishes). Use "make" for creating something (make tea, make a plan, make a mistake).' },
  { all: ['say', 'tell'], a: '"Say" is used with the words spoken: say "hello". "Tell" needs a person: tell me, tell him a story.' },
  { all: ['much', 'many'], a: '"Many" goes with countable nouns (many books). "Much" goes with uncountable nouns (much water, much time).' },
  { all: ['since', 'for'], a: 'Use "for" with a length of time (for two years). Use "since" with a starting point (since 2020, since Monday).' },
  { all: ['borrow', 'lend'], a: '"Borrow" means to take something for a short time. "Lend" means to give it for a short time. "Can I borrow your pen?" / "Can you lend me your pen?"' },
  { all: ['bring', 'take'], a: '"Bring" is towards the speaker (bring it here). "Take" is away from the speaker (take it there).' },
  { all: ['affect', 'effect'], a: '"Affect" is usually a verb (rain affects traffic). "Effect" is usually a noun (the effect of rain).' },
  { all: ['few', 'little'], a: '"Few" is for countable things (few friends). "Little" is for uncountable things (little time). "A few" and "a little" mean "some".' },
  { all: ['good', 'well'], a: '"Good" is an adjective (a good song). "Well" is an adverb (she sings well).' },
  { all: ['listen', 'hear'], a: 'You "hear" a sound without trying. You "listen" on purpose: listen to music.' },
  { all: ['watch', 'see', 'look'], a: '"See" is what your eyes do. "Look" is to turn your eyes on something on purpose (look at me). "Watch" is to look at something that moves (watch a film).' },
  { all: ['its', "it's"], a: '"It\'s" means "it is" or "it has". "Its" shows ownership: the dog wagged its tail.' },
  { all: ['their', 'there'], a: '"Their" shows ownership (their house). "There" is a place (over there). "They\'re" means "they are".' },
  { all: ['in', 'on', 'at'], a: 'Use "at" for exact times and places (at 5 pm, at the station). Use "on" for days and dates (on Monday). Use "in" for months, years and big places (in July, in India).' },
  { re: /\b(when|how) (to|do i) use a (and|or) an\b|\ba (and|or) an\b|\ba or an\b/, a: 'Use "an" before a vowel SOUND (an apple, an hour). Use "a" before a consonant sound (a book, a university).' },
  { re: /\bpresent perfect\b/, a: 'Use the present perfect (have/has + past participle) for experiences or things that started in the past and still matter now: "I have lived here for five years."' },
  { re: /\b(past simple|simple past)\b/, a: 'Use the past simple for finished actions: "I visited Goa last year." Regular verbs take -ed. Irregular verbs change (go, went).' },
  { re: /\bpresent continuous\b/, a: 'Use the present continuous (am/is/are + -ing) for actions happening now: "I am studying English."' },
  { re: /\b(will and going to|going to and will|will or going to|will vs going to)\b/, a: 'Use "will" for quick decisions and promises. Use "going to" for plans you already made.' },
  { re: /\bhow (can|do|to) i? ?(improve|learn|practise|practice) (my )?english\b|\bspeak english (fluently|well|better)\b|\bimprove my english\b/, a: 'Speak a little every day, even for five minutes. Listen to English songs or podcasts, repeat sentences aloud, and do not be afraid of mistakes. Chatting with me daily is a great start!' },
  { re: /\bhow (do|can|to) (i )?introduce (myself|me)\b/, a: 'You can say: "Hello, my name is ___. I am from ___. I work as ___, and I like ___."', own: 'Now try it with your own details.' },
];
const hasWord = (m, w) => new RegExp("(?:^|[^a-z'])" + w + "(?![a-z'])").test(m);

const FACTS = { india: 'New Delhi', maharashtra: 'Mumbai', usa: 'Washington, D.C.', america: 'Washington, D.C.', 'united states': 'Washington, D.C.', uk: 'London', england: 'London', britain: 'London', 'united kingdom': 'London', japan: 'Tokyo', france: 'Paris', germany: 'Berlin', australia: 'Canberra', china: 'Beijing', canada: 'Ottawa', pakistan: 'Islamabad', nepal: 'Kathmandu', bangladesh: 'Dhaka' };

// Hindi / Hinglish -> English: [pattern on lower-case Latin text, English sentence]
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const HINGLISH = [
  [/\b(?:mera|meraa) naam ([a-z]+) hai\b/, (m) => `My name is ${cap(m[1])}.`],
  [/\baap kaise (?:ho|hain)\b|\bkaise ho\b|\baap kaisi (?:ho|hain)\b/, () => 'How are you?'],
  [/\b(?:main|mai) (?:theek|thik|accha|achha) h(?:u|oon|un)\b/, () => 'I am fine.'],
  [/\b(?:aapka|tumhara|apka) naam kya hai\b/, () => 'What is your name?'],
  [/\benglish (?:seekhni|sikhni|seekhna|sikhna) (?:hai|he)\b/, () => 'I want to learn English.'],
  [/\bbhook lagi hai\b/, () => 'I am hungry.'],
  [/\bpyaas lagi hai\b/, () => 'I am thirsty.'],
  [/\b(?:main|mai) ([a-z]+) (?:mein|me) (?:rehta|rehti|rahta|rahti) h(?:u|oon|un)\b/, (m) => `I live in ${cap(m[1])}.`],
  [/\bmujhe ([a-z ]+?) pasand hai\b/, (m) => `I like ${m[1]}.`],
  [/\b(?:main|mai) student h(?:u|oon|un)\b/, () => 'I am a student.'],
  [/\bmujhe ([a-z ]+?) chahiye\b/, (m) => `I need ${m[1]}.`],
  [/\b(?:dhanyavaad|dhanyawad|shukriya)\b/, () => 'Thank you.'],
  [/\bmujhe nahi pata\b|\bpata nahi\b/, () => "I don't know."],
  [/\b(?:main|mai) kaam (?:karta|karti) h(?:u|oon|un)\b/, () => 'I work.'],
  [/\bkitne ka hai\b|\bkitna hua\b|\bkitna hai\b/, () => 'How much is it?'],
  [/\b(?:madad|help) kijiye\b|\bkripya madad\b/, () => 'Please help me.'],
  [/\b(?:main|mai) thak (?:gaya|gayi) h(?:u|oon|un)\b/, () => 'I am tired.'],
];
const HI_STRONG = /\b(hai|hain|hoon|mera|meri|mere|mujhe|aap|aapka|kya|kaise|kyun|kahan|nahi|nahin|bahut|accha|achha|theek|thik|karta|karti|raha|rahi|chahiye|samajh|pata|naam|rehta|rehti|aaj|abhi|lekin|mein|tum|tumhara|hum|bhook|pyaas|dhanyavaad|shukriya|kripya|madad|kijiye|kitna|kitne|matlab|kal|gaya|gayi|tha|thi|mai|kiya|ghar|dost|kaam|kuch|yaar|bhai|sab|toh|bhi|aur)\b/g;
function hindiInput(msg, m) {
  if (/[\u0900-\u097F]/.test(msg)) return { translation: '' };
  const hits = new Set(m.match(HI_STRONG) || []);
  if (hits.size < 2 && !(hits.size === 1 && /\b(samajh|matlab|shukriya|dhanyavaad|kripya|nahi|nahin)\b/.test(m))) return null;
  for (const [re, fn] of HINGLISH) { const x = m.match(re); if (x) return { translation: fn(x) }; }
  return { translation: '' };
}

// ---------- Helpers ----------
const norm = (s) => s.toLowerCase().replace(/[’‘]/g, "'").replace(/[^a-z0-9'?\u0900-\u097F ]/g, ' ').replace(/\s+/g, ' ').trim();
const words = (m) => m.split(' ').filter(Boolean).length;
const asked = (hist, q) => hist.includes(q);
const fixQuestion = (s) => cap(s.trim().replace(/[.!]+$/, '')).replace(/\?*$/, '?');

function nextScen(kind, hist, turn) {
  const list = SCEN[kind];
  for (let i = 0; i < list.length; i++) { const q = list[(turn + i) % list.length]; if (!asked(hist, q)) return q; }
  return list[turn % list.length];
}

// Grammar Q&A lookup. Needs a real grammar intent, so "Do you make tea or coffee?" is not mistaken for "make vs do".
function kbLookup(m) {
  for (const k of KB) {
    const intent = /\b(differen\w*|between|vs|versus|use|using|explain)\b/.test(m) || (words(m) <= 4 && !/^(do|does|did) you\b/.test(m)) || (words(m) <= 6 && /\b(or|and)\b/.test(m) && !/^(do|does|did) you\b/.test(m));
    if (k.all ? intent && k.all.every((w) => hasWord(m, w)) : k.re.test(m)) return k;
  }
  return null;
}

// Direct answers to what the learner asks. Returns { text, own?, q?, word? } or null.
function answerQuestion(m, msg, ctx) {
  const { kind } = ctx;

  // simple sums: "what is 5 + 3"
  const sum = msg.match(/^(?:what(?:'s| is)|calculate|solve|how much is)?\s*(-?\d+(?:\.\d+)?)\s*(\+|plus|-|minus|\*|x|times|multiplied by|\/|divided by)\s*(-?\d+(?:\.\d+)?)\s*(?:=|\?)?\s*$/i);
  if (sum) {
    const a = +sum[1], b = +sum[3], op = sum[2].toLowerCase();
    const [name, val] = /^(\+|plus)$/.test(op) ? ['plus', a + b] : /^(-|minus)$/.test(op) ? ['minus', a - b] : /^(\*|x|times|multiplied by)$/.test(op) ? ['times', a * b] : ['divided by', b === 0 ? NaN : a / b];
    if (Number.isNaN(val)) return { text: 'We cannot divide a number by zero!' };
    return { text: `${a} ${name} ${b} is ${Math.round(val * 100) / 100}.` };
  }

  // time and date (from your device clock)
  if (/\bwhat(?:'s| is) the time\b|\bwhat time is it\b|\bcurrent time\b/.test(m)) return { text: `It is ${new Date().toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })} on your device clock.` };
  if (/\bwhat(?:'s| is) (?:the )?(?:today'?s )?date\b|\bwhat day is (?:it|today)\b|\btoday'?s date\b/.test(m)) return { text: `Today is ${new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}.` };
  if (/\bhow(?:'s| is) the weather\b|\bis it (?:raining|sunny|hot|cold)\b/.test(m)) return { text: 'I cannot check the live weather offline, but I would love to know.', own: 'How is the weather where you are today?' };

  // meaning of a word (English and Hinglish questions)
  const MEAN = [/(?:meaning|definition|translation) of (.+?)(?: in (?:hindi|english))?\??$/, /\bwhat (?:does|is|do) (.+?) mean\??$/, /\bwhat(?:'s| is) (.+?) in hindi\??$/, /^(?:define|translate) (.+?)(?: (?:in|to|into) hindi)?\??$/, /^(.+?) (?:ka|ke) (?:meaning|matlab|hindi|arth)\b/, /^(?:meaning|matlab) (.+?)\??$/];
  for (const re of MEAN) {
    const x = m.match(re);
    if (!x) continue;
    const w = lookup(x[1]);
    const shown = x[1].replace(/^(?:the word |word )/, '').replace(/\?/g, '').trim();
    if (w) return { text: `“${w.word}” means ${w.meaning}. In Hindi: ${w.hindi}. For example: “${w.example}”`, own: `Can you make your own sentence with “${w.word}”?`, word: w };
    return { text: `I do not have “${shown}” in my small offline dictionary yet. Try a dictionary app, or use the word in a sentence and I will check your grammar.` };
  }

  // pronunciation
  const pr = m.match(/\bhow (?:do|can|to) (?:i |you )?(?:pronounce|say) (.+?)\??$/) || m.match(/\bpronunciation of (.+?)\??$/) || m.match(/\bpronounce (.+?)\??$/);
  if (pr) {
    const w = lookup(pr[1]);
    if (w) return { text: `You can say “${w.word}” like this: ${w.say}. Tap 🔊 on my message or the word card to hear it.`, own: 'Now say it in a sentence.', word: w };
    const hi = hindiInput(pr[1], pr[1]);
    if (hi && hi.translation) return { text: `In English you can say: “${hi.translation}”`, own: 'Can you say it once yourself?' };
    return { text: 'I cannot sound out that word offline. Use the 🎙️ Pronunciation tab to practise any word or sentence.' };
  }

  // grammar questions
  const kb = kbLookup(m);
  if (kb) return { text: kb.a, own: kb.own || undefined };

  // questions about Ava
  if (/\b(your name|who are you|what are you called)\b/.test(m)) return { text: ROLE_INTRO[kind], own: kind === 'chat' ? 'And what is your name?' : undefined };
  if (/\bhow are you\b|\bhow r u\b|\bhow do you do\b|\bhow(?:'s| is) it going\b|\bwhat'?s up\b|\bhow have you been\b/.test(m)) return { text: 'I’m doing well, thank you!', own: kind === 'chat' ? 'How are you today?' : undefined };
  if (/\bwhat do you do\??$|\bwhat do you do for (?:a )?(?:living|work)\b|\byour (?:job|work|profession)\b/.test(m)) return { text: ROLE_INTRO[kind] };
  if (/\b(are you|r u) (?:a |an )?(?:robot|human|real|ai|bot|machine|person)\b/.test(m)) return { text: 'I’m an AI tutor, not a human. But I’m always happy to practise English with you.' };
  if (/\bhow old are you\b|\byour age\b/.test(m)) return { text: 'I’m an AI tutor, so I don’t have an age. I never get tired of practising English, though!' };
  if (/\bwhere (?:are you from|do you live|are you)\b/.test(m)) return { text: 'I’m an AI tutor, so I live inside this app!' };
  if (/\bdo you speak (hindi|marathi)\b/.test(m)) return { text: 'I can help with Hindi meanings, but I’m here to help you practise English. Let’s keep using English together.' };
  if (/\b(?:can|could|will|would) you help me\b|\bhelp me\b/.test(m)) return { text: kind === 'phone' ? 'Of course. I’m happy to help.' : 'Of course! I’m happy to help.' };
  if (/\b(?:can|could|may) i (?:introduce|start|begin|tell|ask|say|speak)\b/.test(m)) return { text: 'Yes, of course. Please go ahead.', own: '' };


  // "And you?" / "I like cricket, do you?"
  const bare = m.replace(/\?/g, '').trim();
  if (/^(?:and you|how about you|what about you)$/.test(bare) || (words(bare) >= 3 && !/^(what|where|when|why|how|which|who|do|does|did|can|could|will|are|is|have)\b/.test(bare) && /\b(?:and you|how about you|what about you|do you|did you|are you|have you|can you|will you)$/.test(bare))) return { text: 'I’m an AI tutor, so I don’t have a day or favourites like you, but I enjoy hearing about yours!' };

  // facts
  const cap1 = m.match(/\bcapital (?:city )?of (?:the )?([a-z ]+?)\??$/);
  if (cap1 && FACTS[cap1[1].trim()]) return { text: `The capital of ${cap(cap1[1].trim())} is ${FACTS[cap1[1].trim()]}.` };

  return null;
}

function reactionFor(m, kind) {
  for (const [re, t] of KIND_ACK[kind] || []) if (re.test(m)) return t;
  return '';
}

// ---------- Prompt handling ----------
const NEG_POS = /\b(?:not|never|no|n't)\s+(?:very\s+|so\s+|too\s+|really\s+|feeling\s+)?(good|great|happy|fine|well|nice|excited|ok|okay)\b/;
const STOP_NAME = new Set(['Fine', 'Good', 'Happy', 'Tired', 'Busy', 'Okay', 'Sorry', 'Sure', 'Ready', 'Here', 'Very', 'Not', 'Also', 'Still', 'Just', 'Really', 'From', 'Learning', 'Student', 'Good', 'Great', 'Well', 'Glad', 'Excited', 'Sad', 'Indian', 'American', 'British', 'Engineer', 'Doctor', 'Teacher', 'Manager', 'Married', 'Single', 'Vegetarian', 'Marathi', 'Hindi', 'English', 'Nagpuri', 'Beginner', 'Intermediate', 'Advanced']);
let turn = 0, lastKey = '';
function chat(p) {
  const level = (p.match(/level is (\w+)/) || [])[1] || 'Beginner';
  const role = (p.match(/you act as (.*?)\. Today/s) || [])[1] || '';
  const topic = (p.match(/topic: (.*?);/) || [])[1] || 'daily life';
  const rawMsg = (p.match(/newest message: "([\s\S]*?)"\n\nRespond/) || [])[1] || '';
  const hist = (p.match(/Conversation so far:\n([\s\S]*?)\nLearner's newest/) || [])[1] || '';
  const key = role + topic;
  if (key !== lastKey || hist.split('\n').filter(Boolean).length <= 1) turn = 0;
  lastKey = key;
  const kind = /interview/.test(role) ? 'interview' : /customer service/.test(role) ? 'phone' : /coach/.test(role) ? 'coach' : 'chat';
  const msg = rawMsg.replace(/[’‘]/g, "'").trim();
  const m = norm(msg);
  const ctx = { kind, level };
  const tl = hist.split('\n').filter((l) => l.startsWith('Tutor: '));
  const lastTutor = tl.length ? tl[tl.length - 1].slice(7) : '';
  const lastQ = ((lastTutor.match(/[^.!?]*\?/g) || []).pop() || lastTutor).replace(/^[”"’'\s]+/, '').trim();
  const vb = vocabFor(topic, level);
  const steer = kind === 'chat' && turn % 3 === 2 ? (level === 'Beginner' ? `Let’s practise today’s topic: ${topic}. Say one sentence about it.` : level === 'Intermediate' ? `Let’s link this to today’s topic, ${topic.toLowerCase()}. What is your experience with it?` : `Considering today’s topic, ${topic.toLowerCase()}, what is your view, and why?`) : '';
  const scen = () => (steer && !asked(hist, steer) ? steer : nextScen(kind, hist, turn));

  let reply = '', corrected = '', issues = [], tip = '', word = null, advance = true;
  const meanQ = /\b(?:ka|ke) (?:meaning|matlab|hindi|arth)\b/.test(m);
  const hi = meanQ ? null : hindiInput(msg, m);
  const nWords = words(m);

  if (nWords <= 6 && (/समझ नहीं/.test(msg) || /\b(repeat|say (?:that |it )?again|once more|pardon|come again|what do you mean|i (?:do not|don't|didn't|did not) (?:understand|get it|catch)|not understand|samajh nahi|can you explain (?:that|it))\b/.test(m))) {
    // "I don't understand" -> ask the last question again
    reply = `No problem! Let me ask again: ${lastQ || scen()}${level === 'Beginner' ? ' (कोई बात नहीं, मैं दोबारा पूछती हूँ।)' : ''} Take your time. You can start with “I think…” or “I like…”.`;
    advance = false;
    tip = 'It is okay to ask Ava to repeat. Real speakers do it too.';
  } else if (hi) {
    // Hindi / Hinglish: show the English way to say it
    if (hi.translation) {
      corrected = hi.translation;
      issues = [{ wrong: msg, right: hi.translation, why: 'This is how to say it in English.' }];
      reply = /\bhow (?:to|do i|can i|do you) say\b/.test(m) ? `In English you can say: “${hi.translation}” Can you say it once yourself?` : `Nice try! In English you can say: “${hi.translation}” Can you say it once in English?`;
    } else {
      reply = `I understand a little Hindi, but let’s practise in English. Please try again with simple words. ${lastQ || scen()}`;
      advance = false;
    }
    tip = 'Try to think in English, even for short sentences.';
  } else if (nWords <= 4 && /^(bye|goodbye|good night|see you|see ya|talk to you later|talk later)\b/.test(m)) {
    reply = /good night/.test(m) ? 'Good night! Sleep well, and see you again soon.' : 'Goodbye! You practised well today. See you again soon!';
  } else {
    const c = check(msg);
    corrected = c.corrected; issues = c.issues;
    const qStart = /^(what|who|whom|whose|where|when|why|how|which|do|does|did|can|could|will|would|shall|should|is|are|am|was|were|have|has|may)\b/.test(m);
    const mathQ = /^(?:what(?:'s| is)\s+)?-?\d+(?:\.\d+)?\s*(?:[-+*\/x]|plus|minus|times|multiplied by|divided by)\s*-?\d/i.test(msg);
    const askish = /\b(?:difference between|meaning of|pronunciation of|capital of)\b|^(?:define|translate|explain|pronounce)\b/.test(m);
    const isQ = qStart || meanQ || mathQ || askish || /\?\s*$/.test(msg) || (!/^(i|we|my|he|she|they|you|it|this|that) /.test(m) && !!kbLookup(m));
    let lead = '', q = '', own = false;

    // name and greeting
    const nm = msg.match(/\b(?:my name is|myself|call me)\s+([A-Za-z]{2,})/i) || msg.match(/\b(?:I am|I'm)\s+([A-Z][a-z]{2,})\b/);
    const name = nm && !STOP_NAME.has(cap(nm[1].toLowerCase())) ? cap(nm[1].toLowerCase()) : '';
    const greet = (msg.match(/^(hi+|hello|hey|good (?:morning|afternoon|evening))\b/i) || [])[1];

    const ans = isQ ? answerQuestion(m, msg, ctx) : null;
    if (ans) {
      lead = ans.text;
      if (ans.own) { q = ans.own; own = true; } else if (ans.own === '') own = true;
      if (ans.word) word = { word: ans.word.word, meaning: `${ans.word.meaning} (${ans.word.hindi}). Example: ${ans.word.example}` };
    } else if (isQ && qStart) {
      // a question we cannot answer: be honest, never make something up
      if (kind === 'phone') lead = 'Let me check that for you.';
      else if (kind === 'interview') lead = 'That is a good question. We can talk about it at the end.';
      else if (kind === 'coach') lead = 'That is a good question to think about for your talk.';
      else if (/\byou(r)?\b/.test(m)) { lead = 'I’m an AI tutor, so I can’t answer that like a person, but I’d love to hear your answer.'; q = fixQuestion(corrected || msg); own = true; }
      else lead = 'That is an interesting question, but I cannot look it up offline. Let’s keep practising English.';
    } else if (name) {
      lead = (greet ? cap(greet.toLowerCase()) + '! ' : '') + (kind === 'phone' ? `Thank you, ${name}.` : `Nice to meet you, ${name}!`);
    } else if (greet && nWords <= 6) {
      lead = `${cap(greet.toLowerCase())}! It is nice to talk with you.`;
    } else if (nWords <= 5 && /^(?:ok |okay )?(?:thanks|thank you|thank u|thx)\b/.test(m)) {
      lead = kind === 'coach' ? 'Well done! That is a polite way to end a talk.' : 'You’re welcome!';
    } else if (/^(i )?(do not|don't|dont) know\b|^not sure\b|^no idea\b|^i have no idea\b|^i am not sure\b|^i'm not sure\b|^idk\b/.test(m)) {
      lead = 'That’s okay! You can say “I’m not sure, but I think…”. Let’s try another question.';
    } else if (/^(?:i am|i'm) (?:fine|good|great|well|okay|ok|doing well)\b/.test(m)) {
      lead = 'Glad to hear that!';
    } else if (/^(sorry|my bad)\b/.test(m)) {
      lead = 'No problem at all. Mistakes help us learn!';
    } else {
      lead = reactionFor(m, kind);
      if (!lead) {
        if (NEG_POS.test(m) || /\b(sad|tired|angry|sick|upset|worried|stressed|lonely|bad|problem|difficult|pain|ill|fever|headache)\b/.test(m)) lead = 'I’m sorry to hear that.';
        else if (/\b(?:don't|do not|didn't|doesn't|never) (?:like|love|enjoy)\b|\bhate\b/.test(m)) lead = 'I understand. Not everyone likes the same things.';
        else if (/\bbusy\b/.test(m)) lead = 'That sounds like a busy day.';
        else if (/\b(good|great|happy|love|like|enjoy|fine|excellent|wonderful|awesome|nice|amazing|excited)\b/.test(m)) lead = 'That sounds great!';
      }
      if (kind === 'chat') {
        const t = TOPICS.find(([re, , tq]) => re.test(m) && !asked(hist, tq));
        if (t) { if (!lead) lead = t[1]; if (!steer) q = t[2]; }
      }
      if (!lead) lead = nWords < 3 ? 'Try a full sentence next time.' : OPENERS[turn % OPENERS.length];
    }
    if (!own && !q) q = scen();
    reply = `${lead} ${q}`.trim();
    tip = issues.length ? issues[0].why : turn % 2 ? TIPS[turn % TIPS.length] : '';
  }

  const w = vb[turn % vb.length];
  if (!word) word = { word: w.word, meaning: `${w.meaning}. Example: ${w.example}` };
  if (advance) turn++;
  return { reply, corrected, issues, tip, newWord: word };
}
export async function askAI(prompt) {
  await new Promise((r) => setTimeout(r, 400)); // small pause so "Ava is thinking…" feels natural
  const p = String(prompt);
  if (/Create 5 vocabulary/.test(p)) {
    const level = (p.match(/at (\w+) level/) || [])[1] || 'Beginner';
    const topic = (p.match(/Topic: (.*?)\. Return/) || [])[1] || '';
    return { text: JSON.stringify(vocabFor(topic, level)) };
  }
  return { text: JSON.stringify(chat(p)) };
}

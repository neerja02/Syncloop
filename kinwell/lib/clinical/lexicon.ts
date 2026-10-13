/**
 * Everyday health language → plain English, so the safety engine and symptom detection understand
 * Hindi, Punjabi and Hinglish phrases, common misspellings and run-together words.
 *
 * It adds an English reading next to the original text (it never replaces what the person said), and
 * keeps negation: "bukhar nahi hai" reads as "no fever". Demo vocabulary — extend and review with
 * native speakers and clinicians before production use.
 */

type Rule = [RegExp, string];

/** Whole phrases first (so "neend nahi aati" isn't read word by word). */
const PHRASES: Rule[] = [
  // Safety-critical
  [/\b(jeena nahi? (chahta|chahti|hai)|jeene ka (mann|man|dil) nahi?|marna chahta|marna chahti|mar jaana chahta|mar jana chahta|mar jana chahti|khud ?kushi|aatm ?hatya|zindagi (khatam|se tang)|jeena nahi)\b/g, "want to die"],
  [/\b(saans|saas|saah) (nahi|nahin|na) (aa|aa rahi|aa raha|le pa)\w*/g, "can't breathe"],
  [/\b(saans|saas|saah) (phool|phul|chadh|charh)\w*|(saans|saas) lene (mein|me|vich) (dikkat|taklif|takleef|pareshani)/g, "difficulty breathing"],
  [/\b(seen[ae]|chhati|chati|chhaati|chaati|chhatee)\s+(mein|me|vich|ch)\s+(bhaar[iy]?pan|bharipan|bhaari|bhari|dabav|dabaav|jakdan|jakad)/g, "heaviness in chest"],
  [/\b(seen[ae]|chhati|chati|chhaati|chaati)\s+(mein|me|vich|ch)\s+(dard|dukh|peed|peerh)/g, "chest pain"],
  [/\b(khoon|lahu) (ki|di) (ulti|ultiyan|kai)/g, "vomiting blood"],
  [/\b(chehra|muh|munh|mooh) (tedha|tedhi|latak)\w*|\blaqwa\b|\blakwa\b/g, "face drooping"],
  [/\b(zubaan|zuban|jeebh) (ladkhada|lad[kh]+ada)\w*|bolne (mein|me) (dikkat|taklif)/g, "slurred speech"],
  [/\b(peshab|pishab|pesab|peshaab) (mein|me|vich|ch) (jalan|jalun|saad)/g, "burning when passing urine"],
  [/\b(pet|pait|dhidd?) (mein|me|vich|ch) (jalan|jalun|saad)/g, "acidity burning in stomach"],
  [/\b(mann|man|mun|dil|jee|ji) (nahi|nahin|na) (lag|lagda|lagta|lag raha|lag rahi)\w*/g, "low mood feeling down"],
  [/\b(neend|nind|neendh) (nahi|nahin|na) (aa|aati|aata|aa rahi|aandi)\w*/g, "can't sleep"],
  [/\b(nas|nass|nus) (chadh|charh|chad|chaD)\w*/g, "muscle cramp"],
  [/\b(bhookh|bhook|bhukh|bhuk) (nahi|nahin|na) (lag|lagti|lagdi)\w*/g, "loss of appetite"],
  [/\b(jee|ji) (machal|machla|machlana|ghabra)\w*/g, "nausea"],
  [/\b(dil|dhadkan) (tez|zor se) (dhadak|chal)\w*|\bdhadkan tez\b/g, "heart is racing"],
  [/\bpet kharab\b/g, "loose motions"],
  [/\b(pair|paer|pairon|pairan|pera)\s+(mein|me|vich|ch)\b/g, "leg in"],
  [/\b(pet|pait)\s+(mein|me|vich|ch)\b/g, "stomach in"],
  [/\b(pet|pait) (dard|dukh)/g, "stomach pain"],
];

/** "X nahi hai" → "no X" before translation, so concept matching sees the negation. */
const NEGATION: Rule = [/\b([a-z]+) (nahi|nahin|nai|na) (hai|he|h|hain|haiga|aa)\b/g, "no $1"];

/** Single words. */
const WORDS: Rule[] = [
  // Symptoms
  [/\b(dard|dardh|dukh|dukhna|dukhta|dukhti|dukhda|dukh raha|dukh rahi|peed|peeda|peerh|pira)\b/g, "pain"],
  [/\b(bukhar|bukhaar|bukhār|taap)\b/g, "fever"],
  [/\b(khansi|khaansi|khasi|khang)\b/g, "cough"],
  [/\b(zukam|zukaam|jukam|jukaam|nazla)\b/g, "runny nose cold"],
  [/\b(ulti|ultiyan|ultee|kai)\b/g, "vomiting"],
  [/\b(dast|daast)\b/g, "loose motions"],
  [/\b(jalan|jalun|saad)\b/g, "burning"],
  [/\b(khujli|khujlee|kharish|khaarish)\b/g, "itching"],
  [/\b(chakkar|chakar|chakkr)\b/g, "dizzy"],
  [/\b(kamzori|kamjori|kamzoree)\b/g, "weakness"],
  [/\b(thakan|thakaan|thakawat|thakavat|thakaawat)\b/g, "tired"],
  [/\b(sujan|soojan|soojh|sojh|suja|sooja|sujh)\b/g, "swollen swelling"],
  [/\b(sunn|suun)\b|\bsunn? pa[dr]\w*/g, "numb"],
  [/\b(jhunjhuni|jhanjhanahat|jhanjhnahat|chitiyan|cheentiyan)\b/g, "tingling"],
  [/\b(moch|mochh)\b/g, "sprain"],
  [/\b(chot|chott|satt)\b/g, "injury"],
  [/\b(behosh|behoshi|behoshee)\b/g, "fainted"],
  [/\b(daura|daure|mirgi)\b/g, "seizure"],
  [/\b(ghabrahat|ghabraahat|bechaini|bechainee|chinta)\b/g, "anxious"],
  [/\b(udaas|udas|udaasi|udasi|dukhi)\b/g, "sad feeling down"],
  [/\b(qabz|kabz|kabj)\b/g, "constipation"],
  [/\b(afara|afaara|aphara)\b/g, "bloating"],
  [/\b(peshab|pishab|pesab|peshaab)\b/g, "urine"],
  [/\b(khoon|lahu)\b/g, "blood"],
  [/\b(pasina|paseena|pasine|paseene|mudhka|mudka)\b/g, "sweating"],
  [/\b(bhaar[iy]?pan|bharipan)\b/g, "heaviness"],
  // Body parts
  [/\b(sir|sar|sirr)(?=\s+(mein|me|vich|ch|dard|dukh|bhaari|bhari|bhaaripan|ghoom|ghum))/g, "head"],
  [/\b(gardan|gardn|dhaun|dhon)\b/g, "neck"],
  [/\b(kandha|kandhe|kandhaa|modha|modhe|mohda|mohde)\b/g, "shoulder"],
  [/\b(baazu|bazu|baanh|banh|baah|baahn)\b/g, "arm"],
  [/\b(kohni|kooni|kuhni)\b/g, "elbow"],
  [/\b(kalai|kalaai|gutt)\b/g, "wrist"],
  [/\b(haath|hath|haat)\b/g, "hand"],
  [/\b(ungli|ungliyan|ungliyon|ungal|unglan)\b/g, "finger"],
  [/\b(angootha|anguutha|angutha|angootha)\b/g, "thumb"],
  [/\b(hatheli|hathelee)\b/g, "palm"],
  [/\b(seena|seene|chhati|chati|chhaati|chaati)\b/g, "chest"],
  [/\b(kamar|kamr|kammar|lakk)\b/g, "lower back"],
  [/\b(peeth|pith|peet)\b/g, "back"],
  [/\b(kulha|kuhla|koolha|kulhe)\b/g, "hip"],
  [/\b(jaangh|jangh|jangha)\b/g, "thigh"],
  [/\b(ghutna|ghutne|ghutno|ghutnon|goda|gode|godda|godde)\b/g, "knee"],
  [/\b(pindli|pindliyan|pinni|pinniyan)\b/g, "calf"],
  [/\b(takhna|takhne|takna|gitta|gitte)\b/g, "ankle"],
  [/\b(edi|edhi|eddi|eddhi|addi|aedi)\b/g, "heel"],
  [/\b(talwa|talwe|talve|talva)\b/g, "sole of foot"],
  [/\b(aankh|aankhen|aankhon|ankh|akh|akhan)\b/g, "eye"],
  [/\b(kaan|kann|kaano|kanna)\b/g, "ear"],
  [/\b(naak|nakk)\b/g, "nose"],
  [/\b(gala|gale|galaa)\b/g, "throat"],
  [/\b(daant|dant|dand)\b/g, "tooth"],
  [/\b(masoode|masude|masoodon)\b/g, "gums"],
  [/\b(jabda|jabde)\b/g, "jaw"],
  // People and animals
  [/\b(bachcha|baccha|bacha|bachche|bachi|bachhi|nanha)\b/g, "baby"],
  [/\b(kutta|kutte|kutti|kuttiya)\b/g, "dog"],
  [/\b(billi|billa|bili)\b/g, "cat"],
  [/\b(dawai|dawa|dawaai|dawaiyan|goli|goliyan)\b/g, "medicine"],
];

/** Frequent misspellings and run-together words. */
const SPELLING: Rule[] = [
  [/\b(headake|hedache|headach|haedache|hedake|headace|headche)\b/g, "headache"],
  [/\b(stomache|stomac|stomuch|stomech|stumach|stomack)\b/g, "stomach"],
  [/\b(feaver|fevar|fevr|feavor|fiver|feever)\b/g, "fever"],
  [/\b(cought|coff|caugh|cof)\b/g, "cough"],
  [/\b(diarhea|diarhoea|diarohea|diareah|dairrhea|diarrea|diahrrea|diarrhia)\b/g, "diarrhoea"],
  [/\b(vomitting|vomting|vometing|vomitng|vomitin)\b/g, "vomiting"],
  [/\b(nausia|nausa|nauseus|nausious)\b/g, "nausea"],
  [/\b(brething|breathng|breating|breethe|breth)\b/g, "breathing"],
  [/\b(dizy|dizzey|dizzi|dizzzy)\b/g, "dizzy"],
  [/\b(pian|paine|painn)\b/g, "pain"],
  [/\b(sholder|shouldr|shoudler|soulder)\b/g, "shoulder"],
  [/\b(elbo|elbw)\b/g, "elbow"],
  [/\b(anckle|ankel|ancle|ankl)\b/g, "ankle"],
  [/\b(kne|kneee|knea)\b/g, "knee"],
  [/\b(chestpain)\b/g, "chest pain"],
  [/\b(backpain)\b/g, "back pain"],
  [/\b(kneepain)\b/g, "knee pain"],
  [/\b(stomachache|stomachpain)\b/g, "stomach ache"],
  [/\b(itchy|itchiness)\b/g, "itching"],
];

/** English reading of a message, or null when nothing needed translating. */
export function englishReading(text: string): string | null {
  let t = ` ${text.toLowerCase().replace(/[’']/g, "'")} `;
  const before = t;
  for (const [re, en] of PHRASES) t = t.replace(re, en);
  t = t.replace(NEGATION[0], NEGATION[1]);
  for (const [re, en] of WORDS) t = t.replace(re, en);
  for (const [re, en] of SPELLING) t = t.replace(re, en);
  t = t.replace(/\s+/g, " ").trim();
  return t === before.trim() ? null : t;
}

/** The original message plus its English reading, for concept matching and detection. */
export function withEnglishReading(text: string): string {
  const en = englishReading(text);
  return en ? `${text} | ${en}` : text;
}

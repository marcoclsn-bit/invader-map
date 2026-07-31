// Génère une vraie chasse parisienne et son itinéraire ORS, puis écrit le tout
// en JSON pour la composition de la carte de partage.
import { readFileSync, writeFileSync } from 'fs';
const S='/private/tmp/claude-501/-Users-marco-Documents-invader-map/79484e05-277b-4333-b150-c631a7965a51/scratchpad/';
const { planHunt, SPEEDS, haversineKm } = await import(S+'planner-final.mjs');

const inv  = JSON.parse(readFileSync('./data/invaders_PA.json','utf8')).invaders;
const pois = JSON.parse(readFileSync('./data/poi_PA.json','utf8')).pois.map(p=>({...p,isPoi:true}));

// Départ : République, quartier dense et lisible sur une carte
const startLat=48.8674, startLon=2.3636, budget=90;
const sel = planHunt(startLon, startLat, inv, budget, SPEEDS['foot-walking'], { pois, alpha: 0.4 });

const wp=[[startLon,startLat], ...sel.map(s=>[s.lng,s.lat]), [startLon,startLat]];
const key = readFileSync('.env.local','utf8').split('\n')
  .find(l=>l.startsWith('EXPO_PUBLIC_ORS_API_KEY')).replace(/^[^=]+=/,'').trim();

const res = await fetch('https://api.openrouteservice.org/v2/directions/foot-walking/geojson',{
  method:'POST', headers:{Authorization:key,'Content-Type':'application/json'},
  body: JSON.stringify({coordinates: wp})});
if(!res.ok){ console.error('ORS', res.status); process.exit(1); }
const j = await res.json();
const coords = j.features[0].geometry.coordinates;
const walkMin = j.features[0].properties.summary.duration/60;
const km = j.features[0].properties.summary.distance/1000;

// Rognage confidentialité : 120 m à chaque extrémité, comme dans l'app
const PRIV=0.12;
let a=0, b=coords.length-1;
while(a<b && haversineKm(coords[0][1],coords[0][0],coords[a][1],coords[a][0])<PRIV) a++;
while(b>a && haversineKm(coords[coords.length-1][1],coords[coords.length-1][0],coords[b][1],coords[b][0])<PRIV) b--;
const trace = coords.slice(a,b+1);

const invaders = sel.filter(s=>!s.isPoi);
const lieux    = sel.filter(s=>s.isPoi);
const out = {
  km: +km.toFixed(1),
  minutes: Math.round(walkMin + sel.length*1.5),
  invaders: invaders.length,
  lieux: lieux.length,
  points: invaders.reduce((s,x)=>s+x.points,0),
  pins: invaders.map(i=>({lon:i.lng, lat:i.lat, pts:i.points})),
  poiPins: lieux.map(p=>({lon:p.lng, lat:p.lat, nom:p.name})),
  trace,
};
writeFileSync(S+'chasse-reelle.json', JSON.stringify(out));
console.log(`${out.invaders} Invaders · ${out.lieux} lieux · ${out.km} km · ${out.minutes} min · +${out.points} pts`);
console.log(`tracé : ${trace.length} points (rognés de ${a} au début, ${coords.length-1-b} à la fin)`);
console.log('exemples de lieux :', lieux.slice(0,4).map(p=>p.name).join(' · '));

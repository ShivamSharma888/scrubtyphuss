// STAR — client-side JavaScript for functionality

// Self Assessment logic
document.addEventListener('submit', function(e){
  if(e.target && e.target.id === 'assessmentForm'){
    e.preventDefault();
    const fd = new FormData(e.target);
    let score = 0;
    for(const val of fd.values()) score += Number(val || 0);
    const box = document.getElementById('result');
    box.classList.remove('d-none','alert-success','alert-warning','alert-danger');
    if(score <= 2){
      box.classList.add('alert-success');
      box.textContent = 'Low risk. Score: ' + score + '. Maintain hygiene and monitor symptoms.';
    } else if(score <= 5){
      box.classList.add('alert-warning');
      box.textContent = 'Moderate risk. Score: ' + score + '. Consider visiting a clinic if symptoms progress.';
    } else {
      box.classList.add('alert-danger');
      box.textContent = 'High risk. Score: ' + score + '. Seek medical attention immediately.';
    }
    box.scrollIntoView({behavior:'smooth'});
  }
});

// Climate-based prediction
document.getElementById('getClimate')?.addEventListener('click', async function(){
  const lat = document.getElementById('lat').value.trim();
  const lon = document.getElementById('lon').value.trim();
  const box = document.getElementById('predictionBox');
  box.innerHTML = '';
  if(!lat || !lon){ box.innerHTML = '<div class="alert alert-danger">Please enter latitude and longitude.</div>'; return }
  box.innerHTML = '<div class="spinner-border" role="status"><span class="visually-hidden">Loading...</span></div>';
  try{
    // Using open-meteo free API (no key)
    const now = new Date();
    const start = new Date(now.getTime() - 7*24*3600*1000).toISOString().slice(0,10);
    const end = now.toISOString().slice(0,10);
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lon)}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=auto&start_date=${start}&end_date=${end}`;
    const res = await fetch(url);
    if(!res.ok) throw new Error('Weather API failed');
    const data = await res.json();
    // Very simple heuristic: warm temps + recent rainfall => higher risk
    const temps = data.daily.temperature_2m_max || [];
    const prec = data.daily.precipitation_sum || [];
    const avgTemp = (temps.reduce((a,b)=>a+b,0)/Math.max(1,temps.length));
    const totalRain = prec.reduce((a,b)=>a+b,0);
    let riskScore = 0;
    if(avgTemp >= 20) riskScore += 2;
    else if(avgTemp >= 15) riskScore += 1;
    if(totalRain >= 10) riskScore += 2;
    else if(totalRain >= 2) riskScore += 1;

    let riskText='', badge='';
    if(riskScore <= 1){ riskText='Low'; badge='risk-low' }
    else if(riskScore <= 3){ riskText='Moderate'; badge='risk-mod' }
    else { riskText='High'; badge='risk-high' }

    box.innerHTML = `
      <div class="card p-3">
        <h5>Climate summary (last 7 days)</h5>
        <p>Average max temp: <strong>${avgTemp.toFixed(1)}°C</strong></p>
        <p>Total precipitation: <strong>${totalRain.toFixed(1)} mm</strong></p>
        <div class="${badge}"><strong>Predicted risk: ${riskText}</strong></div>
        <p class="mt-2 small text-muted">This is an estimate based on a simple climate heuristic. Clinical validation required.</p>
      </div>
    `;
  }catch(err){
    box.innerHTML = '<div class="alert alert-danger">Failed to fetch climate data. ' + String(err) + '</div>';
  }
});

// Nearby Hospitals using Overpass API
document.getElementById('useMyLocation')?.addEventListener('click', function(){
  if(!navigator.geolocation){ alert('Geolocation not supported'); return }
  navigator.geolocation.getCurrentPosition(pos=>{
    document.getElementById('mhLat').value = pos.coords.latitude.toFixed(6);
    document.getElementById('mhLon').value = pos.coords.longitude.toFixed(6);
    findHospitals(pos.coords.latitude, pos.coords.longitude);
  }, err=>{
    alert('Location error: ' + err.message);
  }, {enableHighAccuracy:true});
});

document.getElementById('findNearby')?.addEventListener('click', function(){
  const lat = parseFloat(document.getElementById('mhLat').value);
  const lon = parseFloat(document.getElementById('mhLon').value);
  if(Number.isFinite(lat) && Number.isFinite(lon)) findHospitals(lat, lon);
  else alert('Please enter valid coordinates');
});

async function findHospitals(lat, lon){
  const list = document.getElementById('nearList');
  list.innerHTML = '<div class="spinner-border" role="status"></div>';
  try{
    // Overpass QL: nodes or ways with amenity=hospital within 5000m
    const radius = 5000;
    const query = `[out:json][timeout:25];
(
  node["amenity"="hospital"](around:${radius},${lat},${lon});
  way["amenity"="hospital"](around:${radius},${lat},${lon});
  relation["amenity"="hospital"](around:${radius},${lat},${lon});
);
out center 25;`;
    const url = 'https://overpass-api.de/api/interpreter';
    const res = await fetch(url, {method:'POST', body: query});
    if(!res.ok) throw new Error('Overpass API error');
    const data = await res.json();
    if(!data.elements || data.elements.length === 0){
      list.innerHTML = '<div class="alert alert-warning">No hospitals found within 5 km.</div>';
      return;
    }
    // Build list
    const items = data.elements.map(el=>{
      const name = (el.tags && el.tags.name) ? el.tags.name : 'Unnamed hospital';
      const latc = el.lat || (el.center && el.center.lat);
      const lonc = el.lon || (el.center && el.center.lon);
      const dist = distance(lat,lon,latc,lonc);
      const phone = el.tags && (el.tags.phone || el.tags['contact:phone'] || el.tags['contact:phone']) ? (el.tags.phone || el.tags['contact:phone'] || el.tags['phone']) : '';
      return {name,lat:latc,lon:lonc,dist,phone};
    }).sort((a,b)=>a.dist-b.dist);

    list.innerHTML = '<div class="list-group"></div>';
    const group = list.querySelector('.list-group');
    for(const it of items){
      const el = document.createElement('a');
      el.className='list-group-item list-group-item-action d-flex justify-content-between align-items-start';
      el.href = `https://www.openstreetmap.org/?mlat=${it.lat}&mlon=${it.lon}#map=18/${it.lat}/${it.lon}`;
      el.target = '_blank';
      el.innerHTML = `<div><div class="fw-bold">${escapeHtml(it.name)}</div><div class="small text-muted">Distance: ${it.dist.toFixed(1)} km</div></div><div class="text-end"><div>${it.phone?escapeHtml(it.phone):''}</div></div>`;
      group.appendChild(el);
    }
  }catch(err){
    list.innerHTML = '<div class="alert alert-danger">Failed to find hospitals: ' + String(err) + '</div>';
  }
}

function distance(lat1,lon1,lat2,lon2){
  if(!lat2||!lon2) return 9999;
  const R = 6371;
  const dLat = (lat2-lat1)*Math.PI/180;
  const dLon = (lon2-lon1)*Math.PI/180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  const c = 2*Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R*c;
}
function escapeHtml(s){ return String(s).replace(/[&<>"']/g, function(m){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]}) }

// Notifications: three times a day (while page open). For background push, use FCM server integration (instructions in About page)
const notifyTimes = ['09:00','14:00','20:00']; // default times
let notifEnabled = false;
async function askNotifyPermission(){
  if(!('Notification' in window)){
    alert('Notifications not supported in this browser.');
    return;
  }
  const perm = await Notification.requestPermission();
  if(perm === 'granted'){
    notifEnabled = true;
    scheduleTodayNotifications();
    alert('Notifications enabled. You will receive reminders while the app is open.');
  } else {
    alert('Notifications denied. Please allow notifications to receive reminders.');
  }
}
function scheduleTodayNotifications(){
  if(!notifEnabled) return;
  const now = new Date();
  for(const t of notifyTimes){
    const [h,m] = t.split(':').map(Number);
    const dt = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0);
    if(dt > now){
      const delay = dt.getTime() - now.getTime();
      setTimeout(()=>showNotification('STAR Reminder','Check symptoms, stay protected from scrub typhus.'), delay);
    }
  }
}
function showNotification(title, body){
  if(Notification.permission === 'granted'){
    navigator.serviceWorker?.getRegistration().then(reg=>{
      if(reg && reg.showNotification){
        reg.showNotification(title, {body, icon: 'icon.png', tag: 'star-rem'});
      } else {
        new Notification(title, {body, icon: 'icon.png'});
      }
    });
  }
}

// Ask permission on load softly
window.addEventListener('load', ()=>{
  // Add a floating button to enable notifications
  const btn = document.createElement('button');
  btn.className='btn btn-sm btn-outline-primary position-fixed';
  btn.style.right='12px'; btn.style.bottom='12px'; btn.innerText='Enable Reminders';
  btn.onclick = askNotifyPermission;
  document.body.appendChild(btn);
  // register service worker
  if('serviceWorker' in navigator){
    navigator.serviceWorker.register('sw.js').catch(()=>{});
  }
  // schedule if already granted
  if(Notification.permission === 'granted'){ notifEnabled = true; scheduleTodayNotifications(); }
});
 
function toggleMenu() {
    document.getElementById("navLinks").classList.toggle("show");
}
 

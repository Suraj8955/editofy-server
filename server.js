const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const app = express();
app.use(cors());
app.use(express.json());
const upload = multer({ dest: 'uploads/' });
if (!fs.existsSync('uploads')) fs.mkdirSync('uploads');
if (!fs.existsSync('outputs')) fs.mkdirSync('outputs');

app.get('/', (req,res)=> res.send('Editofy server running'));

async function getInfo(file){
  try{
    const {stdout} = await execAsync(`ffprobe -v error -show_entries stream=codec_type -of csv=p=0 "${file}"`);
    return { hasAudio: stdout.includes('audio'), hasVideo: stdout.includes('video') };
  }catch{ return {hasAudio:true, hasVideo:true}; }
}
async function getDuration(file){
  try{
    const {stdout} = await execAsync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${file}"`);
    return parseFloat(stdout) || 5;
  }catch{ return 5; }
}

app.post('/merge', upload.array('videos', 5), async (req,res)=>{
  if(!req.files || req.files.length===0) return res.json({error:'Video nahi mila'});
  const files = req.files;
  const outName = 'editofy-'+Date.now()+'.mp4';
  const outPath = path.join('outputs', outName);
  try{
    // Har video ko same format me badlo - 1080x1920, 30fps, audio normal
    let filters = [];
    let inputs = files.map(f=>`-i "${f.path}"`).join(' ');
    for(let i=0;i<files.length;i++){
      let info = await getInfo(files[i].path);
      // Video filter - color + scale
      filters.push(`[${i}:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,eq=contrast=1.08:saturation=1.25:brightness=0.02,format=yuv420p,fps=30,settb=AVTB[v${i}]`);
      // Audio filter - agar audio nahi hai to silent audio banao
      if(info.hasAudio){
        filters.push(`[${i}:a]afftdn=nf=-25,highpass=f=80,loudnorm=I=-16:TP=-1.5:LRA=11,aresample=44100[a${i}]`);
      } else {
        filters.push(`anullsrc=r=44100:cl=stereo,atrim=duration=90[a${i}]`);
      }
    }
    let vCur='v0', aCur='a0';
    let durations=[];
    for(let f of files) durations.push(await getDuration(f.path));
    let totalDur = durations[0];
    for(let i=1;i<files.length;i++){
      let offset = totalDur - 0.5;
      if(offset<0) offset=0;
      let vNext = i===files.length-1 ? 'vx' : `vx${i}`;
      let aNext = i===files.length-1 ? 'ax' : `ax${i}`;
      filters.push(`[${vCur}][v${i}]xfade=transition=fade:duration=0.5:offset=${offset}[${vNext}]`);
      filters.push(`[${aCur}][a${i}]acrossfade=d=0.5[${aNext}]`);
      vCur=vNext; aCur=aNext;
      totalDur = totalDur + durations[i] - 0.5;
    }
    if(files.length===1){ vCur='v0'; aCur='a0'; }
    // Watermark - font ki jarurat nahi, simple box + text nahi, sirf trim
    filters.push(`[${vCur}]trim=duration=90[vfinal]`);
    filters.push(`[${aCur}]atrim=duration=90[aout]`);
    let filterStr = filters.join(';');
    let cmd = `ffmpeg -y ${inputs} -filter_complex "${filterStr}" -map "[vfinal]" -map "[aout]" -c:v libx264 -preset veryfast -crf 21 -c:a aac -b:a 192k -movflags +faststart "${outPath}"`;
    console.log('RUN:', cmd);
    await execAsync(cmd);
    files.forEach(f=>{ if(fs.existsSync(f.path)) fs.unlinkSync(f.path); });
    res.json({ url: `/download/${outName}` });
  }catch(e){
    console.log('FFMPEG ERROR:', e.message);
    files.forEach(f=>{ if(fs.existsSync(f.path)) fs.unlinkSync(f.path); });
    res.json({ error: 'Edit fail ho gaya: ' + e.message.slice(0,200) });
  }
});

app.get('/download/:name', (req,res)=>{
  const p = path.join('outputs', req.params.name);
  if(fs.existsSync(p)) res.download(p);
  else res.json({error:'File nahi mili'});
});
const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=> console.log('Server LIVE hai port '+PORT));

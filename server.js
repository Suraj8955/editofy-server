const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const app = express();
app.use(cors());
app.use('/outputs', express.static(path.join(__dirname,'outputs')));
const upload = multer({ dest: 'uploads/', limits:{fileSize:200*1024*1024} });
if(!fs.existsSync('uploads')) fs.mkdirSync('uploads');
if(!fs.existsSync('outputs')) fs.mkdirSync('outputs');
app.get('/',(req,res)=>res.send('Editofy server running'));

app.post('/merge', upload.array('videos',5), (req,res)=>{
  if(!req.files || req.files.length===0) return res.json({error:'No video'});
  const files = req.files;
  const outName = 'reel-'+Date.now()+'.mp4';
  const outPath = path.join('outputs', outName);
  let filter = '';
  let inputs = [];
  files.forEach((f,i)=>{
    inputs.push('-i', f.path);
    // Video: 1080x1920, 30fps, cinematic color
    filter += `[${i}:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,format=yuv420p,fps=30,eq=contrast=1.08:saturation=1.15:brightness=0.02,settb=AVTB,setsar=1[v${i}];`;
    // Audio: clean + same level
    filter += `[${i}:a]aresample=44100,highpass=f=80,lowpass=f=12000,volume=1.0,apad,atrim=0:90[a${i}];`;
  });
  let concatInputs = '';
  files.forEach((f,i)=>{ concatInputs += `[v${i}][a${i}]`; });
  filter += `${concatInputs}concat=n=${files.length}:v=1:a=1[vout][aout]`;
  filter = filter.slice(0,-1); // last ; already handled? keep as is
  // Actually rebuild correctly:
  // Rebuild filter without trailing issues
  let vFilters = '';
  let aFilters = '';
  files.forEach((f,i)=>{
    vFilters += `[${i}:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,format=yuv420p,fps=30,eq=contrast=1.08:saturation=1.15:brightness=0.02,settb=AVTB,setsar=1[v${i}];`;
    aFilters += `[${i}:a]aresample=44100,highpass=f=80,lowpass=f=12000,volume=1.0,apad,atrim=0:90[a${i}];`;
  });
  let cIn = '';
  files.forEach((f,i)=>{ cIn += `[v${i}][a${i}]`; });
  const finalFilter = vFilters + aFilters + `${cIn}concat=n=${files.length}:v=1:a=1[vout][aout]`;

  const args = [...inputs, '-filter_complex', finalFilter, '-map','[vout]','-map','[aout]','-t','90','-c:v','libx264','-preset','veryfast','-crf','23','-c:a','aac','-b:a','128k','-movflags','+faststart','-y', outPath];

  const ff = spawn('ffmpeg', args);
  let errLog='';
  ff.stderr.on('data', d=>{ errLog += d.toString(); });
  ff.on('close', (code)=>{
    files.forEach(f=>{ try{fs.unlinkSync(f.path)}catch(e){} });
    if(code!==0){
      console.log(errLog.slice(-2000));
      return res.json({error:'Edit fail: '+errLog.slice(-500)});
    }
    res.json({url:'/outputs/'+outName});
  });
});
const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=>console.log('Running '+PORT));

const express=require('express');
const multer=require('multer');
const {exec}=require('child_process');
const fs=require('fs');
const path=require('path');
const app=express();
app.use(require('cors')());
app.use(express.json());
app.use(express.static('.'));
const upload=multer({dest:'uploads/', limits:{fileSize:200*1024*1024}});
app.get('/',(req,res)=>res.send('Editofy server running'));
app.post('/merge',upload.array('videos'),(req,res)=>{
  const files=req.files.map(f=>f.path);
  const list='list.txt';
  fs.writeFileSync(list,files.map(f=>`file '${path.resolve(f)}'`).join('\n'));
  const joined='joined_'+Date.now()+'.mp4';
  const out='output_'+Date.now()+'.mp4';
  // Step 1: Join + 90 Sec tak kaat do, chahe video kitna bhi bada ho
  exec(`ffmpeg -f concat -safe 0 -i ${list} -t 90 -c copy ${joined}`,(err1)=>{
    if(err1) return res.status(500).send('join error');
    // Step 2: PRO - 1080p + Color + Voice Clean + Watermark - ULTRAFAST taaki bada video bhi na atke
    const vf="scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,eq=contrast=1.08:brightness=0.02:saturation=1.15,drawtext=text='Editofy':x=w-130:y=h-50:fontsize=28:fontcolor=white@0.8:box=1:boxcolor=black@0.4";
    const af="highpass=f=80,loudnorm=I=-14:TP=-1:LRA=11";
    const cmd=`ffmpeg -i ${joined} -vf "${vf}" -af "${af}" -c:v libx264 -preset ultrafast -crf 28 -c:a aac -b:a 128k -movflags +faststart -threads 2 ${out}`;
    exec(cmd,{maxBuffer:1024*1024*50},(err2)=>{
      files.forEach(f=>{try{fs.unlinkSync(f)}catch(e){}});
      try{fs.unlinkSync(list)}catch(e){}; try{fs.unlinkSync(joined)}catch(e){};
      if(err2) return res.status(500).send('filter error');
      res.download(out,()=>{try{fs.unlinkSync(out)}catch(e){}});
    });
  });
});
app.listen(process.env.PORT||3000);

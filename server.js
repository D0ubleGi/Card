
const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const { type } = require('os');
const { buffer } = require('stream/consumers');
const axios = require("axios");
const AWS = require('aws-sdk');
const { stringify } = require('querystring');
const { idText } = require('typescript');
const { SocketAddress } = require('net');
require('dotenv').config({ path: './.env' });


const app = express();
const server = http.createServer(app);

const MONGO_URI = process.env.MONGO_URI || 'your-backup-uri-here';
const PORT = process.env.PORT || 3000;

console.log("📦 MONGO_URI is:", MONGO_URI);

mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 5000 })
  .then(() => console.log('✅ Connected to MongoDB'))
  .catch((err) => {
    console.error('❌ MongoDB connection error:', err.message);
    process.exit(1);
  });

const userSchema = new mongoose.Schema({
  user: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true }
}, { timestamps: true });
const Usernames = mongoose.model('Usernames', userSchema);

const Room = new mongoose.Schema({
  Pairid: {type: String, required: true },
  Opponentid: {type: String, required:true},
  Creator: {type: String, required:true},
  Player1: {type: String, required:false},
  Player2: {type: String, required:false},
  Player3: {type: String, required:false},
  Player4: {type: String, required:false},
  Status: {type: String, required:true},
  Deck: {type:[String], required:false},
  Playercount: {type: String, required:true}}, {timestamps: true});
  const Rooms = mongoose.model('Rooms',Room);

const DeckSchema = new mongoose.Schema({
  Id: { type: String, required: true },

  Deck: { type: [String], default: [] }, 

  P1: { type: [String], default: [] },
  P2: { type: [String], default: [] },
  P3: { type: [String], default: [] },
  P4: { type: [String], default: [] },
  Turn: {type: String,required:false},
  Trump: {type: String, required:false}
}, { timestamps: true }); 

const Decks = mongoose.model('Decks', DeckSchema);



app.use(cors({
  origin: '*',
  methods: ['GET', 'POST'],
  credentials: true
}));

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
    credentials: true
  },
  transports: ['websocket', 'polling'],
  pingTimeout: 200000,
  pingInterval: 30000,
  maxHttpBufferSize: 1e8  
});

let soketi = null;
io.on('connection', async (socket) => {

  console.log('🟢 New user connected:', socket.id);
  socket.on('disconnect', async() => {
    console.log('🔴 User disconnected:', socket.id);
    if(!socket.userid){return;}
    const ha = await Rooms.findOne({Player1:socket.userid});
    if(ha){
      if(ha.Status!=='started'){
      await Rooms.deleteOne({Player1:socket.userid});
      }
    
      await Rooms.updateOne(
  { Player2: socket.userid },
  { $set: { Player2: "", Playercount: ha.Playercount - 1 } }
);
    await Rooms.updateOne(
  { Player3: socket.userid },
  { $set: { Player2: "", Playercount: ha.Playercount - 1 } }
);
      await Rooms.updateOne(
  { Player4: socket.userid },
  { $set: { Player2: "", Playercount: ha.Playercount - 1 } }
);
}
  });

  soketi=socket.id;

socket.on('register',async(username,email,password)=>{

    const chk = await Usernames.findOne({user:username});
    const cki = await Usernames.findOne({email:email});

    let resp = '';
    if(chk){
        resp+='a';
    }
    if(cki){
        resp+='b';
    }

if (resp === '') {
  try {
    const user = new Usernames({ user: username, email, password });
    await user.save();
    console.log('User saved successfully');
    socket.emit('response',resp);
  } catch (err) {
    console.error('Error saving user:', err);
  }
}
else{
    socket.emit('response',resp);
}

});

socket.on('signin',async(username,password)=>{

  let resp = '';

const ca = await Usernames.findOne({user:username,password:password});

if(ca){
  console.log(`User ${username} logged!`);
  socket.emit('signed',resp);
  socket.userid=username;
}
else{
  const ha = await Usernames.findOne({user:username});
  const ta = await Usernames.findOne({password:password});

  if(!ha && !ta){
    resp='ab';
  }
  if(!ha && ta){
    resp='a';
  }
  if(ha && !ta){
    resp='b';
  }

  socket.emit('signed',resp);
}

});

socket.on('createroom', async (pairid,opid,user,status)=>{

const a = await Rooms.findOne({Pairid:pairid});

if(!a){
try{
  const crt = new Rooms({
    Pairid:pairid,
    Opponentid:opid,
    Creator:user,
    Player1:user,
    Status:status,
    Playercount:1
  });
  await crt.save();
  console.log(`${user} added new room!`);
  const ha = await Rooms.findOne({Pairid:pairid});
  socket.emit('roomadded',ha);
} catch (err) {
    console.error('Error saving user:', err);
  }
}

});

socket.on('leave',async (user,id)=>{

  const ha = await Rooms.findOne({Creator:user,Pairid:id,Status:'stopped'});
console.log(user);
  if(ha){
    await Rooms.deleteOne({Creator:user});
    console.log(`${user} room deleted!`);
  }
  else{
   const a=  await Rooms.updateOne(
  { Player2: user,Pairid:id },
  { $set: { Player2: "" } }
);
    const b= await Rooms.updateOne(
  { Player3: user,Pairid:id },
  { $set: { Player3: "" }}
);
    const c= await Rooms.updateOne(
  { Player4: user,Pairid:id },
  { $set: { Player4: "" }}
);
if(a.modifiedCount>0 || b.modifiedCount>0 || c.modifiedCount>0){
  const haia = await Rooms.findOne({Pairid:id});
  io.to(haia.Pairid).emit('loadedroom',haia);
}
  }

});

socket.on('joinroom',async (id,user)=>{


 const ha = await Rooms.findOne({Pairid:id});
 const hu = await Rooms.findOne({Opponentid:id});

 if(!ha && !hu){
  socket.emit('respi','none');
  return;
 }

 if(ha){
  if(!ha.Player3){
  const a = await Rooms.updateOne(
  { Pairid: id },       
  { $set: { Player3: user } } 
);
socket.join(ha.Pairid);
    const haa = await Rooms.findOne({Pairid:id});

if(haa.Player1 && haa.Player2 && haa.Player3 && haa.Player4){
socket.emit('starts',haa.Pairid);
return;
}
socket.emit('respi',id);

  }
  else{
    socket.emit('respi','full');
  }
  return;
 }
 if(hu){
  if(!hu.Player2){
     await Rooms.updateOne(
  { Opponentid: id },       
  { $set: { Player2: user } } 
);
socket.join(id.slice(0, -1));    
const huu = await Rooms.findOne({Opponentid:id});
if(huu.Player1 && huu.Player2 && huu.Player3 && huu.Player4){

socket.emit('starts',huu.Pairid);
return;
}
socket.emit('respi',id.slice(0,-1));
return;
  }
  else if(!hu.Player4){
    await Rooms.updateOne(
  { Opponentid: id },       
  { $set: { Player4: user } } 
);
socket.join(id.slice(0, -1));  
const huuu = await Rooms.findOne({Opponentid:id});
if(huuu.Player1 && huuu.Player2 && huuu.Player3 && huuu.Player4){

socket.emit('starts',huuu.Pairid);
return;
}
socket.emit('respi',id.slice(0,-1));
return;
  }
  else{
    socket.emit('respi',"full");
  }
 }

});

socket.on('starti',async (id)=>{

  const ha = await Rooms.findOne({Pairid:id});

  io.to(id).emit('start',ha);

});


socket.on('loadroom',async(id)=>{

  let haia;

  if(id.length==6){
     haia = await Rooms.findOne({Pairid:id});
  }
  if(id.length==7){
     haia = await Rooms.findOne({Opponentid:id});
  }

  let ids = '';

  for(let j=0;j<6;j++){
    ids+=id[j];
  }

  socket.join(ids);

  io.to(ids).emit('loadedroom',haia);

});

socket.on('setdeck',async(id,deck,turn,user)=>{

let player1=[];
let player2=[];
let player3=[];
let player4=[];

const hs = await Rooms.findOne({Pairid:id});


for (let j = 0; j < 5; j++) {
  player1.push(deck.shift());
}
for (let j = 0; j < 5; j++) {
  player2.push(deck.shift());
}
for (let j = 0; j < 5; j++) {
  player3.push(deck.shift());
}
for (let j = 0; j < 5; j++) {
  player4.push(deck.shift());
}
  const t = deck[deck.length-1];
const a = await Decks.findOne({Id:id});
if(!a){
  const d = new Decks({
    Id:id,
    Deck:deck,
    P1:player1,
    P2:player2,
    P3:player3,
    P4:player4,
    Trump:t
  });
  await d.save();
}
else{
  await Decks.updateOne(
    {Id:id},
    {$set:{Deck:deck,
      P1:player1,
      P2:player2,
      P3:player3,
      P4:player4,
      Trump:t
    }}
  )
}

console.log('emitted');

});

socket.on('setneww',(id,arr,user)=>{
io.to(id).emit('setebi',id,arr,user);
});

socket.on('setnewd',async(id,arr,user,us)=>{

  const players = await Rooms.findOne({Pairid:id});

  const Deck = await Decks.findOne({Id:id});

  let decki = Deck.Deck;

  let Players1=[];
  let players2=[];
  let players3=[];
  let players4=[];

  const pls1 = arr;
  
  console.log(pls1);

  let nam = 0;

  for(let j=0;j<pls1;j++){
    if(decki.length!=0){
    Players1.push(decki.shift()); 
    players2.push(decki.shift());
    players3.push(decki.shift());    
    players4.push(decki.shift());
    nam++;
    }
    if(decki.length<4){
      io.to(id).emit('washale');
    }
  }

  await Decks.updateOne(
    {Id:id},
    {$set: {Deck:decki}}
  );

    const p1 = await Rooms.findOne({Pairid:id, Player1:user});
    const p2 = await Rooms.findOne({Pairid:id,Player2:user});
    const p3 = await Rooms.findOne({Pairid:id,Player3:user});
    const p4 = await Rooms.findOne({Pairid:id,Player4:user});

    if(p1){
      socket.emit('setnew',id,Players1,nam,us);
      return;
    }
    if(p2){
      socket.emit('setnew',id,players2,nam,us);
      return;
    }
    if(p3){
      socket.emit('setnew',id,players3,nam,us);
      return;
    }
    if(p4){
      socket.emit('setnew',id,players4,nam,us);
      return;
    }

});

socket.on('getd',async (id,user,turn)=>{

  

  const has = await Decks.findOne({Id:id});
  if(has){
  if(!has.Turn){
  const h = await Decks.updateOne(
        {Id:id},
        {$set : {Turn:turn}}
      );
     
  }
}
  const ha = await Decks.findOne({Id:id});
  const hu = await Rooms.findOne({Pairid:id}); 

  if(ha && hu){
    
    const p1 = await Rooms.findOne({Pairid:id, Player1:user});
    const p2 = await Rooms.findOne({Pairid:id,Player2:user});
    const p3 = await Rooms.findOne({Pairid:id,Player3:user});
    const p4 = await Rooms.findOne({Pairid:id,Player4:user});
    
    const val = ha.Trump;

    console.log(user,val,"jdsai");
    console.log(ha.Turn,'as');

    if(p1){
      socket.emit('seted',ha.P1,ha.Turn,val);
      return;
    }
    if(p2){
      socket.emit('seted',ha.P2,ha.Turn,val);
      return;
    }
    if(p3){
      socket.emit('seted',ha.P3,ha.Turn,val);
      return;
    }
    if(p4){
      socket.emit('seted',ha.P4,ha.Turn,val);
      return;
    }

  }

  socket.on('turni',async(id,turn)=>{

     

  });

});

socket.on('mademove',async (id,user,next,move,num)=>{
  const ha = await Decks.findOne({Id:id});
io.to(id).emit('mademv',id,user,ha,move,next,num);
console.log(id);
});

socket.on('mogeba',(id,winner,points,point)=>{

  io.to(id).emit('moige',winner,points,point);

});

socket.on('gadaveba',(id,user,enemy1,enemy2,x)=>{

  io.to(id).emit("gaadava",user,enemy1,enemy2,x);

});

socket.on('tanxmoba',(id,user,ans,c)=>{

  io.to(id).emit('datanxmda',user,ans,c);

});

socket.on('won',(id,team,enemy,user,po)=>{

  io.to(id).emit('woni',team,enemy,user,po);

});

socket.on('winni',(id,win,po)=>{

  io.to(id).emit('winns',win,po);

});

socket.on('wiwio',async (id,winner,team,enemy)=>{

  io.to(id).emit('wiwi1',winner,team,enemy);

  await Rooms.deleteOne({Pairid:id});

});

socket.on('setnu',(id,user)=>{
io.to(id).emit('ss',user);
});

socket.on('qeni',(id)=>{
io.to(id).emit('qna',id);
});

socket.on('sds',(id,user,kids)=>{

  io.to(id).emit('dsd',id,user,kids);

});

});
server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
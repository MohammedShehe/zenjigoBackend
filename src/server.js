const http=require('http'); const app=require('./app'); const config=require('./config/env'); const db=require('./config/db'); const {init}=require('./sockets');
const server=http.createServer(app); const io=init(server);
async function start(){await db.health();server.listen(config.port,()=>console.log(`ZenjiGO API listening on http://localhost:${config.port}${config.apiPrefix}`));}
async function shutdown(signal){console.log(`${signal}: shutting down`);await db.pool.end();server.close(()=>process.exit(0));setTimeout(()=>process.exit(1),10000).unref();}
process.on('SIGTERM',()=>shutdown('SIGTERM'));process.on('SIGINT',()=>shutdown('SIGINT'));
start().catch(e=>{console.error('Startup failed:',e);process.exit(1);});
module.exports={server,io};
